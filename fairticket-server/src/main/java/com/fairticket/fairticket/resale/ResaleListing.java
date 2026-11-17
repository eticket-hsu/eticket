package com.fairticket.fairticket.resale;

import java.time.LocalDateTime;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;

/** 재판매 건. 티켓 원본이 아니라 발행처 티켓에 대한 참조와 진행 상태만 가진다. */
@Entity
public class ResaleListing {

	@Id
	@GeneratedValue
	private Long id;

	private String vendorId;

	private Long vendorTicketId;

	private String performanceCode;

	private String sellerUid;

	/** 화면 표시용 정보 (원본은 발행처에 있음) */
	private String performanceTitle;

	private String seat;

	private String startsAt;

	/** 재판매 가격. 발행처가 최초 구매가 이하로 보낸다. */
	private int price;

	/** 이용자 수수료. 확정 규칙: 이용자 수수료 없음 (FairTicket 수익은 예매처 대상 B2B 이용료) */
	private int fee;

	@Enumerated(EnumType.STRING)
	private ResaleStatus status = ResaleStatus.RESALE_PENDING;

	private String winnerUid;

	/** 판매 종료 시각 (발행처가 정한 공연 N시간 전). 이때까지 미판매면 추첨하거나 만료 */
	private LocalDateTime saleCloseAt;

	/** 당첨자 결제 기한(분). 발행처가 정함 */
	private int paymentMinutes;

	/** 현재 당첨자의 결제 마감 시각 */
	private LocalDateTime paymentDeadline;

	private LocalDateTime createdAt = LocalDateTime.now();

	/** 추첨 마감 시각 (HYBRID). 이후로는 선착순. null 이면 LOTTERY 방식(판매 종료 때 추첨) */
	private LocalDateTime lotteryCloseAt;

	/** 추첨 구간이 끝났는지. true 면 응모는 막히고 선착순으로 바로 살 수 있다 */
	private boolean lotteryDone;

	protected ResaleListing() {
	}

	public ResaleListing(String vendorId, Long vendorTicketId, String performanceCode, String sellerUid, int price,
			int fee, LocalDateTime saleCloseAt, int paymentMinutes) {
		this.vendorId = vendorId;
		this.vendorTicketId = vendorTicketId;
		this.performanceCode = performanceCode;
		this.sellerUid = sellerUid;
		this.price = price;
		this.fee = fee;
		this.saleCloseAt = saleCloseAt;
		this.paymentMinutes = paymentMinutes;
	}

	/** 상태 변경은 이 메서드로만. 허용되지 않은 전이는 예외. */
	ResaleStatus moveTo(ResaleStatus to) {
		if (!status.canMoveTo(to)) {
			throw new IllegalStateException("허용되지 않은 상태 전이: " + status + " → " + to);
		}
		ResaleStatus from = status;
		status = to;
		return from;
	}

	void setLotteryCloseAt(LocalDateTime lotteryCloseAt) {
		this.lotteryCloseAt = lotteryCloseAt;
	}

	void markLotteryDone() {
		this.lotteryDone = true;
	}

	void clearWinner() {
		this.winnerUid = null;
		this.paymentDeadline = null;
	}

	public LocalDateTime getLotteryCloseAt() {
		return lotteryCloseAt;
	}

	public boolean isLotteryDone() {
		return lotteryDone;
	}

	/** 화면용: 지금 구매자를 정하는 방식. LOTTERY = 응모 후 추첨, FIRST_COME = 먼저 결제하는 사람 */
	public String getSelectionPhase() {
		return lotteryDone ? "FIRST_COME" : "LOTTERY";
	}

	/** 새 당첨자를 정하고 결제 기한을 다시 잰다 */
	void setWinnerUid(String winnerUid) {
		this.winnerUid = winnerUid;
		this.paymentDeadline = LocalDateTime.now().plusMinutes(paymentMinutes);
	}

	void setDisplay(String performanceTitle, String seat, String startsAt) {
		this.performanceTitle = performanceTitle;
		this.seat = seat;
		this.startsAt = startsAt;
	}

	public String getPerformanceTitle() {
		return performanceTitle;
	}

	public String getSeat() {
		return seat;
	}

	public String getStartsAt() {
		return startsAt;
	}

	public Long getId() {
		return id;
	}

	public String getVendorId() {
		return vendorId;
	}

	public Long getVendorTicketId() {
		return vendorTicketId;
	}

	public String getPerformanceCode() {
		return performanceCode;
	}

	public String getSellerUid() {
		return sellerUid;
	}

	public int getPrice() {
		return price;
	}

	public int getFee() {
		return fee;
	}

	public ResaleStatus getStatus() {
		return status;
	}

	public String getWinnerUid() {
		return winnerUid;
	}

	public LocalDateTime getSaleCloseAt() {
		return saleCloseAt;
	}

	public int getPaymentMinutes() {
		return paymentMinutes;
	}

	public LocalDateTime getPaymentDeadline() {
		return paymentDeadline;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}
}
