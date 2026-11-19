package com.fairticket.fairticket.verify;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fairticket.fairticket.risk.ReviewService;

import com.fairticket.fairticket.vendor.VendorClient;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

/**
 * 입장 검증 중계. QR 확인 화면은 어느 예매처 티켓이든 여기로 보낸다.
 * FairTicket 은 QR 에서 발행처를 찾아 넘길 뿐, 입장 가능 여부는 발행처 기록으로 판단한다.
 * (서명 검증도 비밀키를 가진 발행처가 한다)
 */
@RestController
@RequestMapping("/v1")
public class VerifyController {

	/** FT:{발행처}:{티켓}:{버전}[:{시간칸}].{서명}. 시간칸은 계속 바뀌는 QR 에만 있다 */
	private static final Pattern QR = Pattern.compile("^(FT:([a-z0-9-]+):\\d+:\\d+)(?::\\d+)?\\..+$");

	private final VendorClient vendors;
	private final VerifyLogRepository logs;
	private final ReviewService review;

	public VerifyController(VendorClient vendors, VerifyLogRepository logs, ReviewService review) {
		this.vendors = vendors;
		this.logs = logs;
		this.review = review;
	}

	public record VerifyRequest(@NotBlank String qr, String gate) {
	}

	@PostMapping("/verify")
	public Map<String, Object> verify(@Valid @RequestBody VerifyRequest req) {
		String gate = req.gate() == null ? "A" : req.gate();
		Matcher m = QR.matcher(req.qr().trim());
		if (!m.matches()) {
			logs.save(new VerifyLog(null, null, "MALFORMED", gate));
			return Map.of("admitted", false, "result", "MALFORMED", "message", "FairTicket QR 형식이 아닙니다");
		}
		String vendorId = m.group(2);
		if (!vendors.isKnown(vendorId)) {
			logs.save(new VerifyLog(vendorId, m.group(1), "UNKNOWN_VENDOR", gate));
			return Map.of("admitted", false, "result", "UNKNOWN_VENDOR", "message", "연동되지 않은 발행처입니다");
		}
		Map<?, ?> vendorResult = vendors.admit(vendorId, req.qr().trim());
		logs.save(new VerifyLog(vendorId, m.group(1), String.valueOf(vendorResult.get("result")), gate));

		Map<String, Object> out = new HashMap<>();
		vendorResult.forEach((k, v) -> out.put(String.valueOf(k), v));
		out.put("vendorName", vendors.nameOf(vendorId));
		addIdCheck(out);
		return out;
	}

	/**
	 * 위험한 표만 현장 신분증 확인: 사후 검토 의심 목록(신호 2개 이상)에 있는 사람의 표면
	 * 입장 화면에 "신분증 확인 필요"와 예매자 이름(가운데 가림)을 띄운다.
	 * 모든 관객을 확인하면 줄이 길어지므로 의심 표만 확인한다. 업자가 중고폰째 넘기거나 현장에서 들여보내는 경우의 마지막 방어선.
	 */
	private void addIdCheck(Map<String, Object> out) {
		Object uid = out.remove("ownerFtUid");
		Object name = out.remove("ownerName");
		Object perf = out.remove("performanceCode");
		if (!Boolean.TRUE.equals(out.get("admitted")) || uid == null || perf == null) {
			return;
		}
		review.review(String.valueOf(perf))
			.suspects()
			.stream()
			.filter(s -> s.uid().equals(uid))
			.findFirst()
			.ifPresent(s -> out.put("idCheck", Map.of("required", true, "ownerName", mask(String.valueOf(name)),
					"reasons", s.flags())));
	}

	/** 김재우 → 김*우, 민지 → 민* */
	static String mask(String name) {
		if (name == null || name.length() < 2) {
			return "*";
		}
		if (name.length() == 2) {
			return name.charAt(0) + "*";
		}
		return name.charAt(0) + "*".repeat(name.length() - 2) + name.charAt(name.length() - 1);
	}

	@GetMapping("/verify/logs")
	public List<VerifyLog> recentLogs() {
		return logs.findTop50ByOrderByIdDesc();
	}
}
