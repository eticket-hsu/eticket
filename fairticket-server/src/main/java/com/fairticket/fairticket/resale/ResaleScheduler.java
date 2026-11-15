package com.fairticket.fairticket.resale;

import java.time.LocalDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 기한 자동 처리.
 * - 당첨자 결제 기한이 지나면 차순위로 넘긴다
 * - 판매 종료 시각이 지나면 응모자가 있으면 추첨, 없으면 만료하고 원 구매자 권한을 복원한다
 * 시연 중에는 관리자 콘솔의 버튼으로 같은 일을 바로 할 수 있다.
 */
@Component
public class ResaleScheduler {

	private static final Logger log = LoggerFactory.getLogger(ResaleScheduler.class);

	private final ResaleListingRepository listings;
	private final ResaleService resaleService;

	public ResaleScheduler(ResaleListingRepository listings, ResaleService resaleService) {
		this.listings = listings;
		this.resaleService = resaleService;
	}

	@Scheduled(fixedDelay = 10_000)
	public void run() {
		LocalDateTime now = LocalDateTime.now();
		for (ResaleListing l : listings.findByStatusAndPaymentDeadlineBefore(ResaleStatus.DRAWN, now)) {
			safely("결제 기한 초과", l.getId(), () -> resaleService.forfeit(l.getId()));
		}
		for (ResaleListing l : listings.findByStatusAndSaleCloseAtBefore(ResaleStatus.LISTED, now)) {
			safely("판매 종료", l.getId(), () -> resaleService.draw(l.getId()));
		}
	}

	private void safely(String what, Long id, Runnable r) {
		try {
			r.run();
			log.info("[자동 처리] {} → 재판매 #{}", what, id);
		}
		catch (RuntimeException e) {
			log.warn("[자동 처리 실패] {} 재판매 #{}: {}", what, id, e.getMessage());
		}
	}
}
