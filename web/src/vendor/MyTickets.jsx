import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Ban, Repeat, TicketX, Lock, Smartphone } from 'lucide-react'
import { api } from '../api.js'
import {
  Badge,
  Poster,
  RESALE_STATUS,
  ResaleStepper,
  TICKET_STATUS,
  dateLabel,
  usePolling,
  useToast,
  won,
} from '../components/ui.jsx'
import { NeedLogin, useVendor } from './VendorApp.jsx'
import { QrModal, QrCountdown } from './TicketQr.jsx'
import { DeviceMoveModal } from './DeviceMoveModal.jsx'
import { ResaleRequestModal } from './ResaleRequestModal.jsx'
import { ResaleHistory } from './ResaleHistory.jsx'

// 재판매가 끝나지 않은 상태만 진행 중 목록에 포함한다.
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

  const listingFor = (t) =>
    myResales.find((r) => r.vendorTicketId === t.id && ACTIVE.includes(r.status))

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
          const fraud = t.status === 'FRAUD_CANCELLED'
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
                {/* 취소·사용 정지된 표도 QR 은 열어 볼 수 있다 (캡처해 둔 QR 로 입장을 시도해도 막히는지 확인용). 다른 기기면 옮기기 */}
                <div
                  className={`qr-box ${locked || fraud || otherDevice ? 'locked' : ''}`}
                  onClick={() => (otherDevice ? setMoveOf(t) : setQrOf(t.id))}
                >
                  {otherDevice ? (
                    <div className="qr-blank" />
                  ) : (
                    <QRCodeSVG value={t.qr} size={104} />
                  )}
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
                  {!otherDevice && fraud && (
                    <div className="qr-over">
                      <Ban size={18} />
                      <br />
                      취소됨
                    </div>
                  )}
                  {used && (
                    <div className="stamp">
                      <span>USED</span>
                    </div>
                  )}
                </div>
                <div className="grow small text-2" style={{ lineHeight: 1.6 }}>
                  {fraud ? (
                    <>
                      부정 구매로 취소되어 입장할 수 없습니다. 대금은 환불됩니다.
                      <span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>
                        QR을 누르면 내용을 볼 수 있어요 (입장 검증 시연용)
                      </span>
                      {t.cancelReason && (
                        <span className="tiny muted" style={{ display: 'block', marginTop: 4 }}>
                          근거: {t.cancelReason}
                        </span>
                      )}
                    </>
                  ) : otherDevice ? (
                    <>
                      다른 기기에서 받은 표라 QR을 볼 수 없습니다.
                      <button
                        className="btn sm"
                        style={{ display: 'flex', marginTop: 8 }}
                        onClick={() => setMoveOf(t)}
                      >
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
                      <span className="tiny muted">캡처한 QR은 40초 뒤 입장할 수 없습니다</span>
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
      {resaleOf && (
        <ResaleRequestModal ticket={resaleOf} onClose={() => setResaleOf(null)} onDone={load} />
      )}
    </>
  )
}
