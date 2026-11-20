import { useEffect, useState } from 'react'

import { QRCodeSVG } from 'qrcode.react'
import { Copy, RefreshCw } from 'lucide-react'

import { Modal, useToast } from '../components/ui.jsx'

export function QrModal({ ticket, onClose }) {
  const toast = useToast()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticket.qr)
      toast('QR 내용을 복사했습니다. 입장 검증 화면에 붙여넣을 수 있습니다', 'good')
    } catch {
      toast('복사할 수 없습니다', 'bad')
    }
  }
  return (
    <Modal title="입장 QR" onClose={onClose}>
      <div className="center">
        {ticket.status !== 'VALID' && (
          <div
            className="badge bad"
            style={{
              display: 'flex',
              justifyContent: 'center',
              height: 'auto',
              padding: '10px 12px',
              marginBottom: 14,
              borderRadius: 10,
              whiteSpace: 'normal',
            }}
          >
            {ticket.status === 'FRAUD_CANCELLED'
              ? '부정 구매로 취소된 표입니다. 이 QR로는 입장할 수 없습니다'
              : ticket.status === 'LOCKED'
                ? '재판매 진행 중이라 이 QR로는 입장할 수 없습니다'
                : ticket.status === 'USED'
                  ? '이미 입장한 표입니다'
                  : '사용할 수 없는 표입니다'}
          </div>
        )}
        <div
          style={{
            display: 'inline-block',
            padding: 16,
            background: '#fff',
            borderRadius: 16,
            border: '1px solid var(--line)',
          }}
        >
          <QRCodeSVG value={ticket.qr} size={240} />
        </div>
        <h3 style={{ marginTop: 16, fontSize: 18 }}>
          {ticket.performanceTitle} · {ticket.seat}
        </h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          {ticket.ownerName} · 발급 버전 v{ticket.issueVersion}
        </p>
        <QrCountdown refreshAt={ticket.qrRefreshAt} big />
        <p className="tiny mono muted" style={{ marginTop: 12, wordBreak: 'break-all' }}>
          {ticket.qr}
        </p>
        <button className="btn sm" style={{ marginTop: 12 }} onClick={copy}>
          <Copy size={14} /> QR 내용 복사
        </button>
      </div>
    </Modal>
  )
}

/** 1초마다 다시 그리는 현재 시각 */
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** QR 이 다음 것으로 바뀌기까지 남은 시간 */
export function QrCountdown({ refreshAt, big }) {
  const now = useNow()
  if (!refreshAt) return null
  const left = Math.max(0, Math.ceil((refreshAt - now) / 1000))
  const pct = Math.min(100, (left / 30) * 100)
  return (
    <div className={`qr-countdown ${big ? 'big' : ''}`}>
      <RefreshCw size={big ? 14 : 12} /> {left > 0 ? `${left}초 뒤 새 QR로 바뀜` : '새 QR 받는 중…'}
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}
