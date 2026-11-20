package com.eticket.eticket.fraud;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;

import com.eticket.eticket.quota.QuotaService;
import com.eticket.eticket.risk.ReviewService;
import com.eticket.eticket.vendor.VendorClient;

/**
 * 탐지 → 조치. 사후 검토에서 찾은 의심 계정이 가진 표를 발행처에 취소 요청한다.
 * 최종 결정은 발행처: 관리자(발행처 담당자)가 의심 목록을 확인하고 선택한 계정만 요청한다.
 * 취소된 표는 입장 검증에서 거절되고, 그 사람의 공통 구매 한도도 돌려준다.
 */
@Service
public class FraudCancelService {

	private static final Logger log = LoggerFactory.getLogger(FraudCancelService.class);

	private final ReviewService reviewService;
	private final QuotaService quota;
	private final VendorClient vendors;
	private final FraudCancellationRepository cancellations;

	public FraudCancelService(ReviewService reviewService, QuotaService quota, VendorClient vendors,
			FraudCancellationRepository cancellations) {
		this.reviewService = reviewService;
		this.quota = quota;
		this.vendors = vendors;
		this.cancellations = cancellations;
	}

	/** 의심 계정만 취소한다. 의심 목록에 없는 계정을 넘기면 무시한다 (오탐 방지) */
	public List<FraudCancellation> cancel(String performanceCode, List<String> uids) {
		Map<String, ReviewService.Suspect> suspects = reviewService.review(performanceCode)
			.suspects()
			.stream()
			.collect(Collectors.toMap(ReviewService.Suspect::uid, Function.identity()));
		List<FraudCancellation> out = new ArrayList<>();
		for (String uid : uids) {
			ReviewService.Suspect s = suspects.get(uid);
			if (s == null) {
				continue;
			}
			String reason = String.join(", ", s.flags());
			for (String ref : quota.heldTickets(uid, performanceCode)) {
				out.add(cancelOne(performanceCode, uid, ref, reason));
			}
		}
		return out;
	}

	private FraudCancellation cancelOne(String performanceCode, String uid, String ref, String reason) {
		String vendorId = ref.substring(0, ref.indexOf(':'));
		long ticketId = Long.parseLong(ref.substring(ref.indexOf(':') + 1));
		try {
			vendors.fraudCancel(vendorId, ticketId, reason, "fraud-cancel-" + vendorId + "-" + ticketId);
			quota.releaseTicketOf(uid, ref);
			log.info("[부정 구매 취소] {} {} 표 {} ({})", performanceCode, uid, ref, reason);
			return cancellations.save(new FraudCancellation(performanceCode, uid, vendorId, ticketId, reason,
					FraudCancellation.Result.CANCELLED, null));
		}
		catch (RestClientResponseException e) {
			String msg = e.getResponseBodyAsString();
			log.warn("[부정 구매 취소 실패] {} 표 {}: {}", uid, ref, msg);
			return cancellations.save(new FraudCancellation(performanceCode, uid, vendorId, ticketId, reason,
					FraudCancellation.Result.FAILED, msg.length() > 400 ? msg.substring(0, 400) : msg));
		}
		catch (RuntimeException e) {
			return cancellations.save(new FraudCancellation(performanceCode, uid, vendorId, ticketId, reason,
					FraudCancellation.Result.FAILED, e.getMessage()));
		}
	}

	public List<FraudCancellation> history(String performanceCode) {
		return performanceCode == null ? cancellations.findAllByOrderByIdDesc()
				: cancellations.findByPerformanceCodeOrderByIdDesc(performanceCode);
	}
}
