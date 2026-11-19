package com.fairticket.fairticket.risk;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사후 검토와 계정 묶음 탐지 (설계 문서 C묶음 ②·③).
 * - 사후 검토: 공연 전체 기록을 다시 보고 의심 사용자 목록을 만든다. 취소 여부는 발행처가 결정한다.
 * - 계정 묶음: 같은 IP 로 이어진 계정들을 여러 예매처에 걸쳐 묶는다.
 *   한 예매처는 자기 사이트 안의 계정만 볼 수 있지만 FairTicket 은 연동 예매처 전체를 본다 (차별점).
 */
@Service
@Transactional(readOnly = true)
public class ReviewService {

	private final PurchaseEventRepository events;
	private final List<Report> reports = new CopyOnWriteArrayList<>();

	public ReviewService(PurchaseEventRepository events) {
		this.events = events;
	}

	public record Suspect(String uid, List<String> vendors, int attempts, int successes, int failures,
			int quotaHits, int captchaFails, Integer fastestReactionMs, int noViewRequests, int sharedIpAccounts,
			List<String> flags) {
	}

	/** suspiciousMembers: IP 외의 행동 신호가 있는 계정 수 */
	public record Cluster(List<String> uids, List<String> vendors, int ipCount, int events, boolean crossVendor,
			int suspiciousMembers) {
	}

	public record Review(String performanceCode, List<Suspect> suspects, List<Cluster> clusters,
			LocalDateTime reviewedAt) {
	}

	/** 발행처에 전달한 의심 목록 (데모: 메모리 보관) */
	public record Report(String performanceCode, List<String> uids, LocalDateTime sentAt) {
	}

	public List<String> performanceCodes() {
		return events.findPerformanceCodes();
	}

	public Review review(String performanceCode) {
		List<PurchaseEvent> all = events.findByPerformanceCodeOrderByOccurredAtAsc(performanceCode);
		Map<String, List<PurchaseEvent>> byUid = new HashMap<>();
		Map<String, Set<String>> uidsByIp = new HashMap<>();
		for (PurchaseEvent e : all) {
			byUid.computeIfAbsent(e.getUid(), k -> new ArrayList<>()).add(e);
			if (e.getIpHash() != null) {
				uidsByIp.computeIfAbsent(e.getIpHash(), k -> new TreeSet<>()).add(e.getUid());
			}
		}

		List<Suspect> suspects = new ArrayList<>();
		Map<String, Integer> behaviorSignals = new HashMap<>();
		byUid.forEach((uid, list) -> {
			Set<String> vendors = new LinkedHashSet<>();
			int attempts = 0, successes = 0, failures = 0, quotaHits = 0, captchaFails = 0, noView = 0, deviceMoves = 0;
			Integer fastest = null;
			int sharedIp = 1;
			for (PurchaseEvent e : list) {
				vendors.add(e.getVendorId());
				switch (e.getResult()) {
					case "ATTEMPT" -> attempts++;
					case "SUCCESS" -> successes++;
					case "QUOTA" -> quotaHits++;
					case "CAPTCHA_FAIL" -> captchaFails++;
					case "DEVICE_CHANGE" -> deviceMoves++;
					default -> {
					}
				}
				if (RiskService.FAILURES.contains(e.getResult())) {
					failures++;
				}
				if (e.getReactionMs() != null) {
					if (e.getReactionMs() < 0) {
						noView++;
					}
					else if (fastest == null || e.getReactionMs() < fastest) {
						fastest = e.getReactionMs();
					}
				}
				if (e.getIpHash() != null) {
					sharedIp = Math.max(sharedIp, uidsByIp.get(e.getIpHash()).size());
				}
			}
			List<String> flags = new ArrayList<>();
			if (vendors.size() >= 2) {
				flags.add("여러 예매처에서 같은 공연 시도");
			}
			if ((fastest != null && fastest < RiskService.MIN_HUMAN_REACTION_MS) || noView > 0) {
				flags.add("사람이 어려운 반응 속도");
			}
			if (attempts > RiskService.RATE_LIMIT_PER_MINUTE) {
				flags.add("예매 요청 " + attempts + "회");
			}
			if (failures > RiskService.FAILURE_LIMIT) {
				flags.add("실패·보류 " + failures + "회");
			}
			if (quotaHits >= RiskService.QUOTA_HIT_LIMIT) {
				flags.add("공통 한도 초과 시도 " + quotaHits + "회");
			}
			// 표를 다른 기기로 옮김: 계정 양도·대리 티켓팅 의심 (폰 교체 1회는 흔하므로 2회부터)
			if (deviceMoves >= 2) {
				flags.add("표를 다른 기기로 " + deviceMoves + "회 옮김");
			}
			behaviorSignals.put(uid, flags.size()); // IP 신호를 넣기 전 = 행동 신호 수
			if (sharedIp >= RiskService.SHARED_IP_ACCOUNTS) {
				flags.add("같은 IP 계정 " + sharedIp + "개");
			}
			// 한 가지 신호만으로는 의심 목록에 올리지 않는다
			if (flags.size() >= 2) {
				suspects.add(new Suspect(uid, List.copyOf(vendors), attempts, successes, failures, quotaHits,
						captchaFails, fastest, noView, sharedIp, flags));
			}
		});
		suspects.sort(Comparator.comparingInt((Suspect s) -> s.flags().size()).reversed()
			.thenComparing(Comparator.comparingInt(Suspect::attempts).reversed()));

		return new Review(performanceCode, suspects, clusters(byUid, uidsByIp, behaviorSignals), LocalDateTime.now());
	}

	/**
	 * 같은 IP 를 함께 쓴 계정들을 하나로 묶는다 (union-find).
	 * PC방·학교처럼 IP 만 같은 정상 이용자를 묶음으로 몰지 않도록,
	 * 계정 절반 이상에 IP 외의 행동 신호(빠른 반응, 반복 실패, 교차 예매처 등)가 있을 때만 보고한다.
	 */
	private List<Cluster> clusters(Map<String, List<PurchaseEvent>> byUid, Map<String, Set<String>> uidsByIp,
			Map<String, Integer> behaviorSignals) {
		Map<String, String> parent = new HashMap<>();
		byUid.keySet().forEach(u -> parent.put(u, u));
		uidsByIp.values().forEach(group -> {
			String first = group.iterator().next();
			group.forEach(u -> union(parent, first, u));
		});
		Map<String, List<String>> groups = new HashMap<>();
		byUid.keySet().forEach(u -> groups.computeIfAbsent(find(parent, u), k -> new ArrayList<>()).add(u));

		List<Cluster> out = new ArrayList<>();
		for (List<String> members : groups.values()) {
			if (members.size() < 2) {
				continue;
			}
			Set<String> vendors = new TreeSet<>();
			Set<String> ips = new LinkedHashSet<>();
			int count = 0;
			for (String u : members) {
				for (PurchaseEvent e : byUid.get(u)) {
					vendors.add(e.getVendorId());
					if (e.getIpHash() != null) {
						ips.add(e.getIpHash());
					}
					count++;
				}
			}
			int suspicious = (int) members.stream().filter(u -> behaviorSignals.getOrDefault(u, 0) > 0).count();
			if (suspicious * 2 < members.size()) {
				continue;
			}
			members.sort(String::compareTo);
			out.add(new Cluster(members, List.copyOf(vendors), ips.size(), count, vendors.size() >= 2, suspicious));
		}
		out.sort(Comparator.comparingInt((Cluster c) -> c.uids().size()).reversed());
		return out;
	}

	public Report report(String performanceCode, List<String> uids) {
		Report r = new Report(performanceCode, List.copyOf(uids), LocalDateTime.now());
		reports.add(r);
		return r;
	}

	public List<Report> reports() {
		return List.copyOf(reports);
	}

	private static String find(Map<String, String> p, String x) {
		while (!p.get(x).equals(x)) {
			p.put(x, p.get(p.get(x)));
			x = p.get(x);
		}
		return x;
	}

	private static void union(Map<String, String> p, String a, String b) {
		String ra = find(p, a), rb = find(p, b);
		if (!ra.equals(rb)) {
			p.put(ra, rb);
		}
	}
}
