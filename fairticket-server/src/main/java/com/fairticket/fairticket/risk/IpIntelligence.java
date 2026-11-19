package com.fairticket.fairticket.risk;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * IP 종류 판별: 국내망 / 해외 / VPN·프록시 / 데이터센터 / Tor.
 *
 * 실제 예매처도 같은 신호를 쓴다. 인터파크는 VPN 접속을 봇으로 보고 차단할 수 있다고 안내하고,
 * 예스24가 차단한 매크로 트래픽은 상당수가 해외 IP였다.
 * 목록은 resources/ip-ranges.csv 에서 읽는다 (시연용 대역. 실서비스는 상용 DB·공식 목록으로 교체).
 * 원래 IP 는 저장하지 않고, 판별한 종류만 구매 기록에 남긴다.
 */
@Component
public class IpIntelligence {

	public enum IpType {
		/** 사설망·내 컴퓨터 (판단하지 않음) */
		LOCAL("내부망"),
		/** 목록에 없는 일반 IP */
		UNKNOWN("일반"),
		FOREIGN("해외"),
		VPN("VPN·프록시"),
		DATACENTER("데이터센터"),
		TOR("Tor");

		private final String label;

		IpType(String label) {
			this.label = label;
		}

		public String label() {
			return label;
		}

		/** 실제 위치를 숨기거나 사람이 쓰는 회선이 아닌 IP */
		public boolean anonymous() {
			return this == VPN || this == DATACENTER || this == TOR;
		}

		/** 한국 바깥으로 보이는 IP (해외 또는 익명) */
		public boolean outsideKorea() {
			return this == FOREIGN || anonymous();
		}
	}

	private record Range(byte[] network, int prefix, IpType type) {
	}

	private static final Logger log = LoggerFactory.getLogger(IpIntelligence.class);

	private final List<Range> ranges = new ArrayList<>();

	public IpIntelligence() {
		ClassPathResource res = new ClassPathResource("ip-ranges.csv");
		if (!res.exists()) {
			return;
		}
		try (BufferedReader r = new BufferedReader(new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
			String line;
			while ((line = r.readLine()) != null) {
				line = line.strip();
				if (line.isEmpty() || line.startsWith("#")) {
					continue;
				}
				String[] f = line.split(",", 3);
				String[] cidr = f[0].strip().split("/");
				ranges.add(new Range(InetAddress.getByName(cidr[0]).getAddress(), Integer.parseInt(cidr[1]),
						IpType.valueOf(f[1].strip())));
			}
			log.info("IP 종류 목록 {}개 대역 읽음", ranges.size());
		}
		catch (IOException | RuntimeException e) {
			log.warn("IP 종류 목록을 읽지 못했습니다: {}", e.getMessage());
		}
	}

	public IpType classify(String ip) {
		if (ip == null || ip.isBlank()) {
			return IpType.UNKNOWN;
		}
		byte[] addr;
		try {
			// 숫자 IP 만 받는다 (도메인 이름을 넘기면 DNS 조회가 일어나므로 거른다)
			if (!ip.matches("[0-9a-fA-F:.]+")) {
				return IpType.UNKNOWN;
			}
			InetAddress a = InetAddress.getByName(ip);
			if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress()) {
				return IpType.LOCAL;
			}
			addr = a.getAddress();
		}
		catch (UnknownHostException e) {
			return IpType.UNKNOWN;
		}
		for (Range range : ranges) {
			if (matches(addr, range.network(), range.prefix())) {
				return range.type();
			}
		}
		return IpType.UNKNOWN;
	}

	private static boolean matches(byte[] addr, byte[] net, int prefix) {
		if (addr.length != net.length) {
			return false;
		}
		int full = prefix / 8, rest = prefix % 8;
		for (int i = 0; i < full; i++) {
			if (addr[i] != net[i]) {
				return false;
			}
		}
		if (rest == 0) {
			return true;
		}
		int mask = (0xFF << (8 - rest)) & 0xFF;
		return (addr[full] & mask) == (net[full] & mask);
	}
}
