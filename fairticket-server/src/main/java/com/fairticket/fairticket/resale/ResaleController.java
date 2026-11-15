package com.fairticket.fairticket.resale;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import com.fairticket.fairticket.auth.Callers;

import org.springframework.web.bind.annotation.DeleteMapping;
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
import jakarta.validation.constraints.NotNull;

/** 공식 재판매 API. 예매처 웹과 관리자 웹이 함께 쓴다. */
@RestController
@RequestMapping("/v1")
public class ResaleController {

	private final ResaleService resaleService;
	private final ResaleListingRepository listings;
	private final ResaleEntryRepository entries;
	private final ResaleHistoryRepository history;

	public ResaleController(ResaleService resaleService, ResaleListingRepository listings,
			ResaleEntryRepository entries, ResaleHistoryRepository history) {
		this.resaleService = resaleService;
		this.listings = listings;
		this.entries = entries;
		this.history = history;
	}

	public record RegisterRequest(@NotBlank String vendorId, @NotNull Long vendorTicketId,
			@NotBlank String performanceCode, @NotBlank String sellerUid, @Min(0) int price, String performanceTitle,
			String seat, @NotBlank String startsAt, Integer applyHoursBefore, Integer closeHoursBefore,
			Integer paymentMinutes) {
	}

	/** 재판매 등록. 기한 3개는 발행처가 공연별로 정한 값이며, 비우면 FairTicket 기본값을 쓴다. */
	@PostMapping("/resales")
	public ResaleListing register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
		// 등록하는 예매처는 서명으로 확인된 예매처 (다른 발행처 티켓을 대신 올릴 수 없음)
		return resaleService.register(Callers.vendor(http, req.vendorId()), req.vendorTicketId(), req.performanceCode(), req.sellerUid(),
				req.price(), req.performanceTitle(), req.seat(), req.startsAt(),
				new ResaleService.Deadlines(req.applyHoursBefore(), req.closeHoursBefore(), req.paymentMinutes()));
	}

	@GetMapping("/resales")
	public List<ResaleListing> list(@RequestParam(required = false) String performanceCode) {
		return performanceCode == null ? listings.findAllByOrderByIdDesc()
				: listings.findByPerformanceCodeOrderByIdDesc(performanceCode);
	}

	/** 관리자 웹: 상세 + 응모자 + 진행 이력 */
	@GetMapping("/resales/{id}")
	public Map<String, Object> detail(@PathVariable Long id) {
		return Map.of("listing", resaleService.get(id), "entries", entries.findByListingIdOrderByIdAsc(id), "history",
				history.findByListingIdOrderByIdAsc(id));
	}

	public record EntryRequest(@NotBlank String buyerUid, String captchaId, String captchaAnswer) {
	}

	/** 응모. 위험 등급 MEDIUM 이면 403 captchaRequired → 보안문자와 함께 다시 요청 */
	@PostMapping("/resales/{id}/entries")
	public ResaleEntry enter(@PathVariable Long id, @Valid @RequestBody EntryRequest req) {
		return resaleService.enter(id, req.buyerUid(), req.captchaId(), req.captchaAnswer());
	}

	/** 응모 마감 후 추첨 (MVP: 관리자 웹에서 버튼으로 실행) */
	@PostMapping("/resales/{id}/draw")
	public ResaleListing draw(@PathVariable Long id) {
		return resaleService.draw(id);
	}

	/** 결제 기한 초과 처리 (MVP: 버튼으로 실행. TODO: 스케줄러) */
	@PostMapping("/resales/{id}/forfeit")
	public ResaleListing forfeit(@PathVariable Long id) {
		return resaleService.forfeit(id);
	}

	/** 당첨자 결제 → 재발급 → 정산까지 한 번에 진행 */
	@PostMapping("/resales/{id}/pay")
	public ResaleListing pay(@PathVariable Long id, @Valid @RequestBody EntryRequest req) {
		return resaleService.pay(id, req.buyerUid());
	}

	@DeleteMapping("/resales/{id}")
	public ResaleListing cancel(@PathVariable Long id) {
		return resaleService.cancel(id);
	}

	public record FailReissueRequest(boolean enabled) {
	}

	/** 시연용: 재발급 실패 스위치 */
	@PostMapping("/demo/fail-reissue")
	public Map<String, Boolean> failReissue(@RequestBody FailReissueRequest req) {
		resaleService.setFailReissue(req.enabled());
		return Map.of("enabled", resaleService.isFailReissue());
	}

	/** 시연용: 다음 재발급 1회의 응답을 잃어버리게 한다 (멱등키 재시도 시연) */
	@PostMapping("/demo/lose-reissue-response")
	public Map<String, Boolean> loseReissueResponse(@RequestBody FailReissueRequest req) {
		resaleService.setLoseReissueResponse(req.enabled());
		return Map.of("enabled", resaleService.isLoseReissueResponse());
	}

	@GetMapping("/demo/lose-reissue-response")
	public Map<String, Boolean> loseReissueResponseState() {
		return Map.of("enabled", resaleService.isLoseReissueResponse());
	}

	@GetMapping("/demo/fail-reissue")
	public Map<String, Boolean> failReissueState() {
		return Map.of("enabled", resaleService.isFailReissue());
	}
}
