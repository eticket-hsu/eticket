package com.eticket.vendor.security;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 반응 시간 측정: 회원이 좌석 화면을 처음 연 시각을 서버에서 기록하고,
 * 예매 요청까지 걸린 시간을 eTicket에 보낸다.
 * 화면이 주기적으로 새로고침되어도 "처음 연 시각"은 30분 동안 유지한다.
 * 화면 기록 없이 들어온 예매 요청은 -1 (화면을 거치지 않은 요청).
 */
@Component
public class ViewTracker {

	private static final Duration KEEP = Duration.ofMinutes(30);
	private final Map<String, Instant> firstView = new ConcurrentHashMap<>();

	public void markView(Long memberId, Long performanceId) {
		Instant now = Instant.now();
		firstView.compute(key(memberId, performanceId),
				(k, old) -> old == null || old.plus(KEEP).isBefore(now) ? now : old);
	}

	public int reactionMs(Long memberId, Long performanceId) {
		Instant first = firstView.get(key(memberId, performanceId));
		if (first == null) {
			return -1;
		}
		return (int) Math.min(Integer.MAX_VALUE, Duration.between(first, Instant.now()).toMillis());
	}

	/** 예매가 끝나면 지워서 다음 예매는 다시 화면부터 잰다 */
	public void clear(Long memberId, Long performanceId) {
		firstView.remove(key(memberId, performanceId));
	}

	private static String key(Long memberId, Long performanceId) {
		return memberId + ":" + performanceId;
	}
}
