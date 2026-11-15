package com.fairticket.fairticket.captcha;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fairticket.fairticket.config.FairTicketProperties;

@RestController
@RequestMapping("/v1")
public class CaptchaController {

	private final CaptchaService captcha;
	private final FairTicketProperties props;

	public CaptchaController(CaptchaService captcha, FairTicketProperties props) {
		this.captcha = captcha;
		this.props = props;
	}

	/** 예매처 화면이 보안문자 이미지를 받아 간다 */
	@GetMapping("/captcha")
	public CaptchaService.Challenge create() {
		return captcha.create();
	}

	public record VerifyRequest(String id, String answer) {
	}

	/** 예매처 서버가 사용자의 답을 확인한다 (1회용) */
	@PostMapping("/captcha/verify")
	public Map<String, Boolean> verify(@RequestBody VerifyRequest req) {
		return Map.of("ok", captcha.verify(req.id(), req.answer()));
	}

	/** 시연·자동 시험 전용. 실서비스에서는 demo-mode 를 끈다. */
	@GetMapping("/demo/captcha/{id}")
	public ResponseEntity<Map<String, String>> peek(@PathVariable String id) {
		if (!props.demoMode()) {
			return ResponseEntity.notFound().build();
		}
		String a = captcha.peek(id);
		return a == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(Map.of("answer", a));
	}
}
