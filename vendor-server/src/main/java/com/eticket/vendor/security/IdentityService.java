package com.eticket.vendor.security;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * 본인인증 (시연용 모의). 실제로는 예매처가 쓰는 휴대폰 본인인증(PASS 등) 결과를 받는다.
 * 위험 등급 HIGH 로 보류된 구매는 보안문자 + 본인인증을 모두 통과해야 진행된다.
 * 본인인증은 한 명의로 여러 계정을 돌리는 다중 계정을 막고, 매크로 자체는 보안문자가 막는다.
 */
@Service
public class IdentityService {

	/** 시연용 인증번호. 화면에 그대로 안내한다. */
	public static final String DEMO_CODE = "123456";
	private static final long VALID_MINUTES = 10;

	private final Map<Long, Instant> verifiedUntil = new ConcurrentHashMap<>();

	public boolean verify(Long memberId, String code) {
		if (!DEMO_CODE.equals(code)) {
			return false;
		}
		verifiedUntil.put(memberId, Instant.now().plus(VALID_MINUTES, ChronoUnit.MINUTES));
		return true;
	}

	public boolean isVerified(Long memberId) {
		Instant until = verifiedUntil.get(memberId);
		return until != null && until.isAfter(Instant.now());
	}
}
