package com.eticket.vendor.domain;

/** 입장 검증 결과. QR 확인 화면에 그대로 표시된다. */
public enum AdmitResult {
	ADMITTED("입장 승인"),
	ALREADY_USED("이미 사용된 티켓"),
	RESALE_LOCKED("재판매 진행 중인 티켓"),
	OUTDATED_VERSION("재발급으로 무효가 된 티켓"),
	EXPIRED_QR("만료된 QR (화면 캡처 의심)"),
	VOIDED("무효 처리된 티켓"),
	FRAUD_CANCELLED("부정 구매로 취소된 티켓"),
	INVALID_SIGNATURE("위조 의심 QR"),
	WRONG_VENDOR("다른 발행처의 QR"),
	NOT_FOUND("존재하지 않는 티켓");

	private final String message;

	AdmitResult(String message) {
		this.message = message;
	}

	public String getMessage() {
		return message;
	}
}
