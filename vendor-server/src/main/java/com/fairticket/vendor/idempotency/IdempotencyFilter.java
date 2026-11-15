package com.fairticket.vendor.idempotency;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import com.fairticket.vendor.auth.RequestSigning;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 표준 API(/ft/*)의 상태를 바꾸는 요청에 Idempotency-Key 를 강제하고 처리한다 (D묶음 21번).
 *
 * 1. 키가 없으면 400 으로 거절한다.
 * 2. 처음 보는 키면 처리하고, 응답(상태 코드 + 본문)을 저장한다.
 * 3. 이미 처리한 키면 다시 처리하지 않고 저장한 응답을 그대로 돌려준다 (Idempotent-Replayed: true).
 * 4. 같은 키로 내용이 다른 요청이 오면 422, 아직 처리 중이면 409 로 거절한다.
 * 5. 서버 오류(5xx)는 저장하지 않아 같은 키로 다시 시도할 수 있다.
 *
 * 예: FairTicket 이 재발급을 요청했는데 응답이 네트워크에서 사라져 같은 키로 다시 보내면,
 * 발급 버전을 한 번 더 올리지 않고 첫 번째 결과를 돌려준다.
 */
@Component
@Order(10)
public class IdempotencyFilter extends OncePerRequestFilter {

	public static final String HEADER = "Idempotency-Key";
	private static final Logger log = LoggerFactory.getLogger(IdempotencyFilter.class);
	/** 상태를 바꾸지만 그 자체로 한 번만 성공하는 호출(입장 처리: 조건부 업데이트)은 제외 */
	private static final Set<String> EXEMPT = Set.of("/ft/admit");

	private final IdempotencyStore store;

	public IdempotencyFilter(IdempotencyStore store) {
		this.store = store;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest req) {
		return !"POST".equals(req.getMethod()) || !req.getRequestURI().startsWith("/ft/")
				|| EXEMPT.contains(req.getRequestURI());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
			throws ServletException, IOException {
		String idem = req.getHeader(HEADER);
		if (idem == null || idem.isBlank() || idem.length() > 200) {
			error(res, 400, "Idempotency-Key 헤더가 필요합니다 (1~200자)");
			return;
		}
		byte[] body = req.getInputStream().readAllBytes();
		// 호출자별로 키 공간을 나눈다 (FtAuthFilter 가 서명으로 확인한 호출자 ID)
		Object caller = req.getAttribute(RequestSigning.CALLER_ATTR);
		String key = (caller == null ? "fairticket" : caller) + ":" + idem;
		String hash = sha256(req.getMethod() + " " + req.getRequestURI() + "\n", body);

		if (!store.claim(key, hash)) {
			Optional<IdempotencyStore.Saved> saved = store.find(key);
			if (saved.isEmpty()) { // 그 사이 5xx 로 지워진 경우: 다시 시도하도록 안내
				error(res, 409, "같은 요청을 처리하는 중입니다. 잠시 후 다시 시도하세요");
				return;
			}
			IdempotencyStore.Saved s = saved.get();
			if (!s.requestHash().equals(hash)) {
				error(res, 422, "같은 Idempotency-Key 로 내용이 다른 요청을 보낼 수 없습니다");
				return;
			}
			if (!"DONE".equals(s.state())) {
				error(res, 409, "같은 요청을 처리하는 중입니다. 잠시 후 다시 시도하세요");
				return;
			}
			log.info("[멱등키] {} {} 재요청 → 저장된 응답({}) 반환, 다시 처리하지 않음", req.getRequestURI(), idem,
					s.httpStatus());
			res.setStatus(s.httpStatus());
			res.setHeader("Idempotent-Replayed", "true");
			res.setContentType(MediaType.APPLICATION_JSON_VALUE);
			res.setCharacterEncoding("UTF-8");
			if (s.responseBody() != null) {
				res.getOutputStream().write(s.responseBody().getBytes(StandardCharsets.UTF_8));
			}
			return;
		}

		ContentCachingResponseWrapper wrapped = new ContentCachingResponseWrapper(res);
		try {
			chain.doFilter(new CachedBodyRequest(req, body), wrapped);
		}
		catch (ServletException | IOException | RuntimeException e) {
			store.forget(key);
			throw e;
		}
		int status = wrapped.getStatus();
		if (status >= 500) {
			store.forget(key);
		}
		else {
			store.complete(key, status, new String(wrapped.getContentAsByteArray(), StandardCharsets.UTF_8));
		}
		wrapped.copyBodyToResponse();
	}

	private static void error(HttpServletResponse res, int status, String message) throws IOException {
		res.setStatus(status);
		res.setContentType(MediaType.APPLICATION_JSON_VALUE);
		res.setCharacterEncoding("UTF-8");
		res.getWriter().write("{\"error\":\"" + message.replace("\"", "'") + "\"}");
	}

	private static String sha256(String head, byte[] body) {
		try {
			MessageDigest md = MessageDigest.getInstance("SHA-256");
			md.update(head.getBytes(StandardCharsets.UTF_8));
			md.update(body);
			return HexFormat.of().formatHex(md.digest());
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** 본문을 한 번 읽어 해시를 만든 뒤에도 컨트롤러가 다시 읽을 수 있게 한다 */
	private static final class CachedBodyRequest extends HttpServletRequestWrapper {

		private final byte[] body;

		CachedBodyRequest(HttpServletRequest req, byte[] body) {
			super(req);
			this.body = body;
		}

		@Override
		public ServletInputStream getInputStream() {
			ByteArrayInputStream in = new ByteArrayInputStream(body);
			return new ServletInputStream() {
				@Override
				public int read() {
					return in.read();
				}

				@Override
				public int read(byte[] b, int off, int len) {
					return in.read(b, off, len);
				}

				@Override
				public boolean isFinished() {
					return in.available() == 0;
				}

				@Override
				public boolean isReady() {
					return true;
				}

				@Override
				public void setReadListener(ReadListener listener) {
					throw new UnsupportedOperationException();
				}
			};
		}

		@Override
		public int getContentLength() {
			return body.length;
		}

		@Override
		public long getContentLengthLong() {
			return body.length;
		}
	}
}
