package com.fairticket.fairticket.resale;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResaleListingRepository extends JpaRepository<ResaleListing, Long> {

	List<ResaleListing> findByPerformanceCodeOrderByIdDesc(String performanceCode);

	List<ResaleListing> findAllByOrderByIdDesc();

	List<ResaleListing> findByStatusAndPaymentDeadlineBefore(ResaleStatus status, LocalDateTime time);

	List<ResaleListing> findByStatusAndSaleCloseAtBefore(ResaleStatus status, LocalDateTime time);

	boolean existsByVendorIdAndVendorTicketIdAndStatusIn(String vendorId, Long vendorTicketId,
			List<ResaleStatus> statuses);
}
