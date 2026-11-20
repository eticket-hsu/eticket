package com.eticket.eticket.resale;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResaleHistoryRepository extends JpaRepository<ResaleHistory, Long> {

	List<ResaleHistory> findByListingIdOrderByIdAsc(Long listingId);
}
