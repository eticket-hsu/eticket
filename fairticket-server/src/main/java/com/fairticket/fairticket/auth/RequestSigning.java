package com.fairticket.fairticket.auth;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;

/**
 * 서버 간 요청 서명 (설계 문서 D묶음 22번). FairTicket 과 예매처가 같은 규칙을 쓴다.
 *
 * 비밀키는 네트워크로 보내지 않고, 그 키로 만든 서명만 보낸다.
 *   X-FT-Client    보낸 쪽 ID (fairticket, star, moon)
 *   X-FT-Timestamp 보낸 시각 (유닉스 초). 받는 쪽 시계와 5분 넘게 차이 나면 거절
 *   X-FT-Nonce     요청마다 새로 만드는 난수. 같은 값이 다시 오면 재전송 공격으로 보고 거절
 *   X-FT-Signature HMAC-SHA256(비밀키, 메서드 / 경로+쿼리 / 시각 / 난수 / 멱등키 / 본문 SHA-256)
 * 본문이나 경로를 한 글자라도 바꾸면 서명이 맞지 않는다.
 */
public final class RequestSigning {

	public static final String CLIENT = "X-FT-Client";
	public static final String TIMESTAMP = "X-FT-Timestamp";
	public static final String NONCE = "X-FT-Nonce";
	public static final String SIGNATURE = "X-FT-Signature";
	/** 인증된 호출자 ID 를 담는 요청 속성 */
	public static final String CALLER_ATTR = "ft.caller";
	public static final long MAX_SKEW_SECONDS = 300;

	private static final SecureRandom RANDOM = new SecureRandom();

	private RequestSigning() {
	}

	static String canonical(String method, String pathAndQuery, String ts, String nonce, String idemKey,
			byte[] body) {
		return String.join("\n", method.toUpperCase(), pathAndQuery, ts, nonce, idemKey == null ? "" : idemKey,
				sha256Hex(body == null ? new byte[0] : body));
	}

	static String hmac(String secret, String data) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
			return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException | InvalidKeyException e) {
			throw new IllegalStateException(e);
		}
	}

	static String sha256Hex(byte[] data) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	static String pathAndQuery(URI uri) {
		return uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery());
	}

	/** 나가는 요청에 서명을 붙이는 RestClient 인터셉터 */
	public static ClientHttpRequestInterceptor signer(String clientId, String secret) {
		return new ClientHttpRequestInterceptor() {
			@Override
			public ClientHttpResponse intercept(HttpRequest req, byte[] body, ClientHttpRequestExecution exec)
					throws IOException {
				String ts = String.valueOf(Instant.now().getEpochSecond());
				byte[] n = new byte[16];
				RANDOM.nextBytes(n);
				String nonce = HexFormat.of().formatHex(n);
				String sig = hmac(secret, canonical(req.getMethod().name(), pathAndQuery(req.getURI()), ts, nonce,
						req.getHeaders().getFirst("Idempotency-Key"), body));
				req.getHeaders().set(CLIENT, clientId);
				req.getHeaders().set(TIMESTAMP, ts);
				req.getHeaders().set(NONCE, nonce);
				req.getHeaders().set(SIGNATURE, sig);
				return exec.execute(req, body);
			}
		};
	}

	/** 들어오는 요청 검증기. 실패하면 이유를, 성공하면 null 을 돌려준다 */
	public static final class Verifier {

		/** 보낸 쪽 ID → 받을 수 있는 비밀키 목록 (키 교체 중에는 옛 키와 새 키를 함께 둔다) */
		private final Map<String, List<String>> secrets;
		/** 최근에 본 난수 → 만료 시각. 시각 허용 범위(±5분) 동안만 기억하면 충분하다 */
		private final Map<String, Long> seenNonces = new ConcurrentHashMap<>();

		public Verifier(Map<String, List<String>> secrets) {
			this.secrets = secrets;
		}

		public String verify(HttpServletRequest req, byte[] body) {
			String client = req.getHeader(CLIENT), ts = req.getHeader(TIMESTAMP), nonce = req.getHeader(NONCE),
					sig = req.getHeader(SIGNATURE);
			if (client == null || ts == null || nonce == null || sig == null) {
				return "서버 간 인증 헤더(X-FT-Client, X-FT-Timestamp, X-FT-Nonce, X-FT-Signature)가 필요합니다";
			}
			List<String> keys = secrets.get(client);
			if (keys == null || keys.isEmpty()) {
				return "등록되지 않은 호출자입니다: " + client;
			}
			long now = Instant.now().getEpochSecond(), sent;
			try {
				sent = Long.parseLong(ts);
			}
			catch (NumberFormatException e) {
				return "잘못된 시각 형식입니다";
			}
			if (Math.abs(now - sent) > MAX_SKEW_SECONDS) {
				return "요청 시각이 허용 범위(±5분)를 벗어났습니다";
			}
			String path = req.getRequestURI() + (req.getQueryString() == null ? "" : "?" + req.getQueryString());
			String data = canonical(req.getMethod(), path, ts, nonce, req.getHeader("Idempotency-Key"), body);
			byte[] given = sig.getBytes(StandardCharsets.UTF_8);
			boolean ok = keys.stream()
				.anyMatch(k -> MessageDigest.isEqual(hmac(k, data).getBytes(StandardCharsets.UTF_8), given));
			if (!ok) {
				return "서명이 맞지 않습니다";
			}
			// 서명이 맞은 뒤에만 난수를 기록한다 (아무나 난수 저장소를 채우지 못하게)
			seenNonces.values().removeIf(exp -> exp < now);
			if (seenNonces.putIfAbsent(client + ":" + nonce, now + MAX_SKEW_SECONDS * 2) != null) {
				return "이미 처리한 요청을 다시 보냈습니다 (재전송 차단)";
			}
			req.setAttribute(CALLER_ATTR, client);
			return null;
		}
	}

	/** 본문을 한 번 읽어 서명을 확인한 뒤에도 다음 단계가 다시 읽을 수 있게 한다 */
	public static final class CachedBodyRequest extends HttpServletRequestWrapper {

		private final byte[] body;

		public CachedBodyRequest(HttpServletRequest req, byte[] body) {
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
