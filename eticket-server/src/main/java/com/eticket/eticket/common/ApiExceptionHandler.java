package com.eticket.eticket.common;

import java.util.Map;
import java.util.NoSuchElementException;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientResponseException;

import com.eticket.eticket.auth.Callers;
import com.eticket.eticket.captcha.CaptchaRequiredException;
import com.eticket.eticket.quota.QuotaExceededException;

/** 모든 오류를 {"error": "..."} 형태로 돌려준다. */
@RestControllerAdvice
public class ApiExceptionHandler {

	@ExceptionHandler(NoSuchElementException.class)
	ResponseEntity<Map<String, String>> notFound(NoSuchElementException e) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", String.valueOf(e.getMessage())));
	}

	@ExceptionHandler({ IllegalStateException.class, IllegalArgumentException.class })
	ResponseEntity<Map<String, String>> conflict(RuntimeException e) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", String.valueOf(e.getMessage())));
	}

	@ExceptionHandler(QuotaExceededException.class)
	ResponseEntity<Map<String, Object>> quota(QuotaExceededException e) {
		return ResponseEntity.status(HttpStatus.CONFLICT)
			.body(Map.of("error", e.getMessage(), "quotaExceeded", true, "used", e.getUsed(), "limit", e.getLimit()));
	}

	/** 다른 예매처 이름으로 보낸 요청, 다른 예매처의 한도 예약을 건드리는 요청 */
	@ExceptionHandler(Callers.CallerMismatchException.class)
	ResponseEntity<Map<String, String>> forbidden(Callers.CallerMismatchException e) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
	}

	@ExceptionHandler(CaptchaRequiredException.class)
	ResponseEntity<Map<String, Object>> captcha(CaptchaRequiredException e) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN)
			.body(Map.of("error", e.getMessage(), "captchaRequired", true, "wrong", e.isWrong()));
	}

	/** 발행처가 거절한 경우 (예: 이미 잠긴 티켓) */
	@ExceptionHandler(RestClientResponseException.class)
	ResponseEntity<Map<String, String>> vendorRejected(RestClientResponseException e) {
		return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
			.body(Map.of("error", "발행처 응답 오류", "detail", e.getResponseBodyAsString()));
	}

	/** 발행처 서버에 연결할 수 없는 경우 */
	@ExceptionHandler(ResourceAccessException.class)
	ResponseEntity<Map<String, String>> vendorDown(ResourceAccessException e) {
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(Map.of("error", "발행처 연결 실패", "detail", String.valueOf(e.getMessage())));
	}
}
