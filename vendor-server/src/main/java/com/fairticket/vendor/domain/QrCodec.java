package com.fairticket.vendor.domain;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.fairticket.vendor.config.VendorProperties;

/**
 * 계속 바뀌는 QR: "FT:{발행처ID}:{티켓ID}:{발급버전}:{시간칸}.{서명}".
 *
 * 시간칸 = 현재 시각(초) / 30. 30초마다 QR 내용이 바뀐다.
 * 입장 검증은 지금 칸과 바로 앞 칸만 받으므로, 화면을 캡처한 QR 은 1분이 지나면 거절된다.
 * 서명은 발행처 비밀키로 만든 HMAC-SHA256 이라 시간칸을 고쳐 쓸 수 없다 (티켓마스터 SafeTix 와 같은 방식).
 *
 * 예전 고정 QR("FT:{발행처}:{티켓}:{버전}.{서명}")도 읽기는 하지만, 시간칸이 없으므로 만료로 처리한다.
 */
@Component
public class QrCodec {

	/** QR 이 바뀌는 간격(초) */
	public static final int WINDOW_SECONDS = 30;
	/** 지금 칸보다 몇 칸 전까지 받나. 1이면 최대 약 60초 전 QR 까지 (화면 갱신·네트워크 지연 여유) */
	public static final int ACCEPT_PAST_WINDOWS = 1;

	private final VendorProperties props;

	public QrCodec(VendorProperties props) {
		this.props = props;
	}

	public static long currentWindow() {
		return Instant.now().getEpochSecond() / WINDOW_SECONDS;
	}

	/** 지금 시각의 QR */
	public String encode(Ticket ticket) {
		return encode(ticket, currentWindow());
	}

	public String encode(Ticket ticket, long window) {
		String body = "FT:%s:%d:%d:%d".formatted(props.id(), ticket.getId(), ticket.getIssueVersion(), window);
		return body + "." + sign(body);
	}

	/** 이 시간칸의 QR 이 다음 것으로 바뀌는 시각 (화면 표시용, epoch ms) */
	public static long refreshAtMillis(long window) {
		return (window + 1) * WINDOW_SECONDS * 1000L;
	}

	/** 이 시간칸의 QR 이 입장에서 더는 받아지지 않는 시각 (epoch ms) */
	public static long expiresAtMillis(long window) {
		return (window + 1 + ACCEPT_PAST_WINDOWS) * WINDOW_SECONDS * 1000L;
	}

	/** 지금 입장에 쓸 수 있는 시간칸인지 (시계 오차로 한 칸 앞선 것도 허용) */
	public static boolean fresh(long window) {
		long now = currentWindow();
		return window >= now - ACCEPT_PAST_WINDOWS && window <= now + 1;
	}

	/** 형식이 틀리면 null. 서명 검증 결과는 validSignature 로 돌려준다. 고정 QR 은 window 가 null */
	public Parsed parse(String qr) {
		if (qr == null) {
			return null;
		}
		int dot = qr.lastIndexOf('.');
		if (dot < 0) {
			return null;
		}
		String body = qr.substring(0, dot);
		String sig = qr.substring(dot + 1);
		String[] parts = body.split(":");
		if ((parts.length != 4 && parts.length != 5) || !"FT".equals(parts[0])) {
			return null;
		}
		try {
			boolean valid = MessageDigest.isEqual(sign(body).getBytes(StandardCharsets.UTF_8),
					sig.getBytes(StandardCharsets.UTF_8));
			Long window = parts.length == 5 ? Long.parseLong(parts[4]) : null;
			return new Parsed(parts[1], Long.parseLong(parts[2]), Integer.parseInt(parts[3]), window, valid);
		}
		catch (NumberFormatException e) {
			return null;
		}
	}

	private String sign(String body) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(props.qrSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
			byte[] raw = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
			return Base64.getUrlEncoder().withoutPadding().encodeToString(raw).substring(0, 16);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}

	public record Parsed(String vendorId, long ticketId, int version, Long window, boolean validSignature) {
	}
}
