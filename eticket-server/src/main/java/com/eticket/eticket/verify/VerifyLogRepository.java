package com.eticket.eticket.verify;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VerifyLogRepository extends JpaRepository<VerifyLog, Long> {

	List<VerifyLog> findTop50ByOrderByIdDesc();
}
