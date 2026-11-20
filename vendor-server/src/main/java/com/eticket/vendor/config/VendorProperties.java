package com.eticket.vendor.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 예매처 인스턴스별 설정. application-{star|moon}.yml 에서 채운다.
 *
 * @param id                    발행처 ID (공통 식별자 FT:{id}:... 에 들어감)
 * @param name                  화면 표시 이름
 * @param qrSecret              QR 서명용 HMAC 비밀키
 * @param eticketUrl            eTicket 서버 주소
 * @param seatRows              이 예매처에 배정된 좌석 열 (예: "ABCDE"). 같은 공연을 예매처별 구역으로 나눠 판다.
 * @param paymentHoldMinutes    결제 제한 시간(좌석 선점 시간). 공통 구매 한도 예약의 유효시간으로 eTicket에 보낸다.
 * @param ftOutboundSecret      이 예매처 → eTicket 요청에 서명하는 비밀키
 * @param ftInboundSecrets      eTicket → 이 예매처 요청의 서명을 확인하는 비밀키 목록 (키 교체 중에는 2개)
 * @param demoMode              시연용 기능(접속 위치 바꾸기 등). 실서비스에서는 false
 * @param deviceMoveCutoffHours 공연 몇 시간 전부터 표를 다른 기기로 못 옮기게 할지 (기본 24).
 *                         암표 거래는 공연 직전에 몰리므로, 그때는 현장 신분증 확인으로만 처리한다
 */
@ConfigurationProperties(prefix = "vendor")
public record VendorProperties(String id, String name, String qrSecret, String eticketUrl, String seatRows,
		int paymentHoldMinutes, String ftOutboundSecret, List<String> ftInboundSecrets, boolean demoMode,
		Integer deviceMoveCutoffHours) {

	public int moveCutoffHours() {
		return deviceMoveCutoffHours == null ? 24 : deviceMoveCutoffHours;
	}
}
