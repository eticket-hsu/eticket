package com.fairticket.vendor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 가상 예매처이자 발행처(별티켓·달티켓).
 * 같은 코드를 프로필만 바꿔 두 번 띄운다: star(8081), moon(8082).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class VendorServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(VendorServerApplication.class, args);
	}

}
