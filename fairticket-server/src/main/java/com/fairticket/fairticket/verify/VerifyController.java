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

	private static final Pattern QR = Pattern.compile("^(FT:([a-z0-9-]+):\\d+:\\d+)\\..+$");

	private final VendorClient vendors;
	private final VerifyLogRepository logs;

	public VerifyController(VendorClient vendors, VerifyLogRepository logs) {
		this.vendors = vendors;
		this.logs = logs;
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
		return out;
	}

	@GetMapping("/verify/logs")
	public List<VerifyLog> recentLogs() {
		return logs.findTop50ByOrderByIdDesc();
	}
}
