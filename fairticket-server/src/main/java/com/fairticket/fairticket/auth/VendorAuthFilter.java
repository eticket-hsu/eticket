package com.fairticket.fairticket.auth;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.fairticket.fairticket.config.FairTicketProperties;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 예매처 전용 API 는 연동된 예매처가 서명한 요청만 받는다 (D묶음 22번).
 * 서명으로 확인된 예매처 ID 는 요청 속성(ft.caller)에 담기고, 컨트롤러는 본문의 vendorId 대신 이 값을 믿는다.
 */
@Component
@Order(5)
public class VendorAuthFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(VendorAuthFilter.class);

	/** 예매처 서버만 부르는 API: 구매 기록, 위험 조회, 보안문자 확인, 공통 한도, 재판매 등록 */
	private static final List<Route> VENDOR_ONLY = List.of(
			new Route("POST", Pattern.compile("/v1/purchase-events")),
			new Route("GET", Pattern.compile("/v1/risk")),
			new Route("POST", Pattern.compile("/v1/captcha/verify")),
			new Route("POST", Pattern.compile("/v1/quota/reserve")),
			new Route("POST", Pattern.compile("/v1/quota/\\d+/(confirm|release)")),
			new Route("POST", Pattern.compile("/v1/resales")));

	private record Route(String method, Pattern path) {
	}

	private final RequestSigning.Verifier verifier;

	public VendorAuthFilter(FairTicketProperties props) {
		Map<String, List<String>> secrets = new HashMap<>();
		props.vendors().forEach((id, v) -> secrets.put(id, List.copyOf(v.inboundSecrets())));
		this.verifier = new RequestSigning.Verifier(secrets);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest req) {
		String uri = req.getRequestURI();
		return VENDOR_ONLY.stream().noneMatch(r -> r.method().equals(req.getMethod()) && r.path().matcher(uri).matches());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
			throws ServletException, IOException {
		byte[] body = req.getInputStream().readAllBytes();
		String error = verifier.verify(req, body);
		if (error != null) {
			log.warn("[인증 거절] {} {} from {}: {}", req.getMethod(), req.getRequestURI(), req.getRemoteAddr(), error);
			res.setStatus(401);
			res.setContentType(MediaType.APPLICATION_JSON_VALUE);
			res.setCharacterEncoding("UTF-8");
			res.getWriter().write("{\"error\":\"" + error.replace("\"", "'") + "\"}");
			return;
		}
		chain.doFilter(new RequestSigning.CachedBodyRequest(req, body), res);
	}
}
