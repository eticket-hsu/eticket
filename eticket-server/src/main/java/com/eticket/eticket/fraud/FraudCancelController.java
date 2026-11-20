package com.eticket.eticket.fraud;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

/** 관리자 콘솔(발행처 담당자)용: 의심 계정 표 취소 요청과 기록 */
@RestController
@RequestMapping("/v1/risk/review")
public class FraudCancelController {

	private final FraudCancelService service;

	public FraudCancelController(FraudCancelService service) {
		this.service = service;
	}

	public record CancelRequest(@NotBlank String performanceCode, List<String> uids) {
	}

	@PostMapping("/cancel")
	public List<FraudCancellation> cancel(@Valid @RequestBody CancelRequest req) {
		return service.cancel(req.performanceCode(), req.uids() == null ? List.of() : req.uids());
	}

	@GetMapping("/cancellations")
	public List<FraudCancellation> history(@RequestParam(required = false) String performanceCode) {
		return service.history(performanceCode);
	}
}
