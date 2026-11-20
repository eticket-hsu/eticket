package com.eticket.eticket.risk;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 위험 분석 결과. 부정사용자 "확정"이 아니라 신호와 근거다.
 * 구매 허용·추가 인증·보류는 예매처가 결정한다.
 */
public record RiskAssessment(String uid, String performanceCode, String riskLevel, int score, List<Reason> reasons,
		LocalDateTime evaluatedAt) {

	public record Reason(String rule, int points, String detail) {
	}

	public static String levelOf(int score) {
		if (score >= 70) {
			return "HIGH";
		}
		return score >= 40 ? "MEDIUM" : "LOW";
	}
}
