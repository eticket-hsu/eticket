package com.eticket.eticket.quota;

/** 공통 구매 한도 초과. 응답에 현재 사용량과 한도를 담는다. */
public class QuotaExceededException extends RuntimeException {

	private final int used;
	private final int limit;

	public QuotaExceededException(int used, int limit) {
		super("공통 구매 한도 초과: 연동 예매처 합산 " + used + "/" + limit + "매");
		this.used = used;
		this.limit = limit;
	}

	public int getUsed() {
		return used;
	}

	public int getLimit() {
		return limit;
	}
}
