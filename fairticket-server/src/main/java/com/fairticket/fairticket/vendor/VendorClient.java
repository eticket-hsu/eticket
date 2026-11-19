package com.fairticket.fairticket.vendor;

import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.fairticket.fairticket.auth.RequestSigning;
import com.fairticket.fairticket.config.FairTicketProperties;

/**
 * FairTicket → 발행처 표준 API(/ft/*) 호출.
 * 상태를 바꾸는 호출에는 Idempotency-Key 를 붙인다. 재시도할 때도 같은 키를 쓰므로
 * 발행처는 이미 처리한 요청을 다시 처리하지 않고 저장된 응답을 돌려준다 (D묶음 21번).
 */
@Component
public class VendorClient {

	private final Map<String, RestClient> clients = new HashMap<>();
	private final FairTicketProperties props;

	public VendorClient(FairTicketProperties props) {
		this.props = props;
		// 발행처마다 다른 키로 서명한다 (D묶음 22번)
		props.vendors().forEach((id, v) -> clients.put(id, RestClient.builder()
			.baseUrl(v.baseUrl())
			.requestInterceptor(RequestSigning.signer("fairticket", v.outboundSecret()))
			.build()));
	}

	public boolean isKnown(String vendorId) {
		return clients.containsKey(vendorId);
	}

	public String nameOf(String vendorId) {
		FairTicketProperties.Vendor v = props.vendors().get(vendorId);
		return v == null ? vendorId : v.name();
	}

	public Map<?, ?> lock(String vendorId, long ticketId, String idemKey) {
		return post(vendorId, "/ft/tickets/" + ticketId + "/lock", Map.of(), idemKey);
	}

	public Map<?, ?> unlock(String vendorId, long ticketId, String idemKey) {
		return post(vendorId, "/ft/tickets/" + ticketId + "/unlock", Map.of(), idemKey);
	}

	/** 재발급 결과. replayed: 발행처가 이미 처리한 요청이라 저장된 응답을 돌려줬는지 */
	public record ReissueResult(Map<?, ?> ticket, boolean replayed) {
	}

	/** 기존 티켓 무효화 + 새 소유자에게 재발급. 거래 가격을 새 소유자의 취득가로 넘긴다. */
	public ReissueResult reissue(String vendorId, long ticketId, String newOwnerFtUid, int acquiredPrice,
			String idemKey) {
		ResponseEntity<Map> res = client(vendorId).post()
			.uri("/ft/tickets/" + ticketId + "/reissue")
			.header("Idempotency-Key", idemKey)
			.body(Map.of("newOwnerFtUid", newOwnerFtUid, "acquiredPrice", acquiredPrice))
			.retrieve()
			.toEntity(Map.class);
		return new ReissueResult(res.getBody(), "true".equals(res.getHeaders().getFirst("Idempotent-Replayed")));
	}

	/** 발행처의 티켓 원본 조회 (소유자, 상태, 재판매 가격 상한) */
	public Map<?, ?> getTicket(String vendorId, long ticketId) {
		return client(vendorId).get().uri("/ft/tickets/" + ticketId).retrieve().body(Map.class);
	}

	public Map<?, ?> payment(String vendorId, Map<String, Object> body, String idemKey) {
		return post(vendorId, "/ft/payments", body, idemKey);
	}

	public Map<?, ?> refund(String vendorId, Map<String, Object> body, String idemKey) {
		return post(vendorId, "/ft/refunds", body, idemKey);
	}

	public Map<?, ?> payout(String vendorId, Map<String, Object> body, String idemKey) {
		return post(vendorId, "/ft/payouts", body, idemKey);
	}

	/** 부정 구매 취소 요청. 발행처가 표를 취소하고 대금을 환불하며, 이후 QR 은 입장에서 거절된다 */
	public Map<?, ?> fraudCancel(String vendorId, long ticketId, String reason, String idemKey) {
		return post(vendorId, "/ft/tickets/" + ticketId + "/fraud-cancel", Map.of("reason", reason), idemKey);
	}

	public Map<?, ?> admit(String vendorId, String qr) {
		return post(vendorId, "/ft/admit", Map.of("qr", qr), null);
	}

	private RestClient client(String vendorId) {
		RestClient c = clients.get(vendorId);
		if (c == null) {
			throw new NoSuchElementException("연동되지 않은 발행처: " + vendorId);
		}
		return c;
	}

	private Map<?, ?> post(String vendorId, String path, Object body, String idemKey) {
		RestClient.RequestBodySpec req = client(vendorId).post().uri(path);
		if (idemKey != null) {
			req = req.header("Idempotency-Key", idemKey);
		}
		return req.body(body).retrieve().body(Map.class);
	}
}
