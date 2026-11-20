package com.eticket.eticket.quota;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import com.eticket.eticket.auth.Callers;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/** 예매처 → eTicket 공통 구매 한도 API */
@RestController
@RequestMapping("/v1/quota")
public class QuotaController {

	private final QuotaService quota;

	public QuotaController(QuotaService quota) {
		this.quota = quota;
	}

	/**
	 * @param limit       발행처가 정한 1인 한도 (공연 등록 정보)
	 * @param holdMinutes 예매처의 결제 제한 시간. 이 안에 확정하지 않으면 자동 반환
	 */
	public record ReserveRequest(@NotBlank String uid, @NotBlank String performanceCode, @NotBlank String vendorId,
			@Min(1) int qty, Integer limit, Integer holdMinutes) {
	}

	@PostMapping("/reserve")
	public QuotaReservation reserve(@Valid @RequestBody ReserveRequest req, HttpServletRequest http) {
		return quota.reserve(req.uid(), req.performanceCode(), Callers.vendor(http, req.vendorId()), req.qty(), req.limit(),
				req.holdMinutes() == null ? 10 : req.holdMinutes(), "PURCHASE", null);
	}

	public record ConfirmRequest(String ref) {
	}

	@PostMapping("/{id}/confirm")
	public QuotaReservation confirm(@PathVariable Long id, @RequestBody(required = false) ConfirmRequest req,
			HttpServletRequest http) {
		// 자기가 잡은 예약만 확정·반환할 수 있다
		Callers.vendor(http, quota.vendorOf(id));
		return quota.confirm(id, req == null ? null : req.ref());
	}

	@PostMapping("/{id}/release")
	public QuotaReservation release(@PathVariable Long id, HttpServletRequest http) {
		Callers.vendor(http, quota.vendorOf(id));
		return quota.release(id);
	}

	@GetMapping
	public QuotaService.Usage usage(@RequestParam String uid, @RequestParam String performanceCode) {
		return quota.usage(uid, performanceCode);
	}

	/** 운영 콘솔용 최근 기록 */
	@GetMapping("/recent")
	public List<QuotaReservation> recent() {
		return quota.recent();
	}
}
