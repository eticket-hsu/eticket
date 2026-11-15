package com.fairticket.fairticket.captcha;

/** 위험 등급 MEDIUM 사용자가 보안문자 없이(또는 오답으로) 요청한 경우 */
public class CaptchaRequiredException extends RuntimeException {

	private final boolean wrong;

	public CaptchaRequiredException(boolean wrong) {
		super(wrong ? "보안문자가 맞지 않습니다. 다시 입력해 주세요" : "보안문자 확인이 필요합니다");
		this.wrong = wrong;
	}

	public boolean isWrong() {
		return wrong;
	}
}
