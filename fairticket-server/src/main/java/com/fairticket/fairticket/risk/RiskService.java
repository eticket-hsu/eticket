package com.fairticket.fairticket.risk;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 실시간 위험 분석 (설계 문서 C묶음 확정 규칙).
 * 한 가지 신호로는 고위험이 되지 않고, 여러 신호가 겹쳐야 고위험이 된다.
 * 합산 0~39 LOW(정상), 40~69 MEDIUM(주의), 70 이상 HIGH(고위험).
 * 등급은 회원 등급이 아니라 한 번의 구매 시도에 붙는 판정이며, 매번 최근 행동으로 다시 계산한다.
 */
@Service
@Transactional
public class RiskService {

	/** 예매 요청(새로고침은 세지 않음) 1분 기준 */
	static final int RATE_LIMIT_PER_MINUTE = 20;
	/** 최근 10회 요청 간격의 표준편차가 이보다 작으면 기계적 */
	static final double MACHINE_STDDEV_MS = 50;
	/** 좌석 화면을 연 뒤 이보다 빨리 예매하면 사람으로 보기 어려움 */
	static final int MIN_HUMAN_REACTION_MS = 500;
	/** 공통 한도 초과로 거절된 시도 10분 기준 */
	static final int QUOTA_HIT_LIMIT = 3;
	/** 실패·보류·보안문자 오답 10분 기준 */
	static final int FAILURE_LIMIT = 5;
	/** 한 IP 에서 움직인 계정 수 10분 기준 (보조 신호) */
	static final int SHARED_IP_ACCOUNTS = 5;

	/** 반복 실패에 세는 결과. 한도 초과(QUOTA)는 별도 규칙으로 세므로 중복해서 넣지 않는다 */
	static final Set<String> FAILURES = Set.of("FAIL", "HELD", "CAPTCHA_FAIL");

	private final PurchaseEventRepository events;

	public RiskService(PurchaseEventRepository events) {
		this.events = events;
	}

	public PurchaseEvent record(String vendorId, String uid, String performanceCode, String action, String result,
			String ip, Integer reactionMs) {
		return events.save(new PurchaseEvent(vendorId, uid, performanceCode, action, result, hashIp(ip), reactionMs));
	}

	@Transactional(readOnly = true)
	public RiskAssessment assess(String uid, String performanceCode) {
		LocalDateTime now = LocalDateTime.now();
		List<PurchaseEvent> recent = events.findByUidAndOccurredAtAfterOrderByOccurredAtAsc(uid, now.minusMinutes(10));
		List<PurchaseEvent> attempts = recent.stream().filter(e -> "ATTEMPT".equals(e.getResult())).toList();
		List<RiskAssessment.Reason> reasons = new ArrayList<>();

		// 1. 요청 빈도: 예매 요청만 센다 (페이지 새로고침은 예매처가 보내지 않음)
		long lastMinute = attempts.stream().filter(e -> e.getOccurredAt().isAfter(now.minusMinutes(1))).count();
		if (lastMinute > RATE_LIMIT_PER_MINUTE) {
			reasons.add(new RiskAssessment.Reason("REQUEST_RATE", 20, "1분간 예매 요청 " + lastMinute + "회"));
		}

		// 2. 기계적 간격: 최근 10회 예매 요청 간격이 거의 일정
		if (attempts.size() >= 10) {
			List<PurchaseEvent> last10 = attempts.subList(attempts.size() - 10, attempts.size());
			double[] gaps = new double[9];
			for (int i = 1; i < last10.size(); i++) {
				gaps[i - 1] = Duration.between(last10.get(i - 1).getOccurredAt(), last10.get(i).getOccurredAt())
					.toMillis();
			}
			double sd = stddev(gaps);
			if (sd < MACHINE_STDDEV_MS) {
				reasons.add(new RiskAssessment.Reason("MACHINE_INTERVAL", 25,
						"요청 간격 표준편차 %.0fms".formatted(sd)));
			}
		}

		// 3. 반응 시간: 좌석 화면을 연 뒤 사람이 불가능한 속도로 예매, 또는 화면 없이 바로 요청
		List<Integer> reactions = attempts.stream().map(PurchaseEvent::getReactionMs).filter(Objects::nonNull).toList();
		long noView = reactions.stream().filter(ms -> ms < 0).count();
		reactions.stream()
			.filter(ms -> ms >= 0)
			.min(Integer::compare)
			.filter(ms -> ms < MIN_HUMAN_REACTION_MS)
			.ifPresentOrElse(
					ms -> reasons.add(new RiskAssessment.Reason("REACTION_TIME", 25, "좌석 화면 진입 " + ms + "ms 만에 예매 요청")),
					() -> {
						if (noView > 0) {
							reasons.add(new RiskAssessment.Reason("REACTION_TIME", 25,
									"좌석 화면을 거치지 않은 예매 요청 " + noView + "회"));
						}
					});

		// 4. 교차 예매처: 같은 공연을 여러 예매처에서 동시에 시도
		Set<String> vendors = new LinkedHashSet<>();
		recent.stream().filter(e -> Objects.equals(e.getPerformanceCode(), performanceCode))
			.forEach(e -> vendors.add(e.getVendorId()));
		if (vendors.size() >= 2) {
			reasons.add(new RiskAssessment.Reason("CROSS_VENDOR", 20,
					String.join("·", vendors) + "에서 같은 공연 동시 시도"));
		}

		// 5. 한도 초과 시도 반복: 공통 구매 한도에 계속 부딪힘
		long quotaHits = recent.stream().filter(e -> "QUOTA".equals(e.getResult())).count();
		if (quotaHits >= QUOTA_HIT_LIMIT) {
			reasons.add(new RiskAssessment.Reason("QUOTA_HITS", 20, "10분간 공통 한도 초과 시도 " + quotaHits + "회"));
		}

		// 6. 반복 실패: 실패·보류·보안문자 오답
		long failures = recent.stream().filter(e -> FAILURES.contains(e.getResult())).count();
		if (failures > FAILURE_LIMIT) {
			long captchaFails = recent.stream().filter(e -> "CAPTCHA_FAIL".equals(e.getResult())).count();
			reasons.add(new RiskAssessment.Reason("REPEATED_FAILURE", 20, "10분간 실패·보류 " + failures + "회"
					+ (captchaFails > 0 ? " (보안문자 오답 " + captchaFails + "회)" : "")));
		}

		// 7. IP 공유 (보조 신호: IP 는 쉽게 바뀌므로 점수가 낮다)
		recent.stream().map(PurchaseEvent::getIpHash).filter(Objects::nonNull).distinct().forEach(ip -> {
			long accounts = events.countDistinctUidByIp(ip, now.minusMinutes(10));
			if (accounts >= SHARED_IP_ACCOUNTS && reasons.stream().noneMatch(r -> r.rule().equals("SHARED_IP"))) {
				reasons.add(new RiskAssessment.Reason("SHARED_IP", 10, "같은 IP에서 " + accounts + "개 계정 시도"));
			}
		});

		int score = Math.min(100, reasons.stream().mapToInt(RiskAssessment.Reason::points).sum());
		return new RiskAssessment(uid, performanceCode, RiskAssessment.levelOf(score), score, reasons, now);
	}

	/** 관리자 웹용: 최근 1시간 안에 활동한 사용자·공연 조합의 위험 등급, 점수 높은 순 */
	@Transactional(readOnly = true)
	public List<RiskAssessment> overview() {
		record Key(String uid, String performanceCode) {
		}
		return events.findByOccurredAtAfter(LocalDateTime.now().minusHours(1))
			.stream()
			.map(e -> new Key(e.getUid(), e.getPerformanceCode()))
			.distinct()
			.map(k -> assess(k.uid(), k.performanceCode()))
			.sorted(Comparator.comparingInt(RiskAssessment::score).reversed())
			.toList();
	}

	private static double stddev(double[] xs) {
		double mean = 0;
		for (double x : xs) {
			mean += x;
		}
		mean /= xs.length;
		double var = 0;
		for (double x : xs) {
			var += (x - mean) * (x - mean);
		}
		return Math.sqrt(var / xs.length);
	}

	static String hashIp(String ip) {
		if (ip == null || ip.isBlank()) {
			return null;
		}
		try {
			byte[] d = MessageDigest.getInstance("SHA-256").digest(ip.getBytes(StandardCharsets.UTF_8));
			return HexFormat.of().formatHex(d, 0, 8);
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
