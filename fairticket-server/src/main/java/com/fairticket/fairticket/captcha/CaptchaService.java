package com.fairticket.fairticket.captcha;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * FairTicket 이 연동 예매처에 제공하는 공통 보안문자.
 * 위험 등급 MEDIUM 은 보안문자, HIGH 는 보안문자 + 본인인증으로 구매·응모를 허용한다.
 *
 * 한계: 보안문자 풀이 대행(사람·AI)으로 뚫릴 수 있다. 그래서 단독 방어가 아니라 여러 겹 중 하나로 쓰고,
 * 통과한 뒤에도 위험 분석은 계속한다. 실서비스에서는 상용 보안문자·작업증명(PoW) 방식을 검토한다.
 */
@Service
public class CaptchaService {

	private static final int TTL_SECONDS = 120;
	private final SecureRandom random = new SecureRandom();
	private final Map<String, Entry> store = new ConcurrentHashMap<>();

	private record Entry(String answer, LocalDateTime expiresAt) {
	}

	public record Challenge(String id, String image) {
	}

	public Challenge create() {
		String answer = String.valueOf(10000 + random.nextInt(90000));
		String id = UUID.randomUUID().toString();
		store.put(id, new Entry(answer, LocalDateTime.now().plusSeconds(TTL_SECONDS)));
		String svg = render(answer);
		return new Challenge(id,
				"data:image/svg+xml;base64," + Base64.getEncoder().encodeToString(svg.getBytes(StandardCharsets.UTF_8)));
	}

	/** 한 번만 쓸 수 있다. 맞든 틀리든 확인하면 사라진다. */
	public boolean verify(String id, String answer) {
		if (id == null || answer == null) {
			return false;
		}
		Entry e = store.remove(id);
		return e != null && e.expiresAt().isAfter(LocalDateTime.now()) && e.answer().equals(answer.trim());
	}

	/** 시연·자동 시험용 정답 조회 (fairticket.demo-mode 가 켜졌을 때만 컨트롤러가 노출) */
	public String peek(String id) {
		Entry e = store.get(id);
		return e == null ? null : e.answer();
	}

	@Scheduled(fixedDelay = 60_000)
	public void sweep() {
		LocalDateTime now = LocalDateTime.now();
		store.entrySet().removeIf(en -> en.getValue().expiresAt().isBefore(now));
	}

	/** 숫자 5개를 기울이고 방해선을 넣은 SVG */
	private String render(String text) {
		StringBuilder sb = new StringBuilder(
				"<svg xmlns='http://www.w3.org/2000/svg' width='180' height='60' viewBox='0 0 180 60'>"
						+ "<rect width='180' height='60' rx='8' fill='#eef1f6'/>");
		for (int i = 0; i < 6; i++) {
			sb.append("<path d='M").append(random.nextInt(180)).append(' ').append(random.nextInt(60))
				.append(" Q").append(random.nextInt(180)).append(' ').append(random.nextInt(60)).append(' ')
				.append(random.nextInt(180)).append(' ').append(random.nextInt(60))
				.append("' stroke='#9aa4b5' stroke-width='1.5' fill='none'/>");
		}
		for (int i = 0; i < text.length(); i++) {
			int x = 20 + i * 30 + random.nextInt(6);
			int y = 40 + random.nextInt(10) - 5;
			int rot = random.nextInt(50) - 25;
			sb.append("<text x='").append(x).append("' y='").append(y)
				.append("' font-family='monospace' font-size='30' font-weight='700' fill='#2b3446' transform='rotate(")
				.append(rot).append(' ').append(x).append(' ').append(y).append(")'>").append(text.charAt(i))
				.append("</text>");
		}
		for (int i = 0; i < 40; i++) {
			sb.append("<circle cx='").append(random.nextInt(180)).append("' cy='").append(random.nextInt(60))
				.append("' r='1' fill='#7d879a'/>");
		}
		return sb.append("</svg>").toString();
	}
}
