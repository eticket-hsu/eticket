import { useEffect, useState } from 'react'
import { Info, PartyPopper, Repeat, Check, CreditCard, Users, Zap, Dices } from 'lucide-react'
import { api } from '../api.js'
import { Badge, Modal, Poster, RESALE_STATUS, dateLabel, usePolling, useToast, won } from '../components/ui.jsx'
import Captcha from '../components/Captcha.jsx'
import { useVendor } from './VendorApp.jsx'

const VISIBLE = ['LISTED', 'DRAWN', 'PAID', 'REISSUED', 'SETTLED', 'REISSUE_FAILED']

export default function ResaleMarket() {
  const { vendor, vendorId, me, openLogin } = useVendor()
  const [listings, setListings] = useState([])
  const [details, setDetails] = useState({})
  const [payOf, setPayOf] = useState(null)
  const [captchaFor, setCaptchaFor] = useState(null) // { listing, wrong, mode: 'enter' | 'buy' }
  const [buyOf, setBuyOf] = useState(null)
  const toast = useToast()

  const load = async () => {
    try {
      const all = (await api.get('ft', '/v1/resales')).filter((r) => r.vendorId === vendorId && VISIBLE.includes(r.status))
      setListings(all)
      const ds = await Promise.all(all.map((r) => api.get('ft', `/v1/resales/${r.id}`).catch(() => null)))
      setDetails(Object.fromEntries(ds.filter(Boolean).map((d) => [d.listing.id, d])))
    } catch {
      /* 오프라인 */
    }
  }
  usePolling(load, 2500, [me?.id])

  /** 위험 등급 MEDIUM 이면 FairTicket 이 보안문자를 요구한다 (HIGH 는 응모 불가) */
  async function enter(l, captcha) {
    if (!me) return openLogin()
    try {
      await api.post('ft', `/v1/resales/${l.id}/entries`, { buyerUid: me.ftUid, ...captcha })
      setCaptchaFor(null)
      toast('응모했습니다. 추첨 결과를 기다려 주세요', 'good')
      load()
    } catch (e) {
      if (e.data?.captchaRequired) setCaptchaFor({ listing: l, wrong: e.data.wrong, mode: 'enter' })
      else toast(e.message, 'bad')
    }
  }

  function buy(l) {
    if (!me) return openLogin()
    setBuyOf({ listing: l })
  }

  const open = listings.filter((l) => l.status === 'LISTED' || l.status === 'DRAWN')
  const closed = listings.filter((l) => !(l.status === 'LISTED' || l.status === 'DRAWN'))

  return (
    <>
      <h2 className="section-title">
        <Repeat size={22} /> 공식 재판매
      </h2>
      <div className="notice-bar">
        <Info size={18} />
        <div className="lines">
          <span>관람이 어려워진 구매자가 {vendor.name}의 승인을 받아 올린 티켓입니다.</span>
          <span>
            <b>정가 이하</b>(판매자가 산 가격을 넘지 않음)로만 판매되고, 수수료는 없습니다.
          </span>
          <span>
            구매자는 <b>공연 24시간 전까지는 추첨</b>, 그 뒤로는 <b>먼저 결제한 사람</b>으로 정해집니다.
          </span>
          <span>결제가 끝나면 기존 티켓은 무효가 되고 새 티켓이 발급됩니다.</span>
        </div>
      </div>

      {open.length === 0 && <div className="card empty">지금 판매 중인 재판매 티켓이 없습니다.</div>}
      <div className="resale-grid">
        {open.map((l) => (
          <ListingCard key={l.id} l={l} d={details[l.id]} me={me} onEnter={() => enter(l)} onBuy={() => buy(l)} onPay={() => setPayOf(l)} />
        ))}
      </div>

      {closed.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 40, fontSize: 18 }}>
            거래 완료
          </h2>
          <div className="resale-grid">
            {closed.map((l) => (
              <ListingCard key={l.id} l={l} d={details[l.id]} me={me} />
            ))}
          </div>
        </>
      )}

      {payOf && <PayModal listing={payOf} onClose={() => setPayOf(null)} onDone={load} />}
      {buyOf && (
        <PayModal
          listing={buyOf.listing}
          firstCome
          captcha={buyOf.captcha}
          onCaptcha={(wrong) => {
            setBuyOf(null)
            setCaptchaFor({ listing: buyOf.listing, wrong, mode: 'buy' })
          }}
          onClose={() => setBuyOf(null)}
          onDone={load}
        />
      )}
      {captchaFor && (
        <EntryCaptcha
          wrong={captchaFor.wrong}
          buy={captchaFor.mode === 'buy'}
          onClose={() => setCaptchaFor(null)}
          onSubmit={(c) => {
            const cap = { captchaId: c.id, captchaAnswer: c.answer }
            if (captchaFor.mode === 'buy') {
              setBuyOf({ listing: captchaFor.listing, captcha: cap })
              setCaptchaFor(null)
            } else enter(captchaFor.listing, cap)
          }}
        />
      )}
    </>
  )
}

function ListingCard({ l, d, me, onEnter, onBuy, onPay }) {
  const firstCome = l.selectionPhase === 'FIRST_COME'
  const entries = d?.entries ?? []
  const mine = me && l.sellerUid === me.ftUid
  const myEntry = me && entries.find((e) => e.buyerUid === me.ftUid)
  const won_ = me && l.status === 'DRAWN' && l.winnerUid === me.ftUid
  const lost = me && myEntry && l.status !== 'LISTED' && l.winnerUid !== me.ftUid
  const gotIt = me && ['SETTLED', 'REISSUED'].includes(l.status) && l.winnerUid === me.ftUid

  return (
    <div className="card rcard">
      <div className="top">
        <Poster perf={{ code: l.performanceCode, title: l.performanceTitle }} />
        <div className="grow">
          <div className="spread">
            <span className="tiny muted">재판매 #{l.id}</span>
            <span className="row" style={{ gap: 6 }}>
              {l.status === 'LISTED' && (
                <span className={`badge ${firstCome ? 'warn' : 'info'}`}>
                  {firstCome ? <Zap size={12} /> : <Dices size={12} />} {firstCome ? '선착순' : '추첨'}
                </span>
              )}
              <Badge map={RESALE_STATUS} value={l.status} />
            </span>
          </div>
          <b style={{ display: 'block', marginTop: 4 }}>{l.performanceTitle}</b>
          <div className="small muted">
            {l.seat} · {dateLabel(l.startsAt)}
          </div>
        </div>
      </div>
      <div className="spread">
        <div className="prices">
          <b>{won(l.price)}</b>
          <span className="small muted">{l.fee > 0 ? `+ 수수료 ${won(l.fee)}` : '수수료 없음'}</span>
        </div>
        {firstCome && l.status === 'LISTED' ? (
          <span className="small muted">공연 임박 · 먼저 결제한 사람에게</span>
        ) : (
          <span className="small muted row" style={{ gap: 4 }}>
            <Users size={14} /> 응모 {entries.length}명
          </span>
        )}
      </div>
      {l.status === 'LISTED' &&
        (mine ? (
          <div className="badge" style={{ justifyContent: 'center', height: 40, borderRadius: 10 }}>
            내가 올린 티켓 · {firstCome ? '선착순 판매 중' : '응모 접수 중'}
          </div>
        ) : firstCome ? (
          <button className="btn primary block" onClick={onBuy}>
            <Zap size={16} /> 바로 구매
          </button>
        ) : myEntry ? (
          <button className="btn block" disabled>
            <Check size={16} /> 응모 완료 · 추첨 대기
          </button>
        ) : (
          <button className="btn primary block" onClick={onEnter}>
            응모하기
          </button>
        ))}
      {won_ && (
        <button className="btn primary block lg" onClick={onPay}>
          <PartyPopper size={18} /> 당첨! 결제하기
        </button>
      )}
      {l.status === 'DRAWN' && !won_ && <div className="small muted center">{lost ? '아쉽게도 당첨되지 않았습니다' : '당첨자 결제 대기 중'}</div>}
      {gotIt && <div className="badge good" style={{ justifyContent: 'center', height: 36 }}>내 티켓으로 재발급되었습니다</div>}
    </div>
  )
}

function PayModal({ listing, onClose, onDone, firstCome, captcha, onCaptcha }) {
  const { vendor, me } = useVendor()
  const [state, setState] = useState('ready') // ready | busy | done | failed
  const [result, setResult] = useState(null)
  const toast = useToast()

  async function pay() {
    setState('busy')
    try {
      const path = firstCome ? 'buy-now' : 'pay'
      const [res] = await Promise.all([
        api.post('ft', `/v1/resales/${listing.id}/${path}`, { buyerUid: me.ftUid, ...captcha }),
        new Promise((r) => setTimeout(r, 1200)),
      ])
      setResult(res)
      setState(res.status === 'SETTLED' ? 'done' : 'failed')
      onDone()
    } catch (e) {
      if (e.data?.captchaRequired && onCaptcha) return onCaptcha(e.data.wrong)
      toast(e.message, 'bad')
      setState('ready')
      if (firstCome) onDone()
    }
  }

  return (
    <Modal title={state === 'ready' ? (firstCome ? '재판매 티켓 바로 구매' : '재판매 티켓 결제') : null} onClose={state === 'busy' ? undefined : onClose}>
      {state === 'ready' && (
        <>
          <div className="policy" style={{ marginBottom: 18 }}>
            <div className="spread" style={{ width: '100%' }}>
              <span>티켓 가격</span>
              <b>{won(listing.price)}</b>
            </div>
            <div className="spread" style={{ width: '100%' }}>
              <span>수수료</span>
              <b>{listing.fee > 0 ? won(listing.fee) : '없음'}</b>
            </div>
            <div className="spread" style={{ width: '100%' }}>
              <span>{firstCome ? '구매 방식' : '결제 기한'}</span>
              <b>{firstCome ? '선착순 · 먼저 결제한 사람' : `당첨 후 ${listing.paymentMinutes}분`}</b>
            </div>
            <div className="spread" style={{ width: '100%', fontSize: 16 }}>
              <b>결제 금액</b>
              <b>{won(listing.price + listing.fee)}</b>
            </div>
          </div>
          <button className="btn primary lg block" onClick={pay}>
            <CreditCard size={18} /> {won(listing.price + listing.fee)} 결제하기
          </button>
          <p className="tiny muted center" style={{ marginTop: 10 }}>
            시연용 가상 결제 · 결제 후 {vendor.name}가 새 티켓을 발급합니다 · 공통 구매 한도에 포함됩니다
          </p>
        </>
      )}
      {state === 'busy' && (
        <div className="center" style={{ padding: '30px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <b>결제 확인 → 기존 티켓 무효화 → 재발급 중</b>
        </div>
      )}
      {state === 'done' && (
        <>
          <div className="result-hero">
            <div className="big-ic" style={{ background: 'var(--good-soft)', color: 'var(--good)' }}>
              <Check size={34} strokeWidth={3} />
            </div>
            <h4>새 티켓이 발급되었습니다</h4>
            <p>
              {listing.performanceTitle} · {listing.seat}
              <br />
              이전 소유자의 QR은 무효가 되었습니다.
            </p>
          </div>
          <a className="btn primary lg block" href={`/${vendor.id}/my`}>
            내 티켓 보기
          </a>
        </>
      )}
      {state === 'failed' && (
        <>
          <div className="result-hero">
            <div className="big-ic" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}>
              <Info size={32} />
            </div>
            <h4>재발급에 실패해 결제가 환불되었습니다</h4>
            <p>
              {vendor.name} 발급 시스템 오류로 거래가 완료되지 않았습니다 ({result?.status}).
              <br />
              결제 금액은 환불되고, 원래 소유자의 티켓은 복원됩니다.
            </p>
          </div>
          <button className="btn lg block" onClick={onClose}>
            확인
          </button>
        </>
      )}
    </Modal>
  )
}

function EntryCaptcha({ wrong, buy, onClose, onSubmit }) {
  const [c, setC] = useState({})
  const [key, setKey] = useState(0)
  useEffect(() => {
    if (wrong) setKey((k) => k + 1)
  }, [wrong])
  return (
    <Modal title="보안문자 확인" onClose={onClose}>
      <p className="small text-2" style={{ marginBottom: 14, lineHeight: 1.6 }}>
        {wrong
          ? '보안문자가 맞지 않습니다. 새 문제로 다시 입력해 주세요.'
          : `최근 구매 활동이 '주의' 단계로 분석되어 ${buy ? '구매' : '응모'} 전에 보안문자를 확인합니다.`}
      </p>
      <Captcha onChange={setC} reloadKey={key} />
      <button className="btn primary lg block" style={{ marginTop: 16 }} disabled={(c.answer ?? '').length !== 5} onClick={() => onSubmit(c)}>
        {buy ? '확인하고 구매하기' : '확인하고 응모하기'}
      </button>
    </Modal>
  )
}
