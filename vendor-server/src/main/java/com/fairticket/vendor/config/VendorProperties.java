package com.fairticket.vendor.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 예매처 인스턴스별 설정. application-{star|moon}.yml 에서 채운다.
 *
 * @param id               발행처 ID (공통 식별자 FT:{id}:... 에 들어감)
 * @param name             화면 표시 이름
 * @param qrSecret         QR 서명용 HMAC 비밀키
 * @param fairticketUrl    FairTicket 서버 주소
 * @param seatRows         이 예매처에 배정된 좌석 열 (예: "ABCDE"). 같은 공연을 예매처별 구역으로 나눠 판다.
 * @param paymentHoldMinutes 결제 제한 시간(좌석 선점 시간). 공통 구매 한도 예약의 유효시간으로 FairTicket 에 보낸다.
 * @param ftOutboundSecret 이 예매처 → FairTicket 요청에 서명하는 비밀키
 * @param ftInboundSecrets FairTicket → 이 예매처 요청의 서명을 확인하는 비밀키 목록 (키 교체 중에는 2개)
 * @param demoMode         시연용 기능(접속 위치 바꾸기 등). 실서비스에서는 false
 */
@ConfigurationProperties(prefix = "vendor")
public record VendorProperties(String id, String name, String qrSecret, String fairticketUrl, String seatRows,
		int paymentHoldMinutes, String ftOutboundSecret, List<String> ftInboundSecrets, boolean demoMode) {
}
