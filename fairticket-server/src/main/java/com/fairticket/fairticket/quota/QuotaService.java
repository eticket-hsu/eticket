package com.fairticket.fairticket.quota;

import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 예매처 간 공통 구매 한도.
 *
 * 원칙 (설계 문서 확정 사항)
 * - 한도는 한 사람이 지금 쥐고 있는 티켓 기준: 확정 + 아직 유효한 예약
 * - 한도 값은 발행처가 정하고, 예매처마다 다르면 가장 작은 값
 * - 결제 실패·환불은 즉시 반환, 반환하지 못한 예약은 예매처의 결제 제한 시간이 지나면 자동 반환
 * - 재판매로 산 티켓도 포함, 판매자는 재발급 완료 시 반환
 *
 * 동시성: 같은 사람·공연에 대한 "합계 확인 + 예약 생성"을 하나의 잠금 안에서 처리하고,
 * 트랜잭션도 잠금 안에서 커밋한다. (서버 1대 기준. 여러 대면 DB 행 잠금으로 바꾼다)
 */
@Service
public class QuotaService {

	private static final List<QuotaReservation.Status> ACTIVE = List.of(QuotaReservation.Status.HELD,
			QuotaReservation.Status.CONFIRMED);

	private final QuotaReservationRepository reservations;
	private final PerformanceLimitRepository limits;
	private final TransactionTemplate tx;
	private final ConcurrentHashMap<String, Object> locks = new ConcurrentHashMap<>();

	public QuotaService(QuotaReservationRepository reservations, PerformanceLimitRepository limits,
			PlatformTransactionManager txManager) {
		this.reservations = reservations;
		this.limits = limits;
		this.tx = new TransactionTemplate(txManager);
		// 재판매 처리 트랜잭션 안에서 불려도 잠금 안에서 바로 커밋되도록 항상 별도 트랜잭션
		this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
	}

	public record Usage(String uid, String performanceCode, int used, Integer limit) {
		public boolean full() {
			return limit != null && used >= limit;
		}
	}

	/** 한도 칸을 잡는다. 넘으면 QuotaExceededException. limit 이 null 이면 이미 알려진 한도를 쓴다. */
	public QuotaReservation reserve(String uid, String performanceCode, String vendorId, int qty, Integer limit,
			int holdMinutes, String source, String ref) {
		if (qty < 1) {
			throw new IllegalArgumentException("매수는 1 이상이어야 합니다");
		}
		synchronized (lockFor(uid, performanceCode)) {
			return tx.execute(s -> {
				if (limit != null) {
					registerLimit(performanceCode, vendorId, limit);
				}
				Usage u = usageInTx(uid, performanceCode);
				if (u.limit() != null && u.used() + qty > u.limit()) {
					throw new QuotaExceededException(u.used(), u.limit());
				}
				return reservations.save(new QuotaReservation(uid, performanceCode, vendorId, qty, source, ref,
						LocalDateTime.now().plusMinutes(Math.max(1, holdMinutes))));
			});
		}
	}

	public QuotaReservation confirm(Long id, String ref) {
		return tx.execute(s -> {
			QuotaReservation r = get(id);
			r.confirm(ref);
			return r;
		});
	}

	public QuotaReservation release(Long id) {
		return tx.execute(s -> {
			QuotaReservation r = get(id);
			r.release();
			return r;
		});
	}

	/** 재판매 완료: 판매자가 그 티켓으로 차지하던 칸을 반환 */
	public void releaseTicketOf(String uid, String ref) {
		tx.executeWithoutResult(s -> reservations
			.findFirstByUidAndRefAndStatus(uid, ref, QuotaReservation.Status.CONFIRMED)
			.ifPresent(QuotaReservation::release));
	}

	/** 이 사람이 이 공연에서 지금 갖고 있는 표 ("예매처:티켓번호"). 발급이 확정된 것만 */
	public List<String> heldTickets(String uid, String performanceCode) {
		return tx.execute(s -> reservations
			.findByUidAndPerformanceCodeAndStatusIn(uid, performanceCode, List.of(QuotaReservation.Status.CONFIRMED))
			.stream()
			.map(QuotaReservation::getRef)
			.filter(ref -> ref != null && ref.contains(":"))
			.toList());
	}

	public Usage usage(String uid, String performanceCode) {
		return tx.execute(s -> usageInTx(uid, performanceCode));
	}

	public List<QuotaReservation> recent() {
		return reservations.findTop100ByOrderByIdDesc();
	}

	/** 만료된 예약을 반환 상태로 정리 (계산에는 이미 빠져 있고, 기록을 맞추는 용도) */
	@Scheduled(fixedDelay = 30_000)
	public void sweepExpired() {
		tx.executeWithoutResult(s -> reservations
			.findByStatusAndExpiresAtBefore(QuotaReservation.Status.HELD, LocalDateTime.now())
			.forEach(QuotaReservation::release));
	}

	private Usage usageInTx(String uid, String performanceCode) {
		LocalDateTime now = LocalDateTime.now();
		int used = reservations.findByUidAndPerformanceCodeAndStatusIn(uid, performanceCode, ACTIVE)
			.stream()
			.filter(r -> r.isCounting(now))
			.mapToInt(QuotaReservation::getQty)
			.sum();
		Integer limit = limits.findByPerformanceCode(performanceCode)
			.stream()
			.map(PerformanceLimit::getPerUser)
			.min(Integer::compare)
			.orElse(null);
		return new Usage(uid, performanceCode, used, limit);
	}

	private void registerLimit(String performanceCode, String vendorId, int perUser) {
		limits.findByPerformanceCodeAndVendorId(performanceCode, vendorId)
			.ifPresentOrElse(l -> l.setPerUser(perUser),
					() -> limits.save(new PerformanceLimit(performanceCode, vendorId, perUser)));
	}

	/** 이 예약을 잡은 예매처 */
	public String vendorOf(Long id) {
		return get(id).getVendorId();
	}

	private QuotaReservation get(Long id) {
		return reservations.findById(id).orElseThrow(() -> new NoSuchElementException("예약 없음: " + id));
	}

	private Object lockFor(String uid, String performanceCode) {
		return locks.computeIfAbsent(uid + "|" + performanceCode, k -> new Object());
	}
}
