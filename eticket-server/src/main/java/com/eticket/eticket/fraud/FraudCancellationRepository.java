package com.eticket.eticket.fraud;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FraudCancellationRepository extends JpaRepository<FraudCancellation, Long> {

	List<FraudCancellation> findByPerformanceCodeOrderByIdDesc(String performanceCode);

	List<FraudCancellation> findAllByOrderByIdDesc();

	boolean existsByVendorIdAndVendorTicketIdAndResult(String vendorId, Long vendorTicketId,
			FraudCancellation.Result result);
}
