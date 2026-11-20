package com.eticket.vendor.auth;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.eticket.vendor.config.VendorProperties;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 표준 API(/ft/*)는 eTicket 이 서명한 요청만 받는다 (D묶음 22번).
 * 서명이 없거나 틀리면 401. 멱등키 처리(IdempotencyFilter)보다 먼저 돈다.
 */
@Component
@Order(5)
public class FtAuthFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(FtAuthFilter.class);

	private final RequestSigning.Verifier verifier;

	public FtAuthFilter(VendorProperties props) {
		this.verifier = new RequestSigning.Verifier(Map.of("eticket", List.copyOf(props.ftInboundSecrets())));
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest req) {
		return !req.getRequestURI().startsWith("/ft/");
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
