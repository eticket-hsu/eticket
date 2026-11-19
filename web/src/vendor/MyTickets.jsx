import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Repeat, TicketX, Lock, ShieldCheck, Check, Smartphone, RefreshCw } from 'lucide-react'
import { api } from '../api.js'
import {
  Badge, Modal, Poster, RESALE_STATUS, ResaleStepper, TICKET_STATUS, dateLabel, usePolling, useToast, won,
} from '../components/ui.jsx'
import { NeedLogin, useVendor } from './VendorApp.jsx'

const ACTIVE = ['RESALE_PENDING', 'LISTED', 'DRAWN', 'PAID', 'REISSUED']

export default function MyTickets() {
  const { vendorId, me } = useVendor()
  const [tickets, setTickets] = useState(null)
  const [myResales, setMyResales] = useState([])
  const [qrOf, setQrOf] = useState(null) // 티켓 id (열려 있는 동안 새 QR 로 계속 바뀜)
  const [moveOf, setMoveOf] = useState(null)
  const [resaleOf, setResaleOf] = useState(null)
  const toast = useToast()

  const load = async () => {
    if (!me) return
    try {
      setTickets(await api.get(vendorId, `/api/members/${me.id}/tickets`))
    } catch {
      /* 오프라인 */
    }
    try {
      const all = await api.get('ft', '/v1/resales')
      setMyResales(all.filter((r) => r.vendorId === vendorId && r.sellerUid === me.ftUid))
    } catch {
      setMyResales([])
    }
  }
  usePolling(load, 2500, [me?.id])

  if (!me) return <NeedLogin text="로그인하면 예매한 티켓을 볼 수 있습니다" />
  if (!tickets) return <div className="empty">불러오는 중…</div>

  const listingFor = (t) => myResales.find((r) => r.vendorTicketId === t.id && ACTIVE.includes(r.status))

  async function cancelResale(l) {
    try {
      await api.del('ft', `/v1/resales/${l.id}`)
      toast('재판매를 취소했습니다. 티켓을 다시 사용할 수 있습니다', 'good')
      load()
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  return (
    <>
      <h2 className="section-title">내 티켓</h2>
      {tickets?.length === 0 && (
        <div className="card empty">
          <TicketX size={36} />
          예매한 티켓이 없습니다.{' '}
          <Link to={`/${vendorId}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>
            공연 보러 가기
          </Link>
        </div>
      )}
      <div className="ticket-grid">
        {tickets?.map((t) => {
          const listing = listingFor(t)
          const locked = t.status === 'LOCKED'
          const used = t.status === 'USED'
          const otherDevice = t.deviceLocked
          return (
            <article key={t.id} className="mticket">
              <div className="mticket-top">
                <Poster perf={{ code: t.performanceCode, title: t.performanceTitle }} />
                <div className="grow">
                  <Badge map={TICKET_STATUS} value={t.status} />
                  <h3 style={{ marginTop: 8 }}>{t.performanceTitle}</h3>
                  <div className="small muted">
                    {t.venue} · {dateLabel(t.startsAt)}
                  </div>
                  <div className="kv">
                    <div>
                      <span>좌석</span>
                      <b>{t.seat}</b>
                    </div>
                    <div>
                      <span>발급 버전</span>
                      <b>v{t.issueVersion}</b>
                    </div>
                  </div>
                  {t.acquiredPrice !== t.facePrice && (
                    <div className="tiny muted" style={{ marginTop: 8 }}>
                      공식 재판매로 {won(t.acquiredPrice)}에 구매 (정가 {won(t.facePrice)})
                    </div>
                  )}
                </div>
              </div>
              <div className="perf">
                <i />
              </div>
              <div className="mticket-qr">
                <div
                  className={`qr-box ${locked || otherDevice ? 'locked' : ''}`}
                  onClick={() => (otherDevice ? setMoveOf(t) : !locked && setQrOf(t.id))}
                >
                  {otherDevice ? <div className="qr-blank" /> : <QRCodeSVG value={t.qr} size={104} />}
                  {otherDevice && (
                    <div className="qr-over">
                      <Smartphone size={18} />
                      <br />
                      다른 기기
                    </div>
                  )}
                  {!otherDevice && locked && (
                    <div className="qr-over">
                      <Lock size={18} />
                      <br />
                      사용 정지
                    </div>
                  )}
                  {used && (
                    <div className="stamp">
                      <span>USED</span>
                    </div>
                  )}
                </div>
                <div className="grow small text-2" style={{ lineHeight: 1.6 }}>
                  {otherDevice ? (
                    <>
                      다른 기기에서 받은 표라 QR을 볼 수 없습니다.
                      <button className="btn sm" style={{ display: 'flex', marginTop: 8 }} onClick={() => setMoveOf(t)}>
                        <Smartphone size={14} /> 본인인증하고 이 기기로 옮기기
                      </button>
                    </>
                  ) : locked ? (
                    '공식 재판매가 진행 중이라 이 QR로는 입장할 수 없습니다. 판매가 취소되면 다시 사용할 수 있습니다.'
                  ) : used ? (
                    '입장이 완료된 티켓입니다.'
                  ) : (
                    <>
                      QR을 눌러 크게 보기
                      <QrCountdown refreshAt={t.qrRefreshAt} />
                      <span className="tiny muted">캡처한 QR은 1분 뒤 입장할 수 없습니다</span>
                    </>
                  )}
                </div>
              </div>
              {(listing || (t.status === 'VALID' && t.resaleAllowed)) && (
                <div className="mticket-foot">
                  {listing ? (
                    <>
                      <div className="spread">
                        <b className="small">공식 재판매 #{listing.id}</b>
                        <Badge map={RESALE_STATUS} value={listing.status} />
                      </div>
                      <ResaleStepper status={listing.status} />
                      {['RESALE_PENDING', 'LISTED'].includes(listing.status) && (
                        <button className="btn sm" onClick={() => cancelResale(listing)}>
                          재판매 취소
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn block" onClick={() => setResaleOf(t)}>
                      <Repeat size={16} /> 공식 재판매 신청
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <ResaleHistory resales={myResales.filter((r) => !ACTIVE.includes(r.status))} />

      {qrOf && tickets.find((t) => t.id === qrOf)?.qr && (
        <QrModal ticket={tickets.find((t) => t.id === qrOf)} onClose={() => setQrOf(null)} />
      )}
      {moveOf && <DeviceMoveModal ticket={moveOf} onClose={() => setMoveOf(null)} onDone={load} />}
      {resaleOf && <ResaleRequestModal ticket={resaleOf} onClose={() => setResaleOf(null)} onDone={load} />}
    </>
  )
}

function QrModal({ ticket, onClose }) {
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
        <div style={{ display: 'inline-block', padding: 16, background: '#fff', borderRadius: 16, border: '1px solid var(--line)' }}>
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
function QrCountdown({ refreshAt, big }) {
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

/** 다른 기기에 묶인 표를 본인인증으로 이 기기에 옮긴다 (폰 교체·분실 대비) */
function DeviceMoveModal({ ticket, onClose, onDone }) {
  const { vendorId, me } = useVendor()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  async function submit() {
    setBusy(true)
    try {
      await api.post(vendorId, `/api/tickets/${ticket.id}/device`, { memberId: me.id, code })
      toast('이 기기로 표를 옮겼습니다. 이전 기기에서는 QR이 보이지 않습니다', 'good')
      onDone()
      onClose()
    } catch (e) {
      toast(e.message, 'bad')
      setBusy(false)
    }
  }
  return (
    <Modal title="이 기기로 표 옮기기" onClose={onClose}>
      <p className="small text-2 lines" style={{ lineHeight: 1.7, marginBottom: 14 }}>
        <span>이 표는 다른 기기에서 처음 열려서, 그 기기에서만 QR이 보입니다.</span>
        <span>폰을 바꿨거나 잃어버렸다면 예매자 본인인증 후 이 기기로 옮길 수 있습니다.</span>
      </p>
      <input
        className="field"
        inputMode="numeric"
        maxLength={6}
        placeholder="인증번호 6자리 (시연용 123456)"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <button className="btn primary lg block" style={{ marginTop: 14 }} disabled={busy || code.length !== 6} onClick={submit}>
        <ShieldCheck size={16} /> 본인인증하고 옮기기
      </button>
      <p className="tiny muted center" style={{ marginTop: 10 }}>
        옮긴 기록은 남습니다. 자주 옮기면 계정 양도 의심으로 검토될 수 있습니다
      </p>
    </Modal>
  )
}

function ResaleRequestModal({ ticket, onClose, onDone }) {
  const { vendorId, vendor, me } = useVendor()
  const cap = ticket.resalePriceCap
  const [price, setPrice] = useState(cap)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const valid = Number.isInteger(price) && price >= 0 && price <= cap

  async function submit() {
    setBusy(true)
    try {
      const res = await api.post(vendorId, `/api/tickets/${ticket.id}/resale`, { memberId: me.id, price })
      if (res.status === 'LISTED') toast(`${vendor.name}가 승인했습니다. ${won(price)}에 재판매 목록에 등록되었습니다`, 'good')
      else toast(`재판매가 등록되지 않았습니다 (${res.status})`, 'bad')
      onDone()
      onClose()
    } catch (e) {
      toast(e.message, 'bad')
      setBusy(false)
    }
  }

  const rules = [
    ['구매자 선정', 'FairTicket 추첨. 판매자가 구매자를 지정할 수 없습니다'],
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
          최대 {won(cap)} = 정가 {won(ticket.facePrice)}와 내가 산 가격 {won(ticket.acquiredPrice)} 중 낮은 값.
          급하게 팔고 싶다면 더 낮게 정할 수 있습니다. 높게는 올릴 수 없어 웃돈 거래와 차익 거래를 막습니다.
        </p>
        {!valid && <p className="tiny" style={{ color: 'var(--bad)', marginTop: 4 }}>0원 이상 {won(cap)} 이하로 입력하세요</p>}
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
        <ShieldCheck size={14} /> 발급·무효화·재발급 권한은 {vendor.name}가 유지하고, FairTicket은 절차를 연결합니다.
      </p>
      <button className="btn primary lg block" disabled={busy || !valid} onClick={submit}>
        {busy ? `${vendor.name} 승인 요청 중…` : `${valid ? won(price) : ''}에 재판매 신청하기`}
      </button>
    </Modal>
  )
}

function ResaleHistory({ resales }) {
  if (resales.length === 0) return null
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 40 }}>
        지난 재판매 내역
      </h2>
      <div className="card">
        {resales.map((r) => (
          <div key={r.id} className="spread" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
            <div>
              <b>{r.performanceTitle ?? `티켓 ${r.vendorTicketId}`}</b>
              <div className="small muted">
                {r.seat} · 재판매 #{r.id} · {won(r.price)}
              </div>
            </div>
            <Badge map={RESALE_STATUS} value={r.status} />
          </div>
        ))}
      </div>
    </>
  )
}
