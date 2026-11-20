package com.eticket.eticket.resale;

import java.time.LocalDateTime;
import java.util.List;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface ResaleListingRepository extends JpaRepository<ResaleListing, Long> {

	List<ResaleListing> findByPerformanceCodeOrderByIdDesc(String performanceCode);

	List<ResaleListing> findAllByOrderByIdDesc();

	List<ResaleListing> findByStatusAndPaymentDeadlineBefore(ResaleStatus status, LocalDateTime time);

	List<ResaleListing> findByStatusAndSaleCloseAtBefore(ResaleStatus status, LocalDateTime time);

	List<ResaleListing> findByStatusAndLotteryDoneFalseAndLotteryCloseAtBefore(ResaleStatus status,
			LocalDateTime time);

	/** 선착순 구매: 두 사람이 동시에 사도 한 명만 가져가도록 행을 잠근다 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select l from ResaleListing l where l.id = :id")
	Optional<ResaleListing> findForUpdate(@Param("id") Long id);

	boolean existsByVendorIdAndVendorTicketIdAndStatusIn(String vendorId, Long vendorTicketId,
			List<ResaleStatus> statuses);
}
