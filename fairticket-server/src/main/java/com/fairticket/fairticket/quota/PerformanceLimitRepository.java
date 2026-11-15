package com.fairticket.fairticket.quota;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PerformanceLimitRepository extends JpaRepository<PerformanceLimit, Long> {

	List<PerformanceLimit> findByPerformanceCode(String performanceCode);

	Optional<PerformanceLimit> findByPerformanceCodeAndVendorId(String performanceCode, String vendorId);
}
