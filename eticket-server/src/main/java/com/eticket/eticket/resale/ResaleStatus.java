package com.eticket.eticket.resale;

import java.util.EnumSet;
import java.util.Set;

/**
 * 재판매 상태 전이. 설계 문서의 다이어그램과 같다.
 * 정상: RESALE_PENDING → LISTED → DRAWN → PAID → REISSUED → SETTLED
 * 예외: CANCELLED, EXPIRED, REISSUE_FAILED (모두 권한 복원 또는 환불로 끝남)
 * 선착순(HYBRID): LISTED → DRAWN(바로 구매한 사람이 당첨자) → PAID ..., 추첨 당첨자가 모두 결제하지 않으면 DRAWN → LISTED(선착순으로 전환)
 */
public enum ResaleStatus {
	RESALE_PENDING, LISTED, DRAWN, PAID, REISSUED, SETTLED, CANCELLED, EXPIRED, REISSUE_FAILED;

	public Set<ResaleStatus> next() {
		return switch (this) {
			case RESALE_PENDING -> EnumSet.of(LISTED, CANCELLED);
			case LISTED -> EnumSet.of(DRAWN, CANCELLED, EXPIRED);
			// DRAWN → DRAWN: 결제 기한 초과로 차순위 당첨자에게 넘어감
			case DRAWN -> EnumSet.of(DRAWN, PAID, EXPIRED, LISTED);
			case PAID -> EnumSet.of(REISSUED, REISSUE_FAILED);
			case REISSUED -> EnumSet.of(SETTLED);
			case SETTLED, CANCELLED, EXPIRED, REISSUE_FAILED -> EnumSet.noneOf(ResaleStatus.class);
		};
	}

	public boolean canMoveTo(ResaleStatus to) {
		return next().contains(to);
	}
}
