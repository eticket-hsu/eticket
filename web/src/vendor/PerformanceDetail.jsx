import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, ShieldAlert, ShieldCheck, Info, Ban, KeyRound, Smartphone } from 'lucide-react'
import { api } from '../api.js'
import { Modal, Poster, RISK, dateLabel, usePolling, won } from '../components/ui.jsx'
import Captcha from '../components/Captcha.jsx'
import { useVendor } from './VendorApp.jsx'

export default function PerformanceDetail() {
  const { id } = useParams()
  const { vendor, vendorId, me, openLogin } = useVendor()
  const [data, setData] = useState(null)
  const [seat, setSeat] = useState(null)
  const [flow, setFlow] = useState(null) // { step, result, error }

  const load = async () => {
    try {
      setData(await api.get(vendorId, `/api/performances/${id}`))
    } catch {
      /* 오프라인 */
    }
  }
  usePolling(load, 3000)

  // 좌석 화면을 연 시각을 예매처에 알림 (반응 시간 측정: 사람이 불가능한 속도의 예매를 잡기 위함)
  useEffect(() => {
    if (me) api.post(vendorId, `/api/performances/${id}/view`, { memberId: me.id }).catch(() => {})
  }, [vendorId, id, me])

  if (!data) return <div className="empty">불러오는 중…</div>
  const { performance: p, seats, taken, seatRows } = data
  const takenSet = new Set(taken)
  const rows = seatRows.split('')

  /** extra: 보안문자를 통과해 다시 요청할 때 { captchaId, captchaAnswer } */
  async function purchase(extra = {}) {
    if (!me) return openLogin()
    setFlow({ step: 1 })
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    try {
      const call = api.post(vendorId, `/api/performances/${p.id}/purchase`, { memberId: me.id, seat, ...extra })
      await wait(700)
      setFlow({ step: 2 })
      const [res] = await Promise.all([call, wait(900)])
      setFlow({ step: 3, result: res })
      setSeat(null)
      load()
    } catch (e) {
      await wait(600)
      // 등급별 조치: MEDIUM → 보안문자, HIGH → 보안문자 + 본인인증
      if (e.data?.verifyRequired) setFlow({ step: 'verify', risk: e.data.risk })
      else if (e.data?.captchaRequired) setFlow({ step: 'captcha', level: e.data.level, wrong: e.data.wrong, risk: e.data.risk })
      else setFlow({ step: 3, error: e })
      load()
    }
  }

  return (
    <>
      <div className="detail">
        <Poster perf={p} large />
        <div>
          <span className="badge info">{p.genre}</span>
          <h1 style={{ marginTop: 10 }}>{p.title}</h1>
          <dl className="info-list">
            <dt>출연</dt>
            <dd>{p.artist}</dd>
            <dt>일시</dt>
            <dd>{dateLabel(p.startsAt)}</dd>
            <dt>장소</dt>
            <dd>{p.venue}</dd>
            <dt>가격</dt>
            <dd>{won(p.price)}</dd>
            <dt>구매 한도</dt>
            <dd>
              1인 {p.perUserLimit}매 <span className="muted small">(FairTicket 연동 예매처 합산)</span>
            </dd>
            <dt>판매 구역</dt>
            <dd>
              {rows[0]}~{rows[rows.length - 1]}열 ({vendor.name} 배정 구역)
            </dd>
          </dl>
          <div className="policy">
            <div>
              <ShieldCheck size={16} /> FairTicket 부정구매 공동 대응 적용 공연입니다. 매크로·다중 계정으로 의심되는 구매는 보류될 수 있습니다.
            </div>
            {p.resaleAllowed ? (
              <div>
                <Check size={16} /> 관람이 어려우면 공식 재판매로 정가 이하에 판매할 수 있습니다.
              </div>
            ) : (
              <div>
                <Ban size={16} /> 이 공연은 재판매가 허용되지 않습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="booking">
        <div className="card seatmap">
          <div className="stage">STAGE</div>
          <div className="seat-rows">
            {rows.map((r) => (
              <div className="seat-row" key={r}>
                <span className="label">{r}</span>
                {seats
                  .filter((s) => s.startsWith(r + '-'))
                  .map((s, i) => (
                    <span key={s} style={{ display: 'contents' }}>
                      {i === 5 && <span className="gap" />}
                      <button
                        className={`seat ${seat === s ? 'sel' : ''}`}
                        disabled={takenSet.has(s)}
                        onClick={() => setSeat(seat === s ? null : s)}
                        title={s}
                      >
                        {s.split('-')[1]}
                      </button>
                    </span>
                  ))}
                <span className="label">{r}</span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span>
              <i /> 선택 가능
            </span>
            <span>
              <i style={{ background: 'var(--brand)', borderColor: 'var(--brand)' }} /> 선택한 좌석
            </span>
            <span>
              <i style={{ background: '#e7e9ee', borderColor: '#e7e9ee' }} /> 판매 완료
            </span>
          </div>
        </div>

        <div className="card summary">
          <h3 style={{ fontSize: 17 }}>예매 정보</h3>
          <div className="line">
            <span className="muted">좌석</span>
            <b>{seat ?? '좌석을 선택하세요'}</b>
          </div>
          <div className="line">
            <span className="muted">잔여석</span>
            <b>
              {seats.length - taken.length} / {seats.length}
            </b>
          </div>
          <div className="line">
            <span className="muted">결제 금액</span>
            <span className="total">{seat ? won(p.price) : '-'}</span>
          </div>
          <button className="btn primary lg block" disabled={!seat} onClick={() => purchase()}>
            {me ? '예매하기' : '로그인 후 예매'}
          </button>
          <p className="tiny muted center">시연용 가상 결제로 즉시 처리됩니다</p>
        </div>
      </div>

      {flow && (
        <PurchaseFlow
          flow={flow}
          onRetry={purchase}
          memberId={me?.id}
          vendorName={vendor.name}
          onClose={() => setFlow(null)}
          vendorId={vendorId}
        />
      )}
    </>
  )
}

function PurchaseFlow({ flow, vendorName, onClose, vendorId, onRetry, memberId }) {
  const navigate = useNavigate()
  const done = flow.step === 3

  if (flow.step === 'captcha') {
    return <CaptchaStep flow={flow} vendorName={vendorName} onClose={onClose} onRetry={onRetry} />
  }
  if (flow.step === 'verify') {
    return <VerifyStep flow={flow} vendorName={vendorName} vendorId={vendorId} memberId={memberId} onClose={onClose} onRetry={onRetry} />
  }

  if (!done) {
    return (
      <Modal title="예매 진행 중">
        <div className="progress-steps">
          {['FairTicket 위험 신호 확인', '공통 구매 한도 확인 (연동 예매처 합산)', `${vendorName} 승인 및 티켓 발급`].map((t, i) => (
            <div key={t} className={`ps ${flow.step > i + 1 ? 'done' : flow.step === i + 1 ? 'now' : ''}`}>
              <span className="ic">{flow.step > i + 1 ? <Check size={15} /> : flow.step === i + 1 ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : i + 1}</span>
              {t}
            </div>
          ))}
        </div>
      </Modal>
    )
  }

  if (flow.result) {
    const t = flow.result.ticket
    const risk = flow.result.risk
    return (
      <Modal onClose={onClose}>
        <div className="result-hero">
          <div className="big-ic" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
            <Check size={34} strokeWidth={3} />
          </div>
          <h4>예매가 완료되었습니다</h4>
          <p>
            {t.performanceTitle} · {t.seat}
            <br />
            FairTicket 위험 신호: <b>{RISK[risk?.riskLevel]?.label ?? '확인 불가'}</b> → {vendorName} 승인
          </p>
        </div>
        <button className="btn primary lg block" onClick={() => navigate(`/${vendorId}/my`)}>
          내 티켓 보기
        </button>
      </Modal>
    )
  }

  const e = flow.error
  const held = e.data?.held
  const quota = e.data?.quotaExceeded
  const reasons = e.data?.risk?.reasons ?? []
  return (
    <Modal onClose={onClose}>
      <div className="result-hero">
        <div className="big-ic" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
          {held ? <ShieldAlert size={32} /> : <Info size={32} />}
        </div>
        <h4>{held ? '구매가 보류되었습니다' : quota ? '공통 구매 한도를 넘었습니다' : '예매할 수 없습니다'}</h4>
        <p>
          {held
            ? `${vendorName}가 FairTicket 위험 신호를 참고해 이 구매를 보류했습니다.`
            : quota
              ? `이 공연은 1인 ${e.data.limit}매까지이며, FairTicket에 연동된 모든 예매처의 구매를 합산합니다. 현재 ${e.data.used}매를 보유 중입니다.`
              : e.message}
        </p>
      </div>
      {held && reasons.length > 0 && (
        <div className="reason-box">
          <b>판단 근거 (위험 점수 {e.data.risk.score}점)</b>
          {reasons.map((r) => (
            <div key={r.rule}>· {r.detail}</div>
          ))}
          <div className="tiny muted" style={{ marginTop: 4 }}>
            부정사용자로 확정한 것이 아니며, 본인 인증 후 다시 시도할 수 있도록 안내합니다.
          </div>
        </div>
      )}
      <button className="btn lg block" style={{ marginTop: 16 }} onClick={onClose}>
        확인
      </button>
    </Modal>
  )
}

/** 위험 등급 MEDIUM: 보안문자 */
function CaptchaStep({ flow, vendorName, onClose, onRetry }) {
  const [c, setC] = useState({})
  return (
    <Modal title="보안문자 확인" onClose={onClose}>
      <div className="notice-bar" style={{ marginBottom: 16 }}>
        <ShieldCheck size={18} />
        <div className="small">
          {flow.wrong
            ? '입력한 보안문자가 맞지 않습니다. 새 문제로 다시 입력해 주세요.'
            : `FairTicket이 이 구매 시도를 '주의' 단계로 판단해 ${vendorName}가 보안문자를 요청합니다. 매크로가 아니라면 바로 통과할 수 있습니다.`}
        </div>
      </div>
      <Captcha onChange={setC} />
      <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={(c.answer ?? '').length !== 5}
        onClick={() => onRetry({ captchaId: c.id, captchaAnswer: c.answer })}>
        확인하고 예매하기
      </button>
    </Modal>
  )
}

/** 위험 등급 HIGH: 보류. 보안문자(매크로 차단) + 본인인증(다중 계정 차단)을 모두 통과하면 진행 */
function VerifyStep({ flow, vendorName, vendorId, memberId, onClose, onRetry }) {
  const [c, setC] = useState({})
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const reasons = flow.risk?.reasons ?? []

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api.post(vendorId, '/api/identity/verify', { memberId, code })
    } catch (e) {
      setError(e.message)
      setBusy(false)
      return
    }
    onRetry({ captchaId: c.id, captchaAnswer: c.answer })
  }

  return (
    <Modal title="구매가 보류되었습니다" onClose={onClose}>
      <p className="small text-2" style={{ marginBottom: 12, lineHeight: 1.6 }}>
        {vendorName}가 FairTicket 위험 신호를 참고해 이 구매를 보류했습니다. 부정사용자로 확정한 것은 아니며, 아래 두 가지를 통과하면 이 구매를 진행할 수 있습니다.
      </p>
      {reasons.length > 0 && (
        <div className="reason-box" style={{ marginBottom: 16 }}>
          <b>판단 근거 (위험 점수 {flow.risk.score}점)</b>
          {reasons.map((r) => (
            <div key={r.rule}>· {r.detail}</div>
          ))}
        </div>
      )}
      <div className="col" style={{ gap: 14 }}>
        <div>
          <b className="small row" style={{ gap: 6, marginBottom: 8 }}>
            <KeyRound size={15} /> 1. 보안문자 (매크로 확인)
          </b>
          <Captcha onChange={setC} autoFocus={false} />
        </div>
        <div>
          <b className="small row" style={{ gap: 6, marginBottom: 8 }}>
            <Smartphone size={15} /> 2. 휴대폰 본인인증 (다중 계정 확인)
          </b>
          <input className="field" inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <p className="tiny muted" style={{ marginTop: 6 }}>시연용 모의 인증입니다. 인증번호 123456을 입력하세요.</p>
        </div>
      </div>
      {error && <p className="small" style={{ color: 'var(--bad)', marginTop: 10 }}>{error}</p>}
      <button className="btn primary lg block" style={{ marginTop: 16 }}
        disabled={busy || (c.answer ?? '').length !== 5 || code.length !== 6} onClick={submit}>
        인증하고 예매하기
      </button>
      <p className="tiny muted center" style={{ marginTop: 10 }}>인증을 통과해도 위험 분석은 계속됩니다</p>
    </Modal>
  )
}
