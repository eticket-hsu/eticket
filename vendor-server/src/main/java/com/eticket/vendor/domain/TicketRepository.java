package com.eticket.vendor.domain;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketRepository extends JpaRepository<Ticket, Long> {

	List<Ticket> findByOwnerIdOrderByIdDesc(Long ownerId);

	List<Ticket> findByPerformanceId(Long performanceId);

	long countByPerformanceIdAndOwnerId(Long performanceId, Long ownerId);

	/**
	 * 입장 승인과 사용 기록을 한 번의 조건부 업데이트로 처리한다.
	 * 동시에 두 번 스캔돼도 한 번만 1을 반환하므로 중복 입장이 막힌다.
	 */
	@Modifying(clearAutomatically = true)
	@Query("""
			update Ticket t set t.status = :used, t.usedAt = :now
			where t.id = :id and t.issueVersion = :version and t.status = :valid
			""")
	int admit(@Param("id") Long id, @Param("version") int version, @Param("now") LocalDateTime now,
			@Param("valid") TicketStatus valid, @Param("used") TicketStatus used);
}
