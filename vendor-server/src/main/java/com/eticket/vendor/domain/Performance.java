package com.eticket.vendor.domain;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 공연. 두 예매처가 같은 공연을 팔 수 있도록 공통 공연 코드(code)를 둔다. */
@Entity
public class Performance {

	@Id
	@GeneratedValue
	private Long id;

	/** 예매처 간 공통 공연 코드. 교차 예매처 위험 분석·공통 한도에 쓰인다. */
	private String code;

	private String title;

	private String artist;

	private String genre;

	private String venue;

	private LocalDateTime startsAt;

	private int price;

	private boolean resaleAllowed;

	private int perUserLimit;

	/** 열마다 좌석 수 */
	private int seatsPerRow;

	/** 재판매 기한 (발행처 정책). null 이면 eTicket 기본값을 쓴다. */
	private Integer resaleApplyHoursBefore;

	private Integer resaleCloseHoursBefore;

	private Integer resalePaymentMinutes;

	protected Performance() {
	}

	public Performance(String code, String title, String artist, String genre, String venue, LocalDateTime startsAt,
			int price, boolean resaleAllowed, int perUserLimit, int seatsPerRow) {
		this.code = code;
		this.title = title;
		this.artist = artist;
		this.genre = genre;
		this.venue = venue;
		this.startsAt = startsAt;
		this.price = price;
		this.resaleAllowed = resaleAllowed;
		this.perUserLimit = perUserLimit;
		this.seatsPerRow = seatsPerRow;
	}

	public Long getId() {
		return id;
	}

	public String getCode() {
		return code;
	}

	public String getTitle() {
		return title;
	}

	public String getArtist() {
		return artist;
	}

	public String getGenre() {
		return genre;
	}

	public String getVenue() {
		return venue;
	}

	public LocalDateTime getStartsAt() {
		return startsAt;
	}

	public int getPrice() {
		return price;
	}

	public boolean isResaleAllowed() {
		return resaleAllowed;
	}

	public int getPerUserLimit() {
		return perUserLimit;
	}

	public int getSeatsPerRow() {
		return seatsPerRow;
	}

	/** 발행처가 공연별로 재판매 기한을 정한다 (신청 마감, 판매 종료, 결제 기한) */
	public Performance resalePolicy(Integer applyHoursBefore, Integer closeHoursBefore, Integer paymentMinutes) {
		this.resaleApplyHoursBefore = applyHoursBefore;
		this.resaleCloseHoursBefore = closeHoursBefore;
		this.resalePaymentMinutes = paymentMinutes;
		return this;
	}

	public Integer getResaleApplyHoursBefore() {
		return resaleApplyHoursBefore;
	}

	public Integer getResaleCloseHoursBefore() {
		return resaleCloseHoursBefore;
	}

	public Integer getResalePaymentMinutes() {
		return resalePaymentMinutes;
	}
}
