package com.fairticket.fairticket.config;

import java.util.List;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param vendors            연동된 발행처 목록
 * @param reissueMaxAttempts 재발급 재시도 횟수
 * @param resaleDefaults     발행처가 재판매 기한을 보내지 않았을 때 쓰는 기본값
 * @param demoMode           시연용 기능(보안문자 정답 조회 등) 노출 여부. 실서비스에서는 false
 */
@ConfigurationProperties(prefix = "fairticket")
public record FairTicketProperties(Map<String, Vendor> vendors, int reissueMaxAttempts,
		ResaleDefaults resaleDefaults, boolean demoMode) {

	/**
	 * @param outboundSecret FairTicket → 이 발행처 요청에 서명하는 비밀키
	 * @param inboundSecrets 이 발행처 → FairTicket 요청의 서명을 확인하는 비밀키 목록 (키 교체 중에는 2개)
	 */
	public record Vendor(String name, String baseUrl, String outboundSecret, List<String> inboundSecrets) {
	}

	/**
	 * @param applyHoursBefore 신청 마감: 공연 N시간 전까지 신청 가능
	 * @param closeHoursBefore 판매 종료: 공연 N시간 전에 판매를 끝내고 미판매면 원 구매자 권한 복원
	 * @param paymentMinutes   당첨자 결제 기한(분)
	 */
	public record ResaleDefaults(int applyHoursBefore, int closeHoursBefore, int paymentMinutes) {
	}
}
