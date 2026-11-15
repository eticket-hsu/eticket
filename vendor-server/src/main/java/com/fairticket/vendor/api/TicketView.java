package com.fairticket.vendor.api;

import java.time.LocalDateTime;

import com.fairticket.vendor.domain.Performance;
import com.fairticket.vendor.domain.QrCodec;
import com.fairticket.vendor.domain.Ticket;

/** 화면·API 응답용 티켓 정보. */
public record TicketView(Long id, Long performanceId, String performanceCode, String performanceTitle, String artist,
		String venue, LocalDateTime startsAt, String seat, int facePrice, int acquiredPrice, int resalePriceCap,
		String status, int issueVersion,
		boolean resaleAllowed, Long ownerId, String ownerName, String ownerFtUid, String qr) {

	public static TicketView of(Ticket t, QrCodec qrCodec) {
		Performance p = t.getPerformance();
		return new TicketView(t.getId(), p.getId(), p.getCode(), p.getTitle(), p.getArtist(), p.getVenue(),
				p.getStartsAt(), t.getSeat(), t.getFacePrice(), t.getAcquiredPrice(), t.resalePriceCap(),
				t.getStatus().name(), t.getIssueVersion(),
				p.isResaleAllowed(), t.getOwner().getId(), t.getOwner().getName(), t.getOwner().getFtUid(),
				qrCodec.encode(t));
	}
}
