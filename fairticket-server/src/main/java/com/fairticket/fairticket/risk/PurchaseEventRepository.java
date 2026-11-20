package com.fairticket.fairticket.risk;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseEventRepository extends JpaRepository<PurchaseEvent, Long> {

	List<PurchaseEvent> findByUidAndOccurredAtAfterOrderByOccurredAtAsc(String uid, LocalDateTime after);

	List<PurchaseEvent> findByOccurredAtAfter(LocalDateTime after);

	List<PurchaseEvent> findByPerformanceCodeOrderByOccurredAtAsc(String performanceCode);

	@Query("select distinct e.performanceCode from PurchaseEvent e")
	List<String> findPerformanceCodes();

	long countByUidAndPerformanceCodeAndResult(String uid, String performanceCode, String result);

	@Query("""
			select count(distinct e.uid) from PurchaseEvent e
			where e.ipHash = :ipHash and e.occurredAt > :after
			  and (:vendorId is null or e.vendorId = :vendorId)
			""")
	long countDistinctUidByIp(@Param("ipHash") String ipHash, @Param("after") LocalDateTime after,
			@Param("vendorId") String vendorId);

	@Query("""
			select count(distinct e.uid) from PurchaseEvent e
			where e.deviceHash = :deviceHash and e.occurredAt > :after
			  and (:vendorId is null or e.vendorId = :vendorId)
			""")
	long countDistinctUidByDevice(@Param("deviceHash") String deviceHash, @Param("after") LocalDateTime after,
			@Param("vendorId") String vendorId);
}
