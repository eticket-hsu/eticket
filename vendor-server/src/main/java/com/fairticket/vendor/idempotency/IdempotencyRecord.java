package com.fairticket.vendor.idempotency;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * 멱등키 처리 기록 (설계 문서 D묶음 21번).
 * 테이블 생성용 엔티티이고, 읽고 쓰기는 IdempotencyStore 가 JDBC 로 한다
 * (같은 키의 동시 요청을 기본 키 충돌로 막기 위해 INSERT 를 직접 쓴다).
 */
@Entity
@Table(name = "idempotency_record")
public class IdempotencyRecord {

	/** 호출자 + 멱등키 */
	@Id
	@Column(name = "idem_key", length = 300)
	private String idemKey;

	/** 요청 지문 (메서드 + 경로 + 본문의 SHA-256). 같은 키로 다른 요청을 보내면 거절 */
	@Column(name = "request_hash", nullable = false, length = 64)
	private String requestHash;

	/** PROCESSING: 처리 중, DONE: 응답 저장됨 */
	@Column(nullable = false, length = 16)
	private String state;

	@Column(name = "http_status")
	private Integer httpStatus;

	@Lob
	@Column(name = "response_body")
	private String responseBody;

	@Column(name = "created_at", nullable = false)
	private LocalDateTime createdAt;

	protected IdempotencyRecord() {
	}
}
