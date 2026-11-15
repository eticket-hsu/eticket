package com.fairticket.fairticket.risk;

import java.util.NoSuchElementException;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import com.fairticket.fairticket.auth.Callers;
import com.fairticket.fairticket.config.FairTicketProperties;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/v1")
public class RiskController {

	private final RiskService riskService;
	private final ReviewService reviewService;

	private final FairTicketProperties props;

	public RiskController(RiskService riskService, ReviewService reviewService, FairTicketProperties props) {
		this.riskService = riskService;
		this.reviewService = reviewService;
		this.props = props;
	}

	public record PurchaseEventRequest(@NotBlank String vendorId, @NotBlank String uid,
			@NotBlank String performanceCode, String action, String result, String ip, Integer reactionMs) {
	}

	/** 예매처 → 구매 시도 이벤트 (서명 필수). 기록되는 예매처는 본문이 아니라 서명으로 확인된 예매처다. TODO: 배치 전송 */
	@PostMapping("/purchase-events")
	public Map<String, Object> record(@Valid @RequestBody PurchaseEventRequest req, HttpServletRequest http) {
		return save(Callers.vendor(http, req.vendorId()), req);
	}

	/** 시연 도구(관리자 웹)용 트래픽 입력. 시연 모드에서만 열린다 */
	@PostMapping("/demo/purchase-events")
	public Map<String, Object> demoRecord(@Valid @RequestBody PurchaseEventRequest req) {
		requireDemo();
		return save(req.vendorId(), req);
	}

	/** 시연 도구용 위험 조회. 실서비스에서는 예매처만 서명해서 조회한다 */
	@GetMapping("/demo/risk")
	public RiskAssessment demoRisk(@RequestParam String uid, @RequestParam String performanceCode) {
		requireDemo();
		return riskService.assess(uid, performanceCode);
	}

	private void requireDemo() {
		if (!props.demoMode()) {
			throw new NoSuchElementException("시연 모드가 아닙니다");
		}
	}

	private Map<String, Object> save(String vendorId, PurchaseEventRequest req) {
		PurchaseEvent e = riskService.record(vendorId, req.uid(), req.performanceCode(),
				req.action() == null ? "PURCHASE" : req.action(), req.result() == null ? "ATTEMPT" : req.result(),
				req.ip(), req.reactionMs());
		return Map.of("id", e.getId());
	}

	/** 예매처 → 위험 등급 조회 (서명 필수) */
	@GetMapping("/risk")
	public RiskAssessment risk(@RequestParam String uid, @RequestParam String performanceCode) {
		return riskService.assess(uid, performanceCode);
	}

	/** 관리자 웹: "왜 의심했는지" 목록 */
	@GetMapping("/risk/overview")
	public List<RiskAssessment> overview() {
		return riskService.overview();
	}

	/** 사후 검토: 공연 전체 기록 기준 의심 목록 + 여러 예매처에 걸친 계정 묶음 */
	@GetMapping("/risk/review")
	public ReviewService.Review review(@RequestParam String performanceCode) {
		return reviewService.review(performanceCode);
	}

	@GetMapping("/risk/review/performances")
	public List<String> reviewPerformances() {
		return reviewService.performanceCodes();
	}

	public record ReportRequest(@NotBlank String performanceCode, List<String> uids) {
	}

	/** 의심 목록을 발행처에 전달 (취소 여부는 발행처가 결정). 데모에서는 기록만 남긴다 */
	@PostMapping("/risk/review/reports")
	public ReviewService.Report report(@Valid @RequestBody ReportRequest req) {
		return reviewService.report(req.performanceCode(), req.uids() == null ? List.of() : req.uids());
	}

	@GetMapping("/risk/review/reports")
	public List<ReviewService.Report> reports() {
		return reviewService.reports();
	}
}
