package com.eticket.eticket.risk;

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

import com.eticket.eticket.config.ETicketProperties;
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
	/** 한 기기에서 10분 안에 몇 개 계정이 시도하면 신호인가. 가족이 한 폰으로 2개 계정 정도는 흔하므로 3부터 */
	static final int SHARED_DEVICE_ACCOUNTS = 3;

	/** IP 신호 점수 */
	static final int VPN_POINTS = 25, DATACENTER_POINTS = 25, TOR_POINTS = 40, FOREIGN_POINTS = 10,
			TIMEZONE_MISMATCH_POINTS = 15;
	static final String KOREA_TIMEZONE = "Asia/Seoul";

	/** 반복 실패에 세는 결과. 한도 초과(QUOTA)는 별도 규칙으로 세므로 중복해서 넣지 않는다 */
	/** NO_DEVICE: 기기 정보 없이 API 를 직접 부른 구매 요청 (예매처가 거절) */
	static final Set<String> FAILURES = Set.of("FAIL", "HELD", "CAPTCHA_FAIL", "NO_DEVICE");

	private final PurchaseEventRepository events;
	private final IpIntelligence ipIntel;
	private final ETicketProperties props;

	public RiskService(PurchaseEventRepository events, IpIntelligence ipIntel, ETicketProperties props) {
		this.events = events;
		this.ipIntel = ipIntel;
		this.props = props;
	}

	public PurchaseEvent record(String vendorId, String uid, String performanceCode, String action, String result,
			String ip, Integer reactionMs) {
		return record(vendorId, uid, performanceCode, action, result, ip, reactionMs, null, null);
	}

	/** 원래 IP 는 저장하지 않는다: 같은 IP 묶기용 해시와, 판별한 IP 종류만 남긴다 */
	public PurchaseEvent record(String vendorId, String uid, String performanceCode, String action, String result,
			String ip, Integer reactionMs, String clientTimezone, String deviceHash) {
		// 예매처가 이미 해시로 바꿔 보내지만, 예매처별로 다른 값이 섞이지 않게 예매처 ID 를 붙여 저장한다
		String device = deviceHash == null || deviceHash.isBlank() ? null : vendorId + ":" + deviceHash;
		return events.save(new PurchaseEvent(vendorId, uid, performanceCode, action, result, hashIp(ip), reactionMs,
				ip == null ? null : ipIntel.classify(ip).name(), clientTimezone, device));
	}

	@Transactional(readOnly = true)
	public RiskAssessment assess(String uid, String performanceCode) {
		return assess(uid, performanceCode, null);
	}

	/**
	 * vendorScope 가 있으면 그 예매처 기록만 보고 판단한다 = eTicket 없이 예매처 혼자 볼 때.
	 * 비교 실험("예매처마다 따로 볼 때 vs 합쳐 볼 때")에서 같은 규칙으로 두 경우를 재려고 둔다.
	 */
	@Transactional(readOnly = true)
	public RiskAssessment assess(String uid, String performanceCode, String vendorScope) {
		LocalDateTime now = LocalDateTime.now();
		List<PurchaseEvent> recent = events.findByUidAndOccurredAtAfterOrderByOccurredAtAsc(uid, now.minusMinutes(10))
			.stream()
			.filter(e -> vendorScope == null || vendorScope.equals(e.getVendorId()))
			.toList();
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
					String.join("·", vendors.stream().map(this::vendorName).toList()) + "에서 같은 공연 동시 시도"));
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
			long accounts = events.countDistinctUidByIp(ip, now.minusMinutes(10), vendorScope);
			if (accounts >= SHARED_IP_ACCOUNTS && reasons.stream().noneMatch(r -> r.rule().equals("SHARED_IP"))) {
				reasons.add(new RiskAssessment.Reason("SHARED_IP", 10, "같은 IP에서 " + accounts + "개 계정 시도"));
			}
		});

		// 8. 기기 공유: 한 기기(브라우저)에서 여러 계정으로 예매 = 한 사람이 계정 여러 개를 돌림.
		// IP 와 달리 PC방·회사처럼 여러 사람이 같은 기기를 쓰는 경우가 드물어 점수를 더 준다
		recent.stream().map(PurchaseEvent::getDeviceHash).filter(Objects::nonNull).distinct().forEach(d -> {
			long accounts = events.countDistinctUidByDevice(d, now.minusMinutes(10), vendorScope);
			if (accounts >= SHARED_DEVICE_ACCOUNTS && reasons.stream().noneMatch(r -> r.rule().equals("SHARED_DEVICE"))) {
				reasons.add(new RiskAssessment.Reason("SHARED_DEVICE", 20, "같은 기기에서 " + accounts + "개 계정 시도"));
			}
		});

		// 9~13. IP 검사: 최근 10분 동안 이 사람이 쓴 IP 종류와 브라우저 시간대
		addIpReasons(recent, reasons);

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

	/** 화면에 보일 예매처 이름 (설정에 없으면 ID 그대로) */
	private String vendorName(String vendorId) {
		ETicketProperties.Vendor v = props.vendors() == null ? null : props.vendors().get(vendorId);
		return v == null || v.name() == null ? vendorId : v.name();
	}

	private void addIpReasons(List<PurchaseEvent> recent, List<RiskAssessment.Reason> reasons) {
		Set<IpIntelligence.IpType> types = new LinkedHashSet<>();
		boolean tzMismatch = false;
		for (PurchaseEvent e : recent) {
			if (e.getIpType() == null) {
				continue;
			}
			IpIntelligence.IpType t = IpIntelligence.IpType.valueOf(e.getIpType());
			types.add(t);
			if (t.outsideKorea() && KOREA_TIMEZONE.equals(e.getClientTimezone())) {
				tzMismatch = true;
			}
		}
		if (types.contains(IpIntelligence.IpType.TOR)) {
			reasons.add(new RiskAssessment.Reason("TOR_IP", TOR_POINTS, "Tor 네트워크에서 접속"));
		}
		if (types.contains(IpIntelligence.IpType.VPN)) {
			reasons.add(new RiskAssessment.Reason("VPN_IP", VPN_POINTS, "VPN·프록시 IP에서 접속"));
		}
		if (types.contains(IpIntelligence.IpType.DATACENTER)) {
			reasons.add(new RiskAssessment.Reason("DATACENTER_IP", DATACENTER_POINTS,
					"데이터센터(클라우드 서버) IP에서 접속"));
		}
		if (types.contains(IpIntelligence.IpType.FOREIGN)) {
			reasons.add(new RiskAssessment.Reason("FOREIGN_IP", FOREIGN_POINTS, "해외 IP에서 접속"));
		}
		if (tzMismatch) {
			reasons.add(new RiskAssessment.Reason("TIMEZONE_MISMATCH", TIMEZONE_MISMATCH_POINTS,
					"브라우저 시간대는 한국인데 IP는 해외·VPN"));
		}
		// 발행처 정책: 익명 IP 는 바로 보류 (인터파크식 VPN 차단)
		if (props.blockAnonymousIp() && types.stream().anyMatch(IpIntelligence.IpType::anonymous)) {
			reasons.add(new RiskAssessment.Reason("ANONYMOUS_IP_BLOCKED", 100, "익명 IP(VPN·데이터센터·Tor) 차단 정책"));
		}
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
