package com.fairticket.vendor.api;

import java.time.LocalDateTime;

import com.fairticket.vendor.domain.Performance;
import com.fairticket.vendor.domain.Ticket;

/**
 * 화면·API 응답용 티켓 정보.
 * qr 은 이 표가 묶인 기기에서 요청했을 때만 채워진다 (다른 기기면 null, deviceLocked = true).
 * qrRefreshAt: QR 이 다음 것으로 바뀌는 시각, qrExpiresAt: 이 QR 로 더는 입장할 수 없는 시각 (epoch ms)
 */
public record TicketView(Long id, Long performanceId, String performanceCode, String performanceTitle, String artist,
		String venue, LocalDateTime startsAt, String seat, int facePrice, int acquiredPrice, int resalePriceCap,
		String status, int issueVersion, boolean resaleAllowed, Long ownerId, String ownerName, String ownerFtUid,
		String qr, Long qrRefreshAt, Long qrExpiresAt, boolean deviceLocked, int deviceChanges) {

	/** QR 없이 (서버 간 API·다른 기기용) */
	public static TicketView of(Ticket t) {
		return build(t, null, null, null, false);
	}

	public static TicketView withQr(Ticket t, String qr, long refreshAt, long expiresAt) {
		return build(t, qr, refreshAt, expiresAt, false);
	}

	/** 다른 기기에 묶인 표: QR 을 보여 주지 않는다 */
	public static TicketView locked(Ticket t) {
		return build(t, null, null, null, true);
	}

	private static TicketView build(Ticket t, String qr, Long refreshAt, Long expiresAt, boolean locked) {
		Performance p = t.getPerformance();
		return new TicketView(t.getId(), p.getId(), p.getCode(), p.getTitle(), p.getArtist(), p.getVenue(),
				p.getStartsAt(), t.getSeat(), t.getFacePrice(), t.getAcquiredPrice(), t.resalePriceCap(),
				t.getStatus().name(), t.getIssueVersion(), p.isResaleAllowed(), t.getOwner().getId(),
				t.getOwner().getName(), t.getOwner().getFtUid(), qr, refreshAt, expiresAt, locked,
				t.getDeviceChanges());
	}
}
