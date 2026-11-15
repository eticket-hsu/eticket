package com.fairticket.fairticket.quota;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface QuotaReservationRepository extends JpaRepository<QuotaReservation, Long> {

	List<QuotaReservation> findByUidAndPerformanceCodeAndStatusIn(String uid, String performanceCode,
			List<QuotaReservation.Status> statuses);

	Optional<QuotaReservation> findFirstByUidAndRefAndStatus(String uid, String ref, QuotaReservation.Status status);

	List<QuotaReservation> findByStatusAndExpiresAtBefore(QuotaReservation.Status status, LocalDateTime time);

	List<QuotaReservation> findTop100ByOrderByIdDesc();
}
