package com.fairticket.vendor.domain;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 티켓 원본. 재발급하면 같은 행에서 소유자가 바뀌고 issueVersion 이 1 오른다.
 * QR 에는 issueVersion 이 들어가므로 이전 버전 QR 은 자동으로 무효가 된다.
 */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = { "performance_id", "seat" }))
public class Ticket {

	@Id
	@GeneratedValue
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY)
	private Performance performance;

	@ManyToOne(fetch = FetchType.LAZY)
	private Member owner;

	private String seat;

	/** 최초 구매가 (정가) */
	private int facePrice;

	/** 현재 소유자가 실제로 지불한 가격. 재판매로 받으면 그 거래 가격이 된다 (거래 가격 추적) */
	private int acquiredPrice;

	private int issueVersion = 1;

	@Enumerated(EnumType.STRING)
	private TicketStatus status = TicketStatus.VALID;

	private LocalDateTime usedAt;

	/** QR 을 볼 수 있는 기기 (기기 ID 해시). 처음 QR 을 연 기기로 묶이고, 본인인증을 해야 다른 기기로 옮겨진다 */
	private String boundDevice;

	/** 다른 기기로 옮긴 횟수. 잦으면 계정 양도 의심 신호 */
	private int deviceChanges;

	/** 부정 구매 취소 사유 (FairTicket 사후 검토 근거) */
	private String cancelReason;

	protected Ticket() {
	}

	public Ticket(Performance performance, Member owner, String seat, int facePrice) {
		this.performance = performance;
		this.owner = owner;
		this.seat = seat;
		this.facePrice = facePrice;
		this.acquiredPrice = facePrice;
	}

	/** 재판매 승인: 기존 QR 사용 제한 */
	public void lock() {
		requireStatus(TicketStatus.VALID);
		this.status = TicketStatus.LOCKED;
	}

	/** 재판매 취소·만료: 원 구매자 사용 권한 복원 */
	public void unlock() {
		requireStatus(TicketStatus.LOCKED);
		this.status = TicketStatus.VALID;
	}

	/** 기존 티켓 무효화 + 새 구매자에게 재발급. 거래 가격이 새 소유자의 취득가가 된다. */
	public void reissueTo(Member newOwner, int acquiredPrice) {
		requireStatus(TicketStatus.LOCKED);
		this.owner = newOwner;
		this.acquiredPrice = acquiredPrice;
		this.issueVersion++;
		this.status = TicketStatus.VALID;
		// 새 주인은 자기 기기에서 처음 QR 을 열 때 다시 묶인다
		this.boundDevice = null;
		this.deviceChanges = 0;
	}

	/** 아직 묶인 기기가 없으면 이 기기로 묶는다. 이 기기에서 QR 을 볼 수 있으면 true */
	public boolean bindOrMatch(String deviceHash) {
		if (deviceHash == null) {
			return false;
		}
		if (boundDevice == null) {
			boundDevice = deviceHash;
			return true;
		}
		return boundDevice.equals(deviceHash);
	}

	/** 본인인증을 거쳐 다른 기기로 옮긴다 */
	public void moveToDevice(String deviceHash) {
		if (!deviceHash.equals(boundDevice)) {
			boundDevice = deviceHash;
			deviceChanges++;
		}
	}

	public int getDeviceChanges() {
		return deviceChanges;
	}

	/**
	 * 부정 구매 취소. 사용 가능한 표만 취소한다.
	 * 재판매 진행 중이면 재판매를 먼저 정리해야 하고, 이미 입장한 표는 취소할 수 없다.
	 */
	public void cancelForFraud(String reason) {
		if (status == TicketStatus.FRAUD_CANCELLED) {
			return;
		}
		requireStatus(TicketStatus.VALID);
		this.status = TicketStatus.FRAUD_CANCELLED;
		this.cancelReason = reason;
	}

	public String getCancelReason() {
		return cancelReason;
	}

	/** 재판매 가격 상한 = min(최초가, 현재 소유자 취득가). 싸게 사서 비싸게 되파는 차익을 막는다. */
	public int resalePriceCap() {
		return Math.min(facePrice, acquiredPrice);
	}

	private void requireStatus(TicketStatus expected) {
		if (status != expected) {
			throw new IllegalStateException("티켓 상태가 " + expected + "가 아닙니다: " + status);
		}
	}

	public Long getId() {
		return id;
	}

	public Performance getPerformance() {
		return performance;
	}

	public Member getOwner() {
		return owner;
	}

	public String getSeat() {
		return seat;
	}

	public int getFacePrice() {
		return facePrice;
	}

	public int getAcquiredPrice() {
		return acquiredPrice;
	}

	public int getIssueVersion() {
		return issueVersion;
	}

	public TicketStatus getStatus() {
		return status;
	}

	public LocalDateTime getUsedAt() {
		return usedAt;
	}
}
