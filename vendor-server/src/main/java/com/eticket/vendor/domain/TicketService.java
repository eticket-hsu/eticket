package com.eticket.vendor.domain;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.eticket.vendor.config.VendorProperties;

/** 발행처 권한(발급·잠금·복원·재발급·입장)을 모두 여기서 처리한다. */
@Service
@Transactional
public class TicketService {

	private final TicketRepository tickets;
	private final MemberRepository members;
	private final PerformanceRepository performances;
	private final QrCodec qrCodec;
	private final VendorProperties props;

	public TicketService(TicketRepository tickets, MemberRepository members, PerformanceRepository performances,
			QrCodec qrCodec, VendorProperties props) {
		this.tickets = tickets;
		this.members = members;
		this.performances = performances;
		this.qrCodec = qrCodec;
		this.props = props;
	}

	/**
	 * 일반 구매. 결제는 가상으로 즉시 성공 처리한다.
	 * seat 가 없으면 앞 열부터 빈 좌석을 배정한다. 같은 좌석 동시 구매는 DB 유니크 제약이 막는다.
	 */
	public Ticket purchase(Long performanceId, Long memberId, String seat) {
		Performance perf = performances.findById(performanceId)
			.orElseThrow(() -> new NoSuchElementException("공연 없음: " + performanceId));
		Member member = members.findById(memberId)
			.orElseThrow(() -> new NoSuchElementException("회원 없음: " + memberId));
		if (tickets.countByPerformanceIdAndOwnerId(performanceId, memberId) >= perf.getPerUserLimit()) {
			throw new IllegalStateException("1인당 구매 한도(" + perf.getPerUserLimit() + "매)를 넘었습니다");
		}
		Set<String> taken = takenSeats(performanceId);
		if (seat == null || seat.isBlank()) {
			seat = allSeats(perf).stream()
				.filter(s -> !taken.contains(s))
				.findFirst()
				.orElseThrow(() -> new IllegalStateException("매진되었습니다"));
		}
		else if (!allSeats(perf).contains(seat)) {
			throw new IllegalArgumentException("이 예매처에서 판매하지 않는 좌석입니다: " + seat);
		}
		else if (taken.contains(seat)) {
			throw new IllegalStateException("이미 판매된 좌석입니다: " + seat);
		}
		return tickets.saveAndFlush(new Ticket(perf, member, seat, perf.getPrice()));
	}

	/** 이 예매처가 파는 좌석 전체 ("A-1" ~ "E-10") */
	@Transactional(readOnly = true)
	public List<String> allSeats(Performance perf) {
		List<String> seats = new ArrayList<>();
		for (char row : props.seatRows().toCharArray()) {
			for (int n = 1; n <= perf.getSeatsPerRow(); n++) {
				seats.add(row + "-" + n);
			}
		}
		return seats;
	}

	@Transactional(readOnly = true)
	public Set<String> takenSeats(Long performanceId) {
		return tickets.findByPerformanceId(performanceId)
			.stream()
			.map(Ticket::getSeat)
			.collect(Collectors.toSet());
	}

	@Transactional(readOnly = true)
	public Ticket get(Long ticketId) {
		return tickets.findById(ticketId).orElseThrow(() -> new NoSuchElementException("티켓 없음: " + ticketId));
	}

	// TODO(예외 처리 단계): lock/unlock/reissue 에 Idempotency-Key 처리 추가
	public Ticket lock(Long ticketId) {
		Ticket t = get(ticketId);
		if (!t.getPerformance().isResaleAllowed()) {
			throw new IllegalStateException("재판매가 허용되지 않은 공연입니다");
		}
		t.lock();
		return t;
	}

	public Ticket unlock(Long ticketId) {
		Ticket t = get(ticketId);
		t.unlock();
		return t;
	}

	/** 부정 구매 취소 (발행처 결정). 이후 이 표의 QR 은 입장 검증에서 거절된다 */
	public Ticket cancelForFraud(Long ticketId, String reason) {
		Ticket t = get(ticketId);
		t.cancelForFraud(reason);
		return t;
	}

	public Ticket reissue(Long ticketId, String newOwnerFtUid, Integer acquiredPrice) {
		Ticket t = get(ticketId);
		Member newOwner = members.findByFtUid(newOwnerFtUid)
			.orElseThrow(() -> new NoSuchElementException("이 예매처 회원이 아닙니다: " + newOwnerFtUid));
		t.reissueTo(newOwner, acquiredPrice == null ? t.getFacePrice() : acquiredPrice);
		return t;
	}

	/** 이 기기에서 QR 을 볼 수 있는지 (처음이면 이 기기로 묶음) */
	public boolean bindOrMatch(Long ticketId, String deviceHash) {
		return get(ticketId).bindOrMatch(deviceHash);
	}

	/** 본인인증을 통과한 주인이 다른 기기로 옮김 */
	public Ticket moveToDevice(Long ticketId, Long memberId, String deviceHash) {
		Ticket t = get(ticketId);
		if (!t.getOwner().getId().equals(memberId)) {
			throw new IllegalStateException("티켓 주인만 기기를 옮길 수 있습니다");
		}
		t.moveToDevice(deviceHash);
		return t;
	}

	/** 입장 처리. 승인과 사용 기록은 조건부 업데이트 한 번으로 묶는다. */
	public AdmitResult admit(String qr) {
		QrCodec.Parsed parsed = qrCodec.parse(qr);
		if (parsed == null || !parsed.validSignature()) {
			return AdmitResult.INVALID_SIGNATURE;
		}
		if (!props.id().equals(parsed.vendorId())) {
			return AdmitResult.WRONG_VENDOR;
		}
		Ticket t = tickets.findById(parsed.ticketId()).orElse(null);
		if (t == null) {
			return AdmitResult.NOT_FOUND;
		}
		if (parsed.version() != t.getIssueVersion()) {
			return AdmitResult.OUTDATED_VERSION;
		}
		// 계속 바뀌는 QR: 1분 넘게 지난 QR(화면 캡처·인쇄본)과 시간칸이 없는 예전 고정 QR 은 거절
		if (parsed.window() == null || !QrCodec.fresh(parsed.window())) {
			return AdmitResult.EXPIRED_QR;
		}
		int updated = tickets.admit(t.getId(), parsed.version(), LocalDateTime.now(), TicketStatus.VALID,
				TicketStatus.USED);
		if (updated == 1) {
			return AdmitResult.ADMITTED;
		}
		return switch (get(t.getId()).getStatus()) {
			case USED -> AdmitResult.ALREADY_USED;
			case LOCKED -> AdmitResult.RESALE_LOCKED;
			case VOID -> AdmitResult.VOIDED;
			case FRAUD_CANCELLED -> AdmitResult.FRAUD_CANCELLED;
			case VALID -> AdmitResult.OUTDATED_VERSION; // 그사이 재발급된 경우
		};
	}
}
