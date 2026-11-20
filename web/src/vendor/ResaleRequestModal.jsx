import { useState } from 'react'

import { ShieldCheck, Check } from 'lucide-react'
import { api } from '../api.js'
import { Modal, Poster, dateLabel, useToast, won } from '../components/ui.jsx'
import { useVendor } from './VendorApp.jsx'

export function ResaleRequestModal({ ticket, onClose, onDone }) {
  const { vendorId, vendor, me } = useVendor()
  const cap = ticket.resalePriceCap
  const [price, setPrice] = useState(cap)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const valid = Number.isInteger(price) && price >= 0 && price <= cap

  async function submit() {
    setBusy(true)
    try {
      const res = await api.post(vendorId, `/api/tickets/${ticket.id}/resale`, {
        memberId: me.id,
        price,
      })
      if (res.status === 'LISTED')
        toast(`${vendor.name}가 승인했습니다. ${won(price)}에 재판매 목록에 등록되었습니다`, 'good')
      else toast(`재판매가 등록되지 않았습니다 (${res.status})`, 'bad')
      onDone()
      onClose()
    } catch (e) {
      toast(e.message, 'bad')
      setBusy(false)
    }
  }

  const rules = [
    ['구매자 선정', 'eTicket 추첨. 판매자가 구매자를 지정할 수 없습니다'],
    ['수수료', '없음. 판매 금액 전액이 정산됩니다'],
    ['정산', '새 구매자에게 재발급이 끝난 뒤 정산됩니다'],
    ['신청 즉시', '이 티켓의 QR은 사용이 정지됩니다'],
    ['판매 전 취소·미판매', '티켓 사용 권한이 그대로 복원됩니다'],
  ]
  return (
    <Modal title="공식 재판매 신청" onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 18 }}>
        <div style={{ width: 64 }}>
          <Poster perf={{ code: ticket.performanceCode, title: '' }} />
        </div>
        <div>
          <b>{ticket.performanceTitle}</b>
          <div className="small muted">
            {ticket.seat} · {dateLabel(ticket.startsAt)}
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label className="small" style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>
          판매 가격
        </label>
        <div className="row">
          <input
            className="field"
            type="number"
            min={0}
            max={cap}
            step={1000}
            value={Number.isNaN(price) ? '' : price}
            onChange={(e) => setPrice(e.target.value === '' ? NaN : Number(e.target.value))}
            style={{ fontSize: 18, fontWeight: 800 }}
          />
          <span className="text-2">원</span>
          <button className="btn sm" onClick={() => setPrice(cap)}>
            최대
          </button>
        </div>
        <p className="tiny muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
          최대 {won(cap)} = 정가 {won(ticket.facePrice)}와 내가 산 가격 {won(ticket.acquiredPrice)}{' '}
          중 낮은 값. 급하게 팔고 싶다면 더 낮게 정할 수 있습니다. 높게는 올릴 수 없어 웃돈 거래와
          차익 거래를 막습니다.
        </p>
        {!valid && (
          <p className="tiny" style={{ color: 'var(--bad)', marginTop: 4 }}>
            0원 이상 {won(cap)} 이하로 입력하세요
          </p>
        )}
      </div>
      <div className="policy" style={{ marginBottom: 18 }}>
        {rules.map(([k, v]) => (
          <div key={k}>
            <Check size={16} />
            <span>
              <b>{k}</b> · {v}
            </span>
          </div>
        ))}
      </div>
      <p className="tiny muted" style={{ marginBottom: 14, display: 'flex', gap: 6 }}>
        <ShieldCheck size={14} /> 발급·무효화·재발급 권한은 {vendor.name}가 유지하고, eTicket은
        절차를 연결합니다.
      </p>
      <button className="btn primary lg block" disabled={busy || !valid} onClick={submit}>
        {busy ? `${vendor.name} 승인 요청 중…` : `${valid ? won(price) : ''}에 재판매 신청하기`}
      </button>
    </Modal>
  )
}
