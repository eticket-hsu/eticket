package com.fairticket.fairticket.risk;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** 예매처가 보내는 구매 시도 이벤트. 위험 분석의 입력이다. */
@Entity
@Table(indexes = { @Index(columnList = "uid,occurredAt"), @Index(columnList = "ipHash,occurredAt"),
		@Index(columnList = "deviceHash,occurredAt") })
public class PurchaseEvent {

	@Id
	@GeneratedValue
	private Long id;

	private String vendorId;

	/** 가상 공통 사용자 식별자 (실서비스에선 해시) */
	private String uid;

	private String performanceCode;

	private String action;

	/** ATTEMPT | SUCCESS | HELD | FAIL | QUOTA(공통 한도 초과) | CAPTCHA_FAIL */
	private String result;

	/** 좌석 화면을 연 뒤 예매 요청까지 걸린 시간(ms). -1 = 화면 없이 바로 요청, null = 측정 안 함 */
	private Integer reactionMs;

	/** IP 원문은 저장하지 않는다 */
	private String ipHash;

	/** IP 종류 (IpIntelligence.IpType). 원래 IP 대신 종류만 남긴다 */
	private String ipType;

	/** 브라우저 시간대 (예: Asia/Seoul). IP 위치와 다르면 VPN 신호 */
	private String clientTimezone;

	/** 예매처가 보낸 기기 ID 해시. 한 기기를 여러 계정이 쓰는지 본다 */
	private String deviceHash;

	private LocalDateTime occurredAt = LocalDateTime.now();

	protected PurchaseEvent() {
	}

	public PurchaseEvent(String vendorId, String uid, String performanceCode, String action, String result,
			String ipHash, Integer reactionMs, String ipType, String clientTimezone, String deviceHash) {
		this.deviceHash = deviceHash;
		this.ipType = ipType;
		this.clientTimezone = clientTimezone;
		this.vendorId = vendorId;
		this.uid = uid;
		this.performanceCode = performanceCode;
		this.action = action;
		this.result = result;
		this.ipHash = ipHash;
		this.reactionMs = reactionMs;
	}

	public Long getId() {
		return id;
	}

	public String getVendorId() {
		return vendorId;
	}

	public String getUid() {
		return uid;
	}

	public String getPerformanceCode() {
		return performanceCode;
	}

	public String getAction() {
		return action;
	}

	public String getResult() {
		return result;
	}

	public String getIpType() {
		return ipType;
	}

	public String getDeviceHash() {
		return deviceHash;
	}

	public String getClientTimezone() {
		return clientTimezone;
	}

	public String getIpHash() {
		return ipHash;
	}

	public Integer getReactionMs() {
		return reactionMs;
	}

	public LocalDateTime getOccurredAt() {
		return occurredAt;
	}
}
