package com.fairticket.vendor.client;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fairticket.vendor.auth.RequestSigning;
import com.fairticket.vendor.config.VendorProperties;
import com.fairticket.vendor.domain.Performance;

/** 예매처 → FairTicket 호출. FairTicket 이 꺼져 있어도 예매처 기본 기능은 돌아가게 한다. */
@Component
public class FairTicketClient {

	private static final Logger log = LoggerFactory.getLogger(FairTicketClient.class);

	private final RestClient http;
	private final VendorProperties props;

	public FairTicketClient(VendorProperties props) {
		this.props = props;
		// 모든 요청에 이 예매처의 서명을 붙인다 (D묶음 22번)
		this.http = RestClient.builder()
			.baseUrl(props.fairticketUrl())
			.requestInterceptor(RequestSigning.signer(props.id(), props.ftOutboundSecret()))
			.build();
	}

	/** 구매 시도 이벤트 전송 (위험 분석 입력). 실패해도 구매 흐름은 막지 않는다. */
	public void reportPurchaseAttempt(String ftUid, String performanceCode, String result, String ip) {
		reportPurchaseAttempt(ftUid, performanceCode, result, ip, null);
	}

	/** reactionMs: 좌석 화면을 연 뒤 예매 요청까지 걸린 시간 (-1 = 화면 없이 요청) */
	public void reportPurchaseAttempt(String ftUid, String performanceCode, String result, String ip,
			Integer reactionMs) {
		reportPurchaseAttempt(ftUid, performanceCode, result, ip, reactionMs, null);
	}

	/** clientTimezone: 브라우저 시간대 (예: Asia/Seoul). IP 위치와 다르면 VPN 신호로 쓰인다 */
	public void reportPurchaseAttempt(String ftUid, String performanceCode, String result, String ip,
			Integer reactionMs, String clientTimezone) {
		Map<String, Object> body = new HashMap<>();
		body.put("vendorId", props.id());
		body.put("uid", ftUid);
		body.put("performanceCode", performanceCode);
		body.put("action", "PURCHASE");
		body.put("result", result);
		body.put("ip", ip == null ? "" : ip);
		body.put("reactionMs", reactionMs);
		body.put("clientTimezone", clientTimezone);
		try {
			http.post()
				.uri("/v1/purchase-events")
				.body(body)
				.retrieve()
				.toBodilessEntity();
		}
		catch (RestClientException e) {
			log.warn("FairTicket 이벤트 전송 실패: {}", e.getMessage());
		}
	}

	/** 위험 등급 조회. FairTicket 연결 실패 시 null (예매처가 기본 정책으로 판단). */
	public RiskResponse getRisk(String ftUid, String performanceCode) {
		try {
			return http.get()
				.uri(b -> b.path("/v1/risk").queryParam("uid", ftUid).queryParam("performanceCode", performanceCode)
					.build())
				.retrieve()
				.body(RiskResponse.class);
		}
		catch (RestClientException e) {
			log.warn("FairTicket 위험 조회 실패: {}", e.getMessage());
			return null;
		}
	}

	/** FairTicket 공통 보안문자 확인 (1회용). FairTicket 연결 실패 시 false */
	public boolean verifyCaptcha(String id, String answer) {
		try {
			Map<?, ?> r = http.post()
				.uri("/v1/captcha/verify")
				.body(Map.of("id", id == null ? "" : id, "answer", answer == null ? "" : answer))
				.retrieve()
				.body(Map.class);
			return r != null && Boolean.TRUE.equals(r.get("ok"));
		}
		catch (RestClientException e) {
			log.warn("보안문자 확인 실패: {}", e.getMessage());
			return false;
		}
	}

	/** 공통 구매 한도 예약 결과. ok 면 id 가 있고, exceeded 면 used/limit 가 있다. unavailable 은 FairTicket 연결 실패. */
	public record QuotaResult(Long id, boolean exceeded, boolean unavailable, Integer used, Integer limit,
			String message) {
	}

	/**
	 * 결제 전에 공통 구매 한도 칸을 잡는다.
	 * 한도 값은 발행처(이 예매처가 받은 공연 정보)의 1인 한도를 보내고, 유효시간은 이 예매처의 결제 제한 시간이다.
	 */
	public QuotaResult reserveQuota(String ftUid, Performance perf, int qty) {
		try {
			Map<?, ?> r = http.post()
				.uri("/v1/quota/reserve")
				.body(Map.of("uid", ftUid, "performanceCode", perf.getCode(), "vendorId", props.id(), "qty", qty,
						"limit", perf.getPerUserLimit(), "holdMinutes", props.paymentHoldMinutes()))
				.retrieve()
				.body(Map.class);
			return new QuotaResult(((Number) r.get("id")).longValue(), false, false, null, null, null);
		}
		catch (RestClientResponseException e) {
			if (e.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
				Map<?, ?> body = e.getResponseBodyAs(Map.class);
				return new QuotaResult(null, true, false, num(body, "used"), num(body, "limit"),
						body == null ? "공통 구매 한도 초과" : String.valueOf(body.get("error")));
			}
			log.warn("공통 한도 예약 실패: {}", e.getMessage());
			return new QuotaResult(null, false, true, null, null, null);
		}
		catch (RestClientException e) {
			log.warn("FairTicket 연결 실패 (공통 한도 확인 생략): {}", e.getMessage());
			return new QuotaResult(null, false, true, null, null, null);
		}
	}

	/** 발급 완료: 예약을 확정하고 티켓 참조를 남긴다 (재판매 완료 시 판매자 칸을 찾는 데 쓰임) */
	public void confirmQuota(Long reservationId, long ticketId) {
		if (reservationId == null) {
			return;
		}
		try {
			http.post().uri("/v1/quota/{id}/confirm", reservationId)
				.body(Map.of("ref", props.id() + ":" + ticketId))
				.retrieve()
				.toBodilessEntity();
		}
		catch (RestClientException e) {
			log.warn("공통 한도 확정 실패 (예약 {}): {}", reservationId, e.getMessage());
		}
	}

	/** 결제 실패·환불: 즉시 반환 */
	public void releaseQuota(Long reservationId) {
		if (reservationId == null) {
			return;
		}
		try {
			http.post().uri("/v1/quota/{id}/release", reservationId).retrieve().toBodilessEntity();
		}
		catch (RestClientException e) {
			log.warn("공통 한도 반환 실패 (예약 {}): {} — 결제 제한 시간이 지나면 자동 반환됨", reservationId, e.getMessage());
		}
	}

	/**
	 * 재판매 신청 등록. FairTicket 이 가격 상한을 이 예매처에 조회해 검증하고, /ft/tickets/{id}/lock 으로 승인 절차를 밟는다.
	 * 재판매 기한은 이 공연의 발행처 정책을 보내고, 없으면 FairTicket 기본값이 쓰인다.
	 */
	public Map<?, ?> registerResale(long ticketId, Performance perf, String seat, String sellerUid, int price) {
		Map<String, Object> body = new HashMap<>();
		body.put("vendorId", props.id());
		body.put("vendorTicketId", ticketId);
		body.put("performanceCode", perf.getCode());
		body.put("performanceTitle", perf.getTitle());
		body.put("seat", seat);
		body.put("startsAt", perf.getStartsAt().toString());
		body.put("sellerUid", sellerUid);
		body.put("price", price);
		body.put("applyHoursBefore", perf.getResaleApplyHoursBefore());
		body.put("closeHoursBefore", perf.getResaleCloseHoursBefore());
		body.put("paymentMinutes", perf.getResalePaymentMinutes());
		return http.post().uri("/v1/resales").body(body).retrieve().body(Map.class);
	}

	private static Integer num(Map<?, ?> m, String k) {
		return m != null && m.get(k) instanceof Number n ? n.intValue() : null;
	}

	public record RiskResponse(String riskLevel, int score, List<Reason> reasons) {
		public record Reason(String rule, String detail) {
		}
	}
}
