package com.fairticket.fairticket.fraud;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/**
 * 부정 구매 취소 기록. 사후 검토에서 찾은 의심 계정의 표를 발행처에 취소 요청한 결과.
 * 예매처가 "부정 구매를 막기 위해 무엇을 했는지" 증빙하는 근거가 된다 (2026 개정 공연법 대응).
 */
@Entity
public class FraudCancellation {

	public enum Result {
		/** 발행처가 취소함. 이 표는 입장 불가 */
		CANCELLED,
		/** 취소하지 못함 (이미 입장, 재판매 진행 중, 발행처 오류 등) */
		FAILED
	}

	@Id
	@GeneratedValue
	private Long id;

	private String performanceCode;

	private String uid;

	private String vendorId;

	private Long vendorTicketId;

	/** 취소 근거: 사후 검토에서 겹친 신호 */
	@Column(length = 500)
	private String reason;

	@Enumerated(EnumType.STRING)
	private Result result;

	@Column(length = 500)
	private String error;

	private LocalDateTime createdAt = LocalDateTime.now();

	protected FraudCancellation() {
	}

	public FraudCancellation(String performanceCode, String uid, String vendorId, Long vendorTicketId, String reason,
			Result result, String error) {
		this.performanceCode = performanceCode;
		this.uid = uid;
		this.vendorId = vendorId;
		this.vendorTicketId = vendorTicketId;
		this.reason = reason;
		this.result = result;
		this.error = error;
	}

	public Long getId() {
		return id;
	}

	public String getPerformanceCode() {
		return performanceCode;
	}

	public String getUid() {
		return uid;
	}

	public String getVendorId() {
		return vendorId;
	}

	public Long getVendorTicketId() {
		return vendorTicketId;
	}

	public String getReason() {
		return reason;
	}

	public Result getResult() {
		return result;
	}

	public String getError() {
		return error;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
