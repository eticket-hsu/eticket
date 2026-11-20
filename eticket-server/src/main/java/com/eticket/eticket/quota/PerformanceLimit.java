package com.eticket.eticket.quota;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 발행처가 알려 준 공연별 1인 한도. 예매처마다 다르면 가장 작은 값을 적용한다. */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = { "performanceCode", "vendorId" }))
public class PerformanceLimit {

	@Id
	@GeneratedValue
	private Long id;

	private String performanceCode;

	private String vendorId;

	private int perUser;

	protected PerformanceLimit() {
	}

	public PerformanceLimit(String performanceCode, String vendorId, int perUser) {
		this.performanceCode = performanceCode;
		this.vendorId = vendorId;
		this.perUser = perUser;
	}

	void setPerUser(int perUser) {
		this.perUser = perUser;
	}

	public String getPerformanceCode() {
		return performanceCode;
	}

	public String getVendorId() {
		return vendorId;
	}

	public int getPerUser() {
		return perUser;
	}
}
