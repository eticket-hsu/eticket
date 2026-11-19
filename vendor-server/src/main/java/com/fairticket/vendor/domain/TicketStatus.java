package com.fairticket.vendor.domain;

/** 발행처가 관리하는 티켓 원본 상태. */
public enum TicketStatus {
	/** 입장 가능 */
	VALID,
	/** 재판매 진행 중: 기존 QR 사용 제한 */
	LOCKED,
	/** 입장 완료 */
	USED,
	/** 환불 등으로 무효 */
	VOID,
	/** 부정 구매(매크로·암표)로 발행처가 취소. 입장 불가, 대금은 환불 */
	FRAUD_CANCELLED
}
