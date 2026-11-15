package com.fairticket.vendor.security;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/identity")
public class IdentityController {

	private final IdentityService identity;

	public IdentityController(IdentityService identity) {
		this.identity = identity;
	}

	public record VerifyRequest(Long memberId, String code) {
	}

	/** 휴대폰 본인인증 (시연용: 인증번호 123456) */
	@PostMapping("/verify")
	public ResponseEntity<Map<String, Object>> verify(@RequestBody VerifyRequest req) {
		if (!identity.verify(req.memberId(), req.code())) {
			return ResponseEntity.status(403).body(Map.of("error", "인증번호가 맞지 않습니다"));
		}
		return ResponseEntity.ok(Map.of("verified", true, "validMinutes", 10));
	}
}
