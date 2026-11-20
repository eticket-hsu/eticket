package com.eticket.eticket.verify;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 입장 검증 기록 */
@Entity
public class VerifyLog {

	@Id
	@GeneratedValue
	private Long id;

	private String vendorId;

	/** 서명을 뗀 QR 본문 (FT:{발행처}:{티켓}:{버전}) */
	private String ticketRef;

	private String result;

	private String gate;

	private LocalDateTime scannedAt = LocalDateTime.now();

	protected VerifyLog() {
	}

	public VerifyLog(String vendorId, String ticketRef, String result, String gate) {
		this.vendorId = vendorId;
		this.ticketRef = ticketRef;
		this.result = result;
		this.gate = gate;
	}

	public Long getId() {
		return id;
	}

	public String getVendorId() {
		return vendorId;
	}

	public String getTicketRef() {
		return ticketRef;
	}

	public String getResult() {
		return result;
	}

	public String getGate() {
		return gate;
	}

	public LocalDateTime getScannedAt() {
		return scannedAt;
	}
}
