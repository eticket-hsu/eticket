package com.fairticket.fairticket;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * FairTicket 서버: 예매처 사이에서 공식 재판매·위험 분석·입장 검증을 중계한다.
 * 티켓과 돈은 보유하지 않고, 상태와 이력만 관리한다.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class FairticketServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(FairticketServerApplication.class, args);
	}

}
