package com.fairticket.vendor.api;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fairticket.vendor.client.FairTicketClient;
import com.fairticket.vendor.config.VendorProperties;
import com.fairticket.vendor.domain.Member;
import com.fairticket.vendor.domain.MemberRepository;
import com.fairticket.vendor.domain.Performance;
import com.fairticket.vendor.domain.PerformanceRepository;
import com.fairticket.vendor.domain.QrCodec;
import com.fairticket.vendor.domain.Ticket;
import com.fairticket.vendor.domain.TicketRepository;
import com.fairticket.vendor.domain.TicketService;
import com.fairticket.vendor.security.IdentityService;
import com.fairticket.vendor.security.ViewTracker;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotNull;

/** 예매처 웹사이트(React)가 쓰는 API. */
@RestController
@RequestMapping("/api")
public class PublicApiController {

	/** 화면이 보내는 기기 ID (브라우저마다 다름). 실서비스 앱이라면 설치 기기 ID */
	static final String DEVICE_HEADER = "X-Device-Id";

	private final VendorProperties props;
	private final MemberRepository members;
	private final PerformanceRepository performances;
	private final TicketRepository tickets;
	private final TicketService ticketService;
	private final FairTicketClient fairTicket;
	private final QrCodec qrCodec;
	private final ViewTracker viewTracker;
	private final IdentityService identity;

	public PublicApiController(VendorProperties props, MemberRepository members, PerformanceRepository performances,
			TicketRepository tickets, TicketService ticketService, FairTicketClient fairTicket, QrCodec qrCodec,
			ViewTracker viewTracker, IdentityService identity) {
		this.props = props;
		this.members = members;
		this.performances = performances;
		this.tickets = tickets;
		this.ticketService = ticketService;
		this.fairTicket = fairTicket;
		this.qrCodec = qrCodec;
		this.viewTracker = viewTracker;
		this.identity = identity;
	}

	@GetMapping("/info")
	public Map<String, String> info() {
		return Map.of("id", props.id(), "name", props.name());
	}

	@GetMapping("/members")
	public List<Member> members() {
		return members.findAll();
	}

	@GetMapping("/performances")
	public List<Performance> performances() {
		return performances.findAll();
	}

	/** 공연 상세 + 좌석 배치 (이 예매처 구역의 전체 좌석과 판매된 좌석) */
	@GetMapping("/performances/{id}")
	public Map<String, Object> performance(@PathVariable Long id) {
		Performance perf = performances.findById(id).orElseThrow();
		return Map.of("performance", perf, "seatRows", props.seatRows(), "seats", ticketService.allSeats(perf),
				"taken", ticketService.takenSeats(id));
	}

	/** 회원이 좌석 화면을 열었음을 기록 (반응 시간 측정용) */
	@PostMapping("/performances/{id}/view")
	public Map<String, Boolean> view(@PathVariable Long id, @RequestBody ViewRequest req) {
		if (req.memberId() != null) {
			viewTracker.markView(req.memberId(), id);
		}
		return Map.of("ok", true);
	}

	public record ViewRequest(Long memberId) {
	}

	/**
	 * seat 를 비우면 빈 좌석 자동 배정.
	 * captchaId/captchaAnswer 는 FairTicket 보안문자를 통과해 다시 요청할 때 채운다.
	 */
	/** timezone: 브라우저 시간대. IP 위치와 비교해 VPN 사용을 찾는 데 쓴다 */
	public record PurchaseRequest(@NotNull Long memberId, String seat, String captchaId, String captchaAnswer,
			String timezone) {
	}

	/**
	 * 구매: FairTicket 에 시도를 알리고 위험 등급을 받은 뒤, 허용 여부는 예매처가 결정한다.
	 * 등급별 기본 조치 (설계 문서 C묶음 확정): LOW 허용 / MEDIUM 보안문자 / HIGH 보류,
	 * 보류는 보안문자 + 본인인증을 모두 통과하면 그 구매를 허용한다. 통과 후에도 분석은 계속된다.
	 */
	@PostMapping("/performances/{id}/purchase")
	public ResponseEntity<?> purchase(@PathVariable Long id, @RequestBody PurchaseRequest req,
			@RequestHeader(value = DEVICE_HEADER, required = false) String deviceId, HttpServletRequest http) {
		Member member = members.findById(req.memberId()).orElseThrow();
		Performance perf = performances.findById(id).orElseThrow();
		String uid = member.getFtUid();
		String ip = clientIp(http, member);
		boolean retryWithCaptcha = req.captchaId() != null;

		// 보안문자를 들고 다시 온 요청은 같은 시도로 보고 다시 세지 않는다
		if (!retryWithCaptcha) {
			fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "ATTEMPT", ip,
					viewTracker.reactionMs(member.getId(), id), req.timezone());
		}
		FairTicketClient.RiskResponse risk = fairTicket.getRisk(uid, perf.getCode());
		String level = risk == null ? "LOW" : risk.riskLevel();

		if ("HIGH".equals(level) && !identity.isVerified(member.getId())) {
			if (!retryWithCaptcha) {
				fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "HELD", ip);
			}
			return ResponseEntity.status(HttpStatus.FORBIDDEN)
				.body(Map.of("held", true, "verifyRequired", true, "message",
						props.name() + " 정책에 따라 구매가 보류되었습니다. 보안문자와 본인인증을 통과하면 진행할 수 있습니다", "risk", risk));
		}
		if ("MEDIUM".equals(level) || "HIGH".equals(level)) {
			if (!retryWithCaptcha) {
				return ResponseEntity.status(HttpStatus.FORBIDDEN)
					.body(Map.of("captchaRequired", true, "level", level, "message", "보안문자 확인이 필요합니다", "risk", risk));
			}
			if (!fairTicket.verifyCaptcha(req.captchaId(), req.captchaAnswer())) {
				fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "CAPTCHA_FAIL", ip);
				return ResponseEntity.status(HttpStatus.FORBIDDEN)
					.body(Map.of("captchaRequired", true, "wrong", true, "level", level, "message",
							"보안문자가 맞지 않습니다. 다시 입력해 주세요", "risk", risk));
			}
		}

		// 공통 구매 한도: 결제 전에 칸을 잡는다. FairTicket 연결 실패 시에는 이 예매처 한도만으로 진행한다.
		FairTicketClient.QuotaResult quota = fairTicket.reserveQuota(uid, perf, 1);
		if (quota.exceeded()) {
			fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "QUOTA", ip);
			return ResponseEntity.status(HttpStatus.CONFLICT)
				.body(Map.of("quotaExceeded", true, "message", quota.message(), "used",
						quota.used() == null ? 0 : quota.used(), "limit", quota.limit() == null ? 0 : quota.limit()));
		}
		Ticket t;
		try {
			t = ticketService.purchase(id, req.memberId(), req.seat());
		}
		catch (RuntimeException e) {
			fairTicket.releaseQuota(quota.id()); // 결제 실패: 즉시 반환
			fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "FAIL", ip);
			throw e;
		}
		fairTicket.confirmQuota(quota.id(), t.getId());
		viewTracker.clear(member.getId(), id);
		fairTicket.reportPurchaseAttempt(uid, perf.getCode(), "SUCCESS", ip);
		// 산 기기에 표를 묶는다 (이 기기에서만 QR 이 보임)
		return ResponseEntity.ok(Map.of("ticket", viewFor(t, deviceId), "risk", risk == null ? "UNKNOWN" : risk,
				"level", level, "quotaChecked", !quota.unavailable()));
	}

	/**
	 * 내 티켓. QR 은 표가 묶인 기기에서만 보이고 30초마다 바뀐다 (화면은 주기적으로 다시 불러 새 QR 을 받는다).
	 * 다른 기기에서 열면 QR 대신 deviceLocked = true 가 온다.
	 */
	@GetMapping("/members/{memberId}/tickets")
	public List<TicketView> myTickets(@PathVariable Long memberId,
			@RequestHeader(value = DEVICE_HEADER, required = false) String deviceId) {
		return tickets.findByOwnerIdOrderByIdDesc(memberId).stream().map(t -> viewFor(t, deviceId)).toList();
	}

	public record DeviceMoveRequest(@NotNull Long memberId, String code) {
	}

	/**
	 * 표를 이 기기로 옮기기. 폰을 바꾸거나 잃어버린 주인을 위해 본인인증을 거쳐 옮긴다.
	 * 계정을 통째로 넘겨받은 사람은 주인 명의 본인인증을 통과할 수 없으므로 옮길 수 없다.
	 * 옮긴 기록은 FairTicket 에 보내 사후 검토의 계정 양도 의심 신호로 쓴다.
	 */
	@PostMapping("/tickets/{id}/device")
	public ResponseEntity<?> moveDevice(@PathVariable Long id, @RequestBody DeviceMoveRequest req,
			@RequestHeader(value = DEVICE_HEADER, required = false) String deviceId, HttpServletRequest http) {
		if (deviceId == null || deviceId.isBlank()) {
			return ResponseEntity.badRequest().body(Map.of("error", "기기 정보가 없습니다"));
		}
		if (!identity.verify(req.memberId(), req.code())) {
			return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "본인인증 번호가 맞지 않습니다"));
		}
		Ticket t = ticketService.moveToDevice(id, req.memberId(), deviceHash(deviceId));
		Member member = members.findById(req.memberId()).orElseThrow();
		fairTicket.reportPurchaseAttempt(member.getFtUid(), t.getPerformance().getCode(), "DEVICE_CHANGE",
				clientIp(http, member));
		return ResponseEntity.ok(viewFor(ticketService.get(id), deviceId));
	}

	/**
	 * 시연용: 몇 초 전에 화면을 캡처해 둔 것과 같은 QR 을 만든다 (캡처본이 입장에서 거절되는지 보여 주기).
	 * 실서비스(demo-mode: false)에서는 404.
	 */
	@GetMapping("/demo/tickets/{id}/old-qr")
	public ResponseEntity<?> oldQr(@PathVariable Long id, @RequestParam(defaultValue = "120") long secondsAgo) {
		if (!props.demoMode()) {
			return ResponseEntity.notFound().build();
		}
		long window = QrCodec.currentWindow() - Math.max(0, secondsAgo) / QrCodec.WINDOW_SECONDS;
		return ResponseEntity.ok(Map.of("qr", qrCodec.encode(ticketService.get(id), window), "secondsAgo", secondsAgo));
	}

	/** 기기 ID 를 그대로 저장하지 않고 해시로 바꾼다 */
	private String deviceHash(String deviceId) {
		try {
			byte[] d = java.security.MessageDigest.getInstance("SHA-256")
				.digest((props.id() + ":" + deviceId).getBytes(java.nio.charset.StandardCharsets.UTF_8));
			return java.util.HexFormat.of().formatHex(d, 0, 16);
		}
		catch (java.security.NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	/** 표가 이 기기에 묶여 있으면 지금 시각의 QR 을, 아니면 QR 없이 돌려준다 (처음 여는 기기면 묶음) */
	private TicketView viewFor(Ticket t, String deviceId) {
		if (deviceId == null || deviceId.isBlank() || !ticketService.bindOrMatch(t.getId(), deviceHash(deviceId))) {
			return TicketView.locked(ticketService.get(t.getId()));
		}
		long window = QrCodec.currentWindow();
		return TicketView.withQr(ticketService.get(t.getId()), qrCodec.encode(t, window),
				QrCodec.refreshAtMillis(window), QrCodec.expiresAtMillis(window));
	}

	/** price 를 비우면 상한 가격으로 올린다 */
	public record ResaleRequest(@NotNull Long memberId, Integer price) {
	}

	/** 재판매 신청. 가격 상한 = min(최초가, 현재 소유자 취득가), 더 낮게 부르는 것은 허용. */
	@PostMapping("/tickets/{ticketId}/resale")
	public Map<?, ?> requestResale(@PathVariable Long ticketId, @RequestBody ResaleRequest req) {
		Ticket t = ticketService.get(ticketId);
		if (!t.getOwner().getId().equals(req.memberId())) {
			throw new IllegalStateException("본인 티켓만 재판매할 수 있습니다");
		}
		int price = req.price() == null ? t.resalePriceCap() : req.price();
		if (price < 0 || price > t.resalePriceCap()) {
			throw new IllegalArgumentException("재판매 가격은 0원 이상, " + t.resalePriceCap() + "원 이하로 정할 수 있습니다");
		}
		return fairTicket.registerResale(t.getId(), t.getPerformance(), t.getSeat(), t.getOwner().getFtUid(), price);
	}

	/**
	 * 접속 IP. 시연에서는 한 노트북에서 여러 사람을 흉내 내므로 모두 127.0.0.1 이 되어
	 * "같은 IP 계정"으로 잘못 묶인다. 로컬 접속이면 회원마다 가상 IP 를 쓴다 (시연 전용).
	 */
	private String clientIp(HttpServletRequest http, Member member) {
		// 시연용: 화면에서 고른 접속 위치(해외·VPN 등)의 IP 를 쓴다. 실서비스(demo-mode: false)에서는 무시
		String demoIp = http.getHeader("X-Demo-Client-Ip");
		if (props.demoMode() && demoIp != null && demoIp.matches("[0-9a-fA-F:.]{3,45}")) {
			return demoIp;
		}
		String ip = http.getRemoteAddr();
		boolean local = ip == null || ip.startsWith("127.") || ip.equals("0:0:0:0:0:0:0:1") || ip.equals("::1");
		return local ? "10.0.0." + (member.getId() % 250 + 1) : ip;
	}
}
