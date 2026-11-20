package com.fairticket.fairticket.resale;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;

import com.fairticket.fairticket.captcha.CaptchaRequiredException;
import com.fairticket.fairticket.captcha.CaptchaService;
import com.fairticket.fairticket.config.FairTicketProperties;
import com.fairticket.fairticket.quota.QuotaReservation;
import com.fairticket.fairticket.quota.QuotaService;
import com.fairticket.fairticket.risk.RiskAssessment;
import com.fairticket.fairticket.risk.RiskService;
import com.fairticket.fairticket.vendor.VendorClient;

/**
 * 공식 재판매 절차. FairTicket 은 순서와 상태만 관리하고,
 * 잠금·재발급·결제·환불·정산은 모두 발행처 API 로 요청한다.
 *
 * 확정 규칙 (설계 문서 '정해야 할 규칙' B묶음)
 * - 가격 상한 = min(최초가, 현재 소유자 취득가). 낮게 부르는 것은 허용. 상한은 발행처에 조회해 검증
 * - 재발급 때 거래 가격을 새 소유자의 취득가로 넘겨 차익 거래를 막는다 (재재판매 허용)
 * - 이용자 수수료 없음
 * - 신청 마감·판매 종료·결제 기한은 발행처가 정하고, 안 보내면 기본값
 * - 구매자 선정 (제안, 팀 확인 대상): HYBRID 면 공연 N시간 전까지 추첨, 그 뒤로는 선착순(바로 구매).
 *   추첨에 응모자가 없거나 당첨자가 모두 결제하지 않아도 판매 종료 전이면 선착순으로 넘어간다
 * - 공통 구매 한도: 한도가 꽉 찬 사람은 응모 불가, 결제 때 다시 확인, 판매자는 재발급 완료 시 반환
 *
 * TODO(예외 처리 단계): 지금은 발행처 호출을 트랜잭션 안에서 동기로 한다.
 * 실서비스라면 outbox 테이블 + 재시도 워커 + 주기적 상태 맞춤으로 바꾼다.
 */
@Service
@Transactional
public class ResaleService {

	private static final Logger log = LoggerFactory.getLogger(ResaleService.class);

	/** 확정 규칙: 이용자 수수료 없음 */
	static final int USER_FEE = 0;

	private static final List<ResaleStatus> ACTIVE = List.of(ResaleStatus.RESALE_PENDING, ResaleStatus.LISTED,
			ResaleStatus.DRAWN, ResaleStatus.PAID, ResaleStatus.REISSUED);

	private final ResaleListingRepository listings;
	private final ResaleEntryRepository entries;
	private final ResaleHistoryRepository history;
	private final VendorClient vendors;
	private final RiskService riskService;
	private final QuotaService quota;
	private final CaptchaService captcha;
	private final FairTicketProperties props;
	private final SecureRandom random = new SecureRandom();

	/** 시연용 스위치: 켜면 재발급이 항상 실패한다 (예외 흐름 시연) */
	private final AtomicBoolean failReissue = new AtomicBoolean(false);
	/** 시연용: 다음 재발급 1회는 발행처가 처리한 뒤 응답이 사라진 것처럼 만든다 */
	private final AtomicBoolean loseReissueResponse = new AtomicBoolean(false);

	public ResaleService(ResaleListingRepository listings, ResaleEntryRepository entries,
			ResaleHistoryRepository history, VendorClient vendors, RiskService riskService, QuotaService quota,
			CaptchaService captcha, FairTicketProperties props) {
		this.listings = listings;
		this.entries = entries;
		this.history = history;
		this.vendors = vendors;
		this.riskService = riskService;
		this.quota = quota;
		this.captcha = captcha;
		this.props = props;
	}

	/** 발행처가 공연별로 정한 재판매 기한. null 이면 FairTicket 기본값을 쓴다. */
	public record Deadlines(Integer applyHoursBefore, Integer closeHoursBefore, Integer paymentMinutes,
			Integer lotteryHoursBefore) {

		public Deadlines(Integer applyHoursBefore, Integer closeHoursBefore, Integer paymentMinutes) {
			this(applyHoursBefore, closeHoursBefore, paymentMinutes, null);
		}
	}

	/** 1. 재판매 신청 → 2. 발행처 승인·기존 QR 잠금 */
	public ResaleListing register(String vendorId, Long vendorTicketId, String performanceCode, String sellerUid,
			int price, String performanceTitle, String seat, String startsAt, Deadlines deadlines) {
		if (!vendors.isKnown(vendorId)) {
			throw new IllegalArgumentException("연동되지 않은 발행처: " + vendorId);
		}
		if (listings.existsByVendorIdAndVendorTicketIdAndStatusIn(vendorId, vendorTicketId, ACTIVE)) {
			throw new IllegalStateException("이미 재판매 진행 중인 티켓입니다");
		}
		FairTicketProperties.ResaleDefaults d = props.resaleDefaults();
		int applyHours = or(deadlines == null ? null : deadlines.applyHoursBefore(), d.applyHoursBefore());
		int closeHours = or(deadlines == null ? null : deadlines.closeHoursBefore(), d.closeHoursBefore());
		int payMinutes = or(deadlines == null ? null : deadlines.paymentMinutes(), d.paymentMinutes());
		int lotteryHours = or(deadlines == null ? null : deadlines.lotteryHoursBefore(), d.lotteryHoursBefore());

		LocalDateTime show = LocalDateTime.parse(startsAt);
		if (!LocalDateTime.now().isBefore(show.minusHours(applyHours))) {
			throw new IllegalStateException("재판매 신청 마감(공연 " + applyHours + "시간 전)이 지났습니다");
		}

		// 가격 상한은 발행처 기록으로 검증한다 (예매처 화면을 거치지 않은 요청도 막기 위해)
		Map<?, ?> ticket = vendors.getTicket(vendorId, vendorTicketId);
		int cap = ((Number) ticket.get("resalePriceCap")).intValue();
		if (price < 0 || price > cap) {
			throw new IllegalArgumentException("재판매 가격은 0원 이상, 상한 " + cap + "원 이하여야 합니다");
		}
		if (!sellerUid.equals(ticket.get("ownerFtUid"))) {
			throw new IllegalStateException("티켓 소유자만 재판매를 신청할 수 있습니다");
		}

		ResaleListing l = listings.save(new ResaleListing(vendorId, vendorTicketId, performanceCode, sellerUid, price,
				USER_FEE, show.minusHours(closeHours), payMinutes));
		l.setDisplay(performanceTitle, seat, startsAt);
		if (d.hybrid()) {
			l.setLotteryCloseAt(show.minusHours(lotteryHours));
			// 이미 추첨 구간이 지난 공연이면 처음부터 선착순
			if (!LocalDateTime.now().isBefore(l.getLotteryCloseAt())) {
				l.markLotteryDone();
			}
		}
		history.save(new ResaleHistory(l.getId(), null, ResaleStatus.RESALE_PENDING,
				"재판매 신청 (" + price + "원, 상한 " + cap + "원)"));
		try {
			vendors.lock(vendorId, vendorTicketId, key(l, "lock"));
			move(l, ResaleStatus.LISTED, vendors.nameOf(vendorId) + " 승인, 기존 QR 사용 정지"
					+ (l.isLotteryDone() ? " · 공연이 가까워 선착순 판매" : ""));
		}
		catch (RestClientException e) {
			move(l, ResaleStatus.CANCELLED, "발행처 거절: " + e.getMessage());
		}
		return l;
	}

	/**
	 * 3. 구매 응모. 판매자 본인·중복 응모·구매 한도가 꽉 찬 사용자는 제외.
	 * 위험 등급: MEDIUM 은 보안문자를 통과해야 응모, HIGH 는 응모 불가 (C묶음 17번)
	 */
	@Transactional(noRollbackFor = CaptchaRequiredException.class)
	public ResaleEntry enter(Long listingId, String buyerUid, String captchaId, String captchaAnswer) {
		ResaleListing l = get(listingId);
		require(l, ResaleStatus.LISTED);
		if (l.isLotteryDone()) {
			throw new IllegalStateException("추첨이 끝나 선착순으로 판매 중입니다. 바로 구매해 주세요");
		}
		if (entries.existsByListingIdAndBuyerUid(listingId, buyerUid)) {
			throw new IllegalStateException("이미 응모했습니다");
		}
		RiskAssessment risk = checkBuyer(l, buyerUid, captchaId, captchaAnswer, "RESALE_ENTRY", "응모");
		return entries.save(new ResaleEntry(listingId, buyerUid, risk.riskLevel()));
	}

	/**
	 * 선착순 바로 구매 (추첨 구간이 끝난 뒤). 응모와 같은 조건(판매자·한도·위험 등급)을 확인하고,
	 * 행을 잠가 먼저 온 한 명만 당첨자로 정한 뒤 곧바로 결제 → 재발급 → 정산까지 진행한다.
	 * 결제 단계에서 실패하면 전체가 되돌아가 다시 판매 중이 된다.
	 */
	@Transactional(noRollbackFor = CaptchaRequiredException.class)
	public ResaleListing buyNow(Long listingId, String buyerUid, String captchaId, String captchaAnswer) {
		ResaleListing l = listings.findForUpdate(listingId)
			.orElseThrow(() -> new NoSuchElementException("재판매 건 없음: " + listingId));
		if (l.getStatus() != ResaleStatus.LISTED) {
			throw new IllegalStateException("방금 다른 사람이 구매했거나 판매가 끝났습니다");
		}
		if (!l.isLotteryDone()) {
			throw new IllegalStateException("아직 추첨 기간입니다. 응모해 주세요");
		}
		RiskAssessment risk = checkBuyer(l, buyerUid, captchaId, captchaAnswer, "RESALE_BUY", "구매");
		ResaleEntry e = entries.save(new ResaleEntry(listingId, buyerUid, risk.riskLevel()));
		e.setDrawRank(1);
		l.setWinnerUid(buyerUid);
		move(l, ResaleStatus.DRAWN, "선착순 구매: " + buyerUid);
		return pay(listingId, buyerUid);
	}

	/** 응모·선착순 구매 공통 조건. 판매자 본인, 공통 한도가 찬 사람, 고위험은 불가. 주의는 보안문자 */
	private RiskAssessment checkBuyer(ResaleListing l, String buyerUid, String captchaId, String captchaAnswer,
			String action, String verb) {
		if (l.getSellerUid().equals(buyerUid)) {
			throw new IllegalStateException("판매자 본인은 " + verb + "할 수 없습니다");
		}
		QuotaService.Usage usage = quota.usage(buyerUid, l.getPerformanceCode());
		if (usage.full()) {
			throw new IllegalStateException("구매 한도(연동 예매처 합산 " + usage.used() + "/" + usage.limit() + "매)가 꽉 차 "
					+ verb + "할 수 없습니다");
		}
		RiskAssessment risk = riskService.assess(buyerUid, l.getPerformanceCode());
		if ("HIGH".equals(risk.riskLevel())) {
			throw new IllegalStateException("위험 등급 HIGH 사용자는 " + verb + "가 제한됩니다");
		}
		if ("MEDIUM".equals(risk.riskLevel())) {
			if (captchaId == null) {
				throw new CaptchaRequiredException(false);
			}
			if (!captcha.verify(captchaId, captchaAnswer)) {
				riskService.record(l.getVendorId(), buyerUid, l.getPerformanceCode(), action, "CAPTCHA_FAIL", null,
						null);
				throw new CaptchaRequiredException(true);
			}
		}
		return risk;
	}

	/**
	 * 4. 추첨 (추첨 구간 마감 시 자동, 또는 관리자 버튼).
	 * 응모자가 없으면: HYBRID 이고 판매 종료 전이면 선착순으로 전환, 아니면 만료 후 원 구매자 권한 복원
	 */
	public ResaleListing draw(Long listingId) {
		ResaleListing l = get(listingId);
		require(l, ResaleStatus.LISTED);
		if (l.isLotteryDone()) {
			throw new IllegalStateException("이미 추첨이 끝나 선착순으로 판매 중입니다");
		}
		List<ResaleEntry> all = new ArrayList<>(entries.findByListingIdOrderByIdAsc(listingId));
		if (all.isEmpty()) {
			if (canSwitchToFirstCome(l)) {
				l.markLotteryDone();
				history.save(new ResaleHistory(l.getId(), ResaleStatus.LISTED, ResaleStatus.LISTED,
						"추첨 마감, 응모자 없음 → 선착순 판매로 전환"));
			}
			else {
				expireAndRestore(l, "응모자 없음");
			}
			return l;
		}
		l.markLotteryDone();
		Collections.shuffle(all, random);
		for (int i = 0; i < all.size(); i++) {
			all.get(i).setDrawRank(i + 1);
		}
		l.setWinnerUid(all.get(0).getBuyerUid());
		move(l, ResaleStatus.DRAWN, "추첨 완료, 당첨 " + l.getWinnerUid() + " (응모 " + all.size() + "명, 결제 기한 "
				+ l.getPaymentMinutes() + "분)");
		return l;
	}

	/** 결제 기한 초과: 차순위 당첨자로 이전, 없으면 만료 */
	public ResaleListing forfeit(Long listingId) {
		ResaleListing l = get(listingId);
		require(l, ResaleStatus.DRAWN);
		List<ResaleEntry> ranked = entries.findByListingIdOrderByIdAsc(listingId)
			.stream()
			.filter(e -> e.getDrawRank() != null)
			.sorted(Comparator.comparingInt(ResaleEntry::getDrawRank))
			.toList();
		ranked.stream().filter(e -> e.getBuyerUid().equals(l.getWinnerUid())).findFirst().ifPresent(ResaleEntry::forfeit);
		ResaleEntry next = ranked.stream().filter(e -> !e.isForfeited()).findFirst().orElse(null);
		if (next == null) {
			if (canSwitchToFirstCome(l)) {
				l.clearWinner();
				move(l, ResaleStatus.LISTED, "결제 기한 초과, 남은 당첨자 없음 → 선착순 판매로 전환");
			}
			else {
				expireAndRestore(l, "결제 기한 초과, 남은 당첨자 없음");
			}
		}
		else {
			l.setWinnerUid(next.getBuyerUid());
			move(l, ResaleStatus.DRAWN, "결제 기한 초과, 차순위 " + next.getBuyerUid() + "에게 이전");
		}
		return l;
	}

	/** 5. 당첨자 결제 → 6. 재발급 → 7. 원 구매자 정산 */
	public ResaleListing pay(Long listingId, String buyerUid) {
		ResaleListing l = get(listingId);
		require(l, ResaleStatus.DRAWN);
		if (!buyerUid.equals(l.getWinnerUid())) {
			throw new IllegalStateException("당첨자만 결제할 수 있습니다");
		}
		String ref = l.getVendorId() + ":" + l.getVendorTicketId();
		// 결제 때 한도를 다시 확인하고 칸을 잡는다 (응모 후 다른 곳에서 샀을 수 있으므로)
		QuotaReservation hold = quota.reserve(buyerUid, l.getPerformanceCode(), l.getVendorId(), 1, null,
				l.getPaymentMinutes(), "RESALE", ref);
		try {
			vendors.payment(l.getVendorId(), Map.of("listingId", l.getId(), "buyerUid", buyerUid, "amount",
					l.getPrice() + l.getFee()), key(l, "payment"));
		}
		catch (RuntimeException e) {
			quota.release(hold.getId());
			throw e;
		}
		move(l, ResaleStatus.PAID, buyerUid + " 결제 완료 (" + (l.getPrice() + l.getFee()) + "원)");

		if (!tryReissue(l)) {
			quota.release(hold.getId());
			move(l, ResaleStatus.REISSUE_FAILED, "재발급 " + props.reissueMaxAttempts() + "회 실패");
			vendors.refund(l.getVendorId(), Map.of("listingId", l.getId(), "buyerUid", buyerUid, "amount",
					l.getPrice() + l.getFee()), key(l, "refund"));
			vendors.unlock(l.getVendorId(), l.getVendorTicketId(), key(l, "unlock"));
			history.save(new ResaleHistory(l.getId(), ResaleStatus.REISSUE_FAILED, ResaleStatus.REISSUE_FAILED,
					"새 구매자 환불·한도 반환, 원 구매자 권한 복원"));
			return l;
		}
		quota.confirm(hold.getId(), ref);
		quota.releaseTicketOf(l.getSellerUid(), ref);
		move(l, ResaleStatus.REISSUED, "기존 티켓 무효화, " + buyerUid + "에게 새 티켓 발급 (취득가 " + l.getPrice()
				+ "원 기록), 판매자 한도 반환");

		vendors.payout(l.getVendorId(), Map.of("listingId", l.getId(), "sellerUid", l.getSellerUid(), "amount",
				l.getPrice()), key(l, "payout"));
		move(l, ResaleStatus.SETTLED, l.getSellerUid() + " 정산 완료 (" + l.getPrice() + "원)");
		return l;
	}

	/** 판매 종료 시각 도달. LOTTERY 방식이면 이때 추첨, HYBRID 면 안 팔린 것이므로 원 구매자 권한 복원 */
	public ResaleListing closeSale(Long listingId) {
		ResaleListing l = get(listingId);
		require(l, ResaleStatus.LISTED);
		if (l.getLotteryCloseAt() == null) {
			return draw(listingId);
		}
		expireAndRestore(l, "판매 종료(공연 임박), 미판매");
		return l;
	}

	private static boolean canSwitchToFirstCome(ResaleListing l) {
		return l.getLotteryCloseAt() != null && LocalDateTime.now().isBefore(l.getSaleCloseAt());
	}

	/** 판매 전 취소 */
	public ResaleListing cancel(Long listingId) {
		ResaleListing l = get(listingId);
		if (l.getStatus() == ResaleStatus.LISTED) {
			vendors.unlock(l.getVendorId(), l.getVendorTicketId(), key(l, "unlock"));
		}
		move(l, ResaleStatus.CANCELLED, "판매 전 취소, 원 구매자 권한 복원");
		return l;
	}

	public void setFailReissue(boolean enabled) {
		failReissue.set(enabled);
	}

	public boolean isFailReissue() {
		return failReissue.get();
	}

	public void setLoseReissueResponse(boolean enabled) {
		loseReissueResponse.set(enabled);
	}

	public boolean isLoseReissueResponse() {
		return loseReissueResponse.get();
	}

	@Transactional(readOnly = true)
	public ResaleListing get(Long id) {
		return listings.findById(id).orElseThrow(() -> new NoSuchElementException("재판매 건 없음: " + id));
	}

	private boolean tryReissue(ResaleListing l) {
		for (int attempt = 1; attempt <= props.reissueMaxAttempts(); attempt++) {
			try {
				if (failReissue.get()) {
					throw new IllegalStateException("시연용 재발급 실패");
				}
				// 재시도해도 같은 멱등키를 쓴다. 발행처가 이미 처리했다면 버전을 또 올리지 않고 첫 결과를 돌려준다
				VendorClient.ReissueResult r = vendors.reissue(l.getVendorId(), l.getVendorTicketId(),
						l.getWinnerUid(), l.getPrice(), key(l, "reissue"));
				if (loseReissueResponse.compareAndSet(true, false)) {
					history.save(new ResaleHistory(l.getId(), ResaleStatus.PAID, ResaleStatus.PAID,
							"재발급 응답 유실 (시연): 발행처는 처리했지만 eTicket 이 응답을 받지 못함"));
					throw new IllegalStateException("시연용 응답 유실");
				}
				if (r.replayed()) {
					history.save(new ResaleHistory(l.getId(), ResaleStatus.PAID, ResaleStatus.PAID, "같은 멱등키로 재시도 "
							+ attempt + "회차: 발행처가 이미 처리한 요청으로 확인하고 저장된 결과 반환 (중복 발급 없음)"));
				}
				return true;
			}
			catch (RuntimeException e) {
				log.warn("재발급 실패 {}/{} (listing {}): {}", attempt, props.reissueMaxAttempts(), l.getId(),
						e.getMessage());
			}
		}
		return false;
	}

	private void expireAndRestore(ResaleListing l, String reason) {
		vendors.unlock(l.getVendorId(), l.getVendorTicketId(), key(l, "unlock"));
		move(l, ResaleStatus.EXPIRED, reason + ", 원 구매자 권한 복원");
	}

	private void move(ResaleListing l, ResaleStatus to, String note) {
		ResaleStatus from = l.moveTo(to);
		history.save(new ResaleHistory(l.getId(), from, to, note));
	}

	private static void require(ResaleListing l, ResaleStatus expected) {
		if (l.getStatus() != expected) {
			throw new IllegalStateException("현재 상태(" + l.getStatus() + ")에서는 할 수 없습니다");
		}
	}

	private static int or(Integer value, int fallback) {
		return value == null ? fallback : value;
	}

	private static String key(ResaleListing l, String action) {
		return "resale-" + l.getId() + "-" + action;
	}
}
