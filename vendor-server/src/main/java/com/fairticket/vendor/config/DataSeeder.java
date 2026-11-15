package com.fairticket.vendor.config;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import com.fairticket.vendor.domain.Member;
import com.fairticket.vendor.domain.MemberRepository;
import com.fairticket.vendor.domain.Performance;
import com.fairticket.vendor.domain.PerformanceRepository;

/**
 * 데모용 시드 데이터. 두 예매처 모두 같은 ftUid 를 쓰므로
 * FairTicket 은 "같은 사람이 두 예매처에서 시도"를 알아볼 수 있다.
 * 공연 PERF-001, PERF-002 는 두 예매처가 함께 판다 (좌석 구역만 다름).
 */
@Component
public class DataSeeder implements CommandLineRunner {

	private final MemberRepository members;
	private final PerformanceRepository performances;
	private final VendorProperties props;

	public DataSeeder(MemberRepository members, PerformanceRepository performances, VendorProperties props) {
		this.members = members;
		this.performances = performances;
		this.props = props;
	}

	@Override
	public void run(String... args) {
		members.save(new Member("민지", "ft-u-001"));
		members.save(new Member("지수", "ft-u-002"));
		members.save(new Member("서연", "ft-u-003"));
		members.save(new Member("매크로봇", "ft-u-bot"));

		LocalDate base = LocalDate.now();
		// 1인 한도는 발행처(주최 측)가 정한 값. 두 예매처가 같이 파는 공연은 같은 값을 쓴다.
		// PERF-001 은 1인 2매: 별티켓·달티켓 합산 2매를 넘을 수 없음 (공통 구매 한도 시연용)
		performances.save(new Performance("PERF-001", "NEON WAVE 2026 LIVE", "네온웨이브", "콘서트", "낙산 아트홀",
				LocalDateTime.of(base.plusDays(30), LocalTime.of(19, 0)), 99000, true, 2, 10));
		performances.save(new Performance("PERF-002", "뮤지컬 〈별을 쫓는 아이〉", "극단 한빛", "뮤지컬", "한성 시어터",
				LocalDateTime.of(base.plusDays(21), LocalTime.of(14, 0)), 77000, true, 4, 10));
		if ("moon".equals(props.id())) {
			// 재판매 기한을 발행처가 직접 정한 예: 신청 48시간 전 마감, 6시간 전 판매 종료, 결제 15분
			performances.save(new Performance("PERF-003", "재즈 나이트 : Blue Moon", "문라이트 트리오", "재즈", "달빛 라운지",
					LocalDateTime.of(base.plusDays(12), LocalTime.of(20, 0)), 55000, true, 2, 10)
				.resalePolicy(48, 6, 15));
		}
		else {
			performances.save(new Performance("PERF-004", "스탠드업 코미디 〈오늘도 웃음〉", "코미디 크루 낙산", "코미디",
					"별빛 소극장", LocalDateTime.of(base.plusDays(9), LocalTime.of(19, 30)), 44000, false, 2, 10));
		}
	}
}
