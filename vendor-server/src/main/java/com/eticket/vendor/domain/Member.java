package com.eticket.vendor.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 예매처 회원. ftUid 는 MVP용 가상 공통 사용자 식별자다 (실서비스에선 해시값). */
@Entity
public class Member {

	@Id
	@GeneratedValue
	private Long id;

	private String name;

	private String ftUid;

	protected Member() {
	}

	public Member(String name, String ftUid) {
		this.name = name;
		this.ftUid = ftUid;
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getFtUid() {
		return ftUid;
	}
}
