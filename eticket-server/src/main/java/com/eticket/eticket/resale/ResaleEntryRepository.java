package com.eticket.eticket.resale;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ResaleEntryRepository extends JpaRepository<ResaleEntry, Long> {

	List<ResaleEntry> findByListingIdOrderByIdAsc(Long listingId);

	boolean existsByListingIdAndBuyerUid(Long listingId, String buyerUid);
}
