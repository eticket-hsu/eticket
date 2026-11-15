package com.fairticket.fairticket.resale;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 재판매 응모. 추첨 후 rank 가 매겨진다 (1 = 당첨, 2~ = 차순위). */
@Entity
public class ResaleEntry {

	@Id
	@GeneratedValue
	private Long id;

	private Long listingId;

	private String buyerUid;

	/** 응모 시점의 위험 등급 (근거 확인용) */
	private String riskLevel;

	private Integer drawRank;

	/** 결제 기한 초과 등으로 당첨 자격을 잃음 */
	private boolean forfeited;

	private LocalDateTime createdAt = LocalDateTime.now();

	protected ResaleEntry() {
	}

	public ResaleEntry(Long listingId, String buyerUid, String riskLevel) {
		this.listingId = listingId;
		this.buyerUid = buyerUid;
		this.riskLevel = riskLevel;
	}

	void setDrawRank(Integer drawRank) {
		this.drawRank = drawRank;
	}

	void forfeit() {
		this.forfeited = true;
	}

	public Long getId() {
		return id;
	}

	public Long getListingId() {
		return listingId;
	}

	public String getBuyerUid() {
		return buyerUid;
	}

	public String getRiskLevel() {
		return riskLevel;
	}

	public Integer getDrawRank() {
		return drawRank;
	}

	public boolean isForfeited() {
		return forfeited;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
