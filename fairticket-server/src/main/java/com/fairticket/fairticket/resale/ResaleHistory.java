package com.fairticket.fairticket.resale;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 상태 전이 이력. 관리자 웹의 "어디까지 진행됐는지" 타임라인이 된다. */
@Entity
public class ResaleHistory {

	@Id
	@GeneratedValue
	private Long id;

	private Long listingId;

	@Enumerated(EnumType.STRING)
	private ResaleStatus fromStatus;

	@Enumerated(EnumType.STRING)
	private ResaleStatus toStatus;

	private String note;

	private LocalDateTime at = LocalDateTime.now();

	protected ResaleHistory() {
	}

	public ResaleHistory(Long listingId, ResaleStatus fromStatus, ResaleStatus toStatus, String note) {
		this.listingId = listingId;
		this.fromStatus = fromStatus;
		this.toStatus = toStatus;
		this.note = note;
	}

	public Long getId() {
		return id;
	}

	public Long getListingId() {
		return listingId;
	}

	public ResaleStatus getFromStatus() {
		return fromStatus;
	}

	public ResaleStatus getToStatus() {
		return toStatus;
	}

	public String getNote() {
		return note;
	}

	public LocalDateTime getAt() {
		return at;
	}
}
