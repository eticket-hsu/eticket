package com.fairticket.fairticket.auth;

import jakarta.servlet.http.HttpServletRequest;

/** 서명으로 확인된 호출 예매처를 꺼내고, 다른 예매처 이름으로 보낸 요청을 막는다 */
public final class Callers {

	private Callers() {
	}

	/** 서명 확인을 거친 예매처 ID. 본문의 vendorId 가 다르면 403 */
	public static String vendor(HttpServletRequest req, String claimedVendorId) {
		String caller = (String) req.getAttribute(RequestSigning.CALLER_ATTR);
		if (caller == null) {
			throw new CallerMismatchException("서버 간 인증이 필요한 요청입니다");
		}
		if (claimedVendorId != null && !claimedVendorId.isBlank() && !claimedVendorId.equals(caller)) {
			throw new CallerMismatchException(caller + " 은(는) " + claimedVendorId + " 이름으로 보낼 수 없습니다");
		}
		return caller;
	}

	public static class CallerMismatchException extends RuntimeException {

		public CallerMismatchException(String message) {
			super(message);
		}
	}
}
