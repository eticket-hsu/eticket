package com.fairticket.vendor.ft;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fairticket.vendor.api.TicketView;
import com.fairticket.vendor.domain.AdmitResult;
import com.fairticket.vendor.domain.QrCodec;
import com.fairticket.vendor.domain.Ticket;
import com.fairticket.vendor.domain.TicketService;

import jakarta.validation.constraints.NotBlank;

/**
 * 발행처가 구현하는 FairTicket 표준 API (/ft/*).
 * FairTicket 만 호출한다. 최종 권한은 여기, 발행처에 있다.
 * 상태를 바꾸는 POST 는 IdempotencyFilter 가 Idempotency-Key 를 강제하고 중복 처리를 막는다.
 * 모든 /ft/* 요청은 FtAuthFilter 가 FairTicket 서명을 확인한 뒤에만 들어온다.
 */
@RestController
@RequestMapping("/ft")
public class FtStandardApiController {

	private static final Logger log = LoggerFactory.getLogger(FtStandardApiController.class);

	private final TicketService ticketService;
	private final QrCodec qrCodec;

	public FtStandardApiController(TicketService ticketService, QrCodec qrCodec) {
		this.ticketService = ticketService;
		this.qrCodec = qrCodec;
	}

	@GetMapping("/tickets/{id}")
	public TicketView get(@PathVariable Long id) {
		return TicketView.of(ticketService.get(id));
	}

	/** 재판매 승인 + 기존 QR 사용 제한 */
	@PostMapping("/tickets/{id}/lock")
	public TicketView lock(@PathVariable Long id) {
		return TicketView.of(ticketService.lock(id));
	}

	/** 취소·만료 시 원 구매자 권한 복원 */
	@PostMapping("/tickets/{id}/unlock")
	public TicketView unlock(@PathVariable Long id) {
		return TicketView.of(ticketService.unlock(id));
	}

	/** acquiredPrice: 재판매 거래 가격 → 새 소유자의 취득가 */
	public record ReissueRequest(@NotBlank String newOwnerFtUid, Integer acquiredPrice) {
	}

	/** 기존 티켓 무효화 + 새 구매자에게 재발급 (발급 버전 +1, 취득가 기록) */
	@PostMapping("/tickets/{id}/reissue")
	public TicketView reissue(@PathVariable Long id, @RequestBody ReissueRequest req) {
		return TicketView.of(ticketService.reissue(id, req.newOwnerFtUid(), req.acquiredPrice()));
	}

	/** reason: FairTicket 사후 검토에서 겹친 신호 (예: "여러 예매처에서 같은 공연 시도, 사람이 어려운 반응 속도") */
	public record FraudCancelRequest(String reason) {
	}

	/**
	 * 부정 구매 취소 요청. FairTicket 이 사후 검토로 찾은 의심 계정의 표를 발행처가 취소한다.
	 * 대금은 환불(시연: 로그만)하고, 이후 QR 은 입장에서 거절된다.
	 */
	@PostMapping("/tickets/{id}/fraud-cancel")
	public TicketView fraudCancel(@PathVariable Long id, @RequestBody FraudCancelRequest req) {
		Ticket t = ticketService.cancelForFraud(id, req.reason());
		log.info("[부정 구매 취소] 티켓 {} ({}) 사유: {} → 대금 {}원 환불", id, t.getOwner().getFtUid(), req.reason(),
				t.getAcquiredPrice());
		return TicketView.of(t);
	}

	public record AdmitRequest(@NotBlank String qr) {
	}

	/** 입장 승인 + 사용 처리 (원자적) */
	@PostMapping("/admit")
	public Map<String, Object> admit(@RequestBody AdmitRequest req) {
		AdmitResult result = ticketService.admit(req.qr());
		Map<String, Object> out = new java.util.HashMap<>(Map.of("result", result.name(), "message", result.getMessage(),
				"admitted", result == AdmitResult.ADMITTED));
		// 입장 승인 시 표 주인 정보: FairTicket 이 의심 표인지 보고 현장 신분증 확인을 요청하는 데 쓴다
		QrCodec.Parsed p = qrCodec.parse(req.qr());
		if (result == AdmitResult.ADMITTED && p != null) {
			var t = ticketService.get(p.ticketId());
			out.put("ownerFtUid", t.getOwner().getFtUid());
			out.put("ownerName", t.getOwner().getName());
			out.put("performanceCode", t.getPerformance().getCode());
		}
		return out;
	}

	// ---- 아래는 가상 결제·정산 자리 (MVP 에선 항상 성공) ----

	/** 당첨자 결제 요청 생성. TODO: 결제 페이지 흐름 */
	@PostMapping("/payments")
	public Map<String, Object> createPayment(@RequestBody Map<String, Object> body) {
		log.info("[가상 결제] {}", body);
		return Map.of("status", "PAID");
	}

	/** 재발급 실패 시 새 구매자 환불. TODO: 환불 기록 테이블 */
	@PostMapping("/refunds")
	public Map<String, Object> refund(@RequestBody Map<String, Object> body) {
		log.info("[가상 환불] {}", body);
		return Map.of("status", "REFUNDED");
	}

	/** 원 구매자 정산. TODO: 정산 기록 테이블 */
	@PostMapping("/payouts")
	public Map<String, Object> payout(@RequestBody Map<String, Object> body) {
		log.info("[가상 정산] {}", body);
		return Map.of("status", "PAID_OUT");
	}
}
