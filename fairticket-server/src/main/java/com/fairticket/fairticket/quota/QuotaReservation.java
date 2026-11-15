package com.fairticket.fairticket.quota;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * 공통 구매 한도의 한 칸. 결제 전에 잡아 두고(HELD), 발급되면 확정(CONFIRMED),
 * 결제 실패·환불·재판매 완료 시 반환(RELEASED)한다.
 */
@Entity
@Table(indexes = { @Index(columnList = "uid,performanceCode,status"), @Index(columnList = "ref") })
public class QuotaReservation {

	public enum Status {
		HELD, CONFIRMED, RELEASED
	}

	@Id
	@GeneratedValue
	private Long id;

	private String uid;

	private String performanceCode;

	private String vendorId;

	private int qty;

	@Enumerated(EnumType.STRING)
	private Status status = Status.HELD;

	/** 일반 구매 PURCHASE / 공식 재판매 RESALE */
	private String source;

	/** 확정된 티켓 참조 "{발행처}:{티켓ID}" (재판매 완료 시 판매자 칸을 찾는 데 쓴다) */
	private String ref;

	/** 이 시각까지 확정되지 않으면 자동 반환된 것으로 본다 */
	private LocalDateTime expiresAt;

	private LocalDateTime createdAt = LocalDateTime.now();

	protected QuotaReservation() {
	}

	public QuotaReservation(String uid, String performanceCode, String vendorId, int qty, String source, String ref,
			LocalDateTime expiresAt) {
		this.uid = uid;
		this.performanceCode = performanceCode;
		this.vendorId = vendorId;
		this.qty = qty;
		this.source = source;
		this.ref = ref;
		this.expiresAt = expiresAt;
	}

	/** 지금 한도를 차지하고 있는가 */
	public boolean isCounting(LocalDateTime now) {
		return status == Status.CONFIRMED || (status == Status.HELD && expiresAt.isAfter(now));
	}

	void confirm(String ref) {
		if (status == Status.CONFIRMED) {
			return; // 멱등
		}
		if (status != Status.HELD || !expiresAt.isAfter(LocalDateTime.now())) {
			throw new IllegalStateException("이미 반환되었거나 만료된 예약입니다");
		}
		status = Status.CONFIRMED;
		if (ref != null) {
			this.ref = ref;
		}
	}

	void release() {
		status = Status.RELEASED;
	}

	public Long getId() {
		return id;
	}

	public String getUid() {
		return uid;
	}

	public String getPerformanceCode() {
		return performanceCode;
	}

	public String getVendorId() {
		return vendorId;
	}

	public int getQty() {
		return qty;
	}

	public Status getStatus() {
		return status;
	}

	public String getSource() {
		return source;
	}

	public String getRef() {
		return ref;
	}

	public LocalDateTime getExpiresAt() {
		return expiresAt;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
