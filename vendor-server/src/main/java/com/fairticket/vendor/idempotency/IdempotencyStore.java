package com.fairticket.vendor.idempotency;

import java.time.LocalDateTime;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 멱등키 기록 저장소. 24시간 보관 후 삭제한다. */
@Component
public class IdempotencyStore {

	static final int RETENTION_HOURS = 24;
	private static final Logger log = LoggerFactory.getLogger(IdempotencyStore.class);

	private final JdbcTemplate jdbc;

	public IdempotencyStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public record Saved(String requestHash, String state, Integer httpStatus, String responseBody) {
	}

	/** 처음 보는 키면 PROCESSING 으로 선점하고 true. 이미 있으면 false (기본 키 충돌 = 동시 요청도 하나만 통과) */
	public boolean claim(String key, String requestHash) {
		try {
			jdbc.update("INSERT INTO idempotency_record (idem_key, request_hash, state, created_at) VALUES (?, ?, 'PROCESSING', ?)",
					key, requestHash, LocalDateTime.now());
			return true;
		}
		catch (DuplicateKeyException e) {
			return false;
		}
	}

	public Optional<Saved> find(String key) {
		return jdbc.query("SELECT request_hash, state, http_status, response_body FROM idempotency_record WHERE idem_key = ?",
				(rs, i) -> new Saved(rs.getString(1), rs.getString(2), (Integer) rs.getObject(3), rs.getString(4)), key)
			.stream()
			.findFirst();
	}

	public void complete(String key, int httpStatus, String body) {
		jdbc.update("UPDATE idempotency_record SET state = 'DONE', http_status = ?, response_body = ? WHERE idem_key = ?",
				httpStatus, body, key);
	}

	/** 서버 오류(5xx)는 저장하지 않고 지워서, 같은 키로 다시 시도할 수 있게 한다 */
	public void forget(String key) {
		jdbc.update("DELETE FROM idempotency_record WHERE idem_key = ?", key);
	}

	@Scheduled(fixedDelay = 600_000)
	public void purgeExpired() {
		int n = jdbc.update("DELETE FROM idempotency_record WHERE created_at < ?",
				LocalDateTime.now().minusHours(RETENTION_HOURS));
		if (n > 0) {
			log.info("멱등키 기록 {}건 삭제 (보관 {}시간 경과)", n, RETENTION_HOURS);
		}
	}
}
