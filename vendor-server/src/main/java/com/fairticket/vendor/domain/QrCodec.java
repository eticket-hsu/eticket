package com.fairticket.vendor.domain;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

import com.fairticket.vendor.config.VendorProperties;

/**
 * QR 내용: "FT:{발행처ID}:{티켓ID}:{발급버전}.{서명}".
 * 서명은 발행처 비밀키로 만든 HMAC-SHA256 이라 위조를 걸러낸다.
 * 고정 QR 이므로 복사는 막지 못하고, 서버의 1회 사용 처리가 최종 방어선이다.
 */
@Component
public class QrCodec {

	private final VendorProperties props;

	public QrCodec(VendorProperties props) {
		this.props = props;
	}

	public String encode(Ticket ticket) {
		String body = "FT:%s:%d:%d".formatted(props.id(), ticket.getId(), ticket.getIssueVersion());
		return body + "." + sign(body);
	}

	/** 형식이 틀리면 null. 서명 검증 결과는 validSignature 로 돌려준다. */
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
		if (parts.length != 4 || !"FT".equals(parts[0])) {
			return null;
		}
		try {
			boolean valid = MessageDigest.isEqual(sign(body).getBytes(StandardCharsets.UTF_8),
					sig.getBytes(StandardCharsets.UTF_8));
			return new Parsed(parts[1], Long.parseLong(parts[2]), Integer.parseInt(parts[3]), valid);
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

	public record Parsed(String vendorId, long ticketId, int version, boolean validSignature) {
	}
}
