import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

/* ---------- 포맷 ---------- */
export const won = (n) => (n ?? 0).toLocaleString('ko-KR') + '원'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
export function dateLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${DAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const timeLabel = (iso) => (iso ? iso.slice(11, 19) : '')

/* ---------- 모달 ---------- */
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            {onClose && (
              <button className="btn ghost sm" onClick={onClose} aria-label="닫기">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- 토스트 ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const seq = useRef(0)
  const push = useCallback((text, tone = '') => {
    const id = ++seq.current
    setItems((xs) => [...xs, { id, text, tone }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- 폴링 ---------- */
/** fn 을 바로 한 번, 이후 ms 마다 실행. deps 가 바뀌면 즉시 다시 시작한다. */
export function usePolling(fn, ms = 2500, deps = []) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let alive = true
    const tick = () => alive && ref.current()
    tick()
    const t = setInterval(tick, ms)
    return () => {
      alive = false
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}

/* ---------- 포스터 (공연 코드별 생성 이미지) ---------- */
const POSTERS = {
  'PERF-001': { bg: 'linear-gradient(150deg,#0f0c29 0%,#302b63 55%,#ff2e88 130%)', a: '#ff2e88', b: '#22d3ee' },
  'PERF-002': { bg: 'linear-gradient(160deg,#1e1b4b 0%,#3b2a7a 50%,#f6c453 140%)', a: '#f6c453', b: '#a78bfa' },
  'PERF-003': { bg: 'linear-gradient(160deg,#04111f 0%,#0c3b5c 60%,#7dd3fc 150%)', a: '#7dd3fc', b: '#1d4ed8' },
  'PERF-004': { bg: 'linear-gradient(150deg,#ff7a18 0%,#ff3d54 60%,#7a1fa2 130%)', a: '#ffe259', b: '#ff3d54' },
  'PERF-005': { bg: 'linear-gradient(155deg,#1a2e1a 0%,#2f5d3a 55%,#f4a261 140%)', a: '#f4a261', b: '#a7f3d0' },
}
export function Poster({ perf, large }) {
  const p = POSTERS[perf.code ?? perf.performanceCode] ?? POSTERS['PERF-001']
  return (
    <div className={`poster ${large ? 'lg' : ''}`} style={{ background: p.bg }}>
      <div className="p-shape" style={{ width: '70%', height: '52%', right: '-18%', top: '-8%', background: p.a, opacity: 0.55 }} />
      <div className="p-shape" style={{ width: '46%', height: '34%', left: '-12%', top: '34%', background: p.b, opacity: 0.45 }} />
      <div className="p-genre">{perf.genre ?? 'LIVE'}</div>
      <div>
        <div className="p-title">{perf.title ?? perf.performanceTitle}</div>
        <div className="p-artist">{perf.artist}</div>
      </div>
    </div>
  )
}

/* ---------- 상태 이름 ---------- */
export const TICKET_STATUS = {
  VALID: { label: '사용 가능', tone: 'good' },
  LOCKED: { label: '재판매 진행 중', tone: 'warn' },
  USED: { label: '입장 완료', tone: 'info' },
  VOID: { label: '무효', tone: 'bad' },
  FRAUD_CANCELLED: { label: '부정 구매로 취소', tone: 'bad' },
}

export const RESALE_STATUS = {
  RESALE_PENDING: { label: '승인 대기', tone: 'warn' },
  LISTED: { label: '판매 중', tone: 'info' },
  DRAWN: { label: '당첨 · 결제 대기', tone: 'warn' },
  PAID: { label: '결제 완료', tone: 'info' },
  REISSUED: { label: '재발급 완료', tone: 'info' },
  SETTLED: { label: '거래 완료 · 정산됨', tone: 'good' },
  CANCELLED: { label: '취소됨', tone: '' },
  EXPIRED: { label: '판매 종료', tone: '' },
  REISSUE_FAILED: { label: '재발급 실패 · 환불됨', tone: 'bad' },
}

export const RISK = {
  LOW: { label: '정상', tone: 'good' },
  MEDIUM: { label: '주의', tone: 'warn' },
  HIGH: { label: '고위험', tone: 'bad' },
}

export function Badge({ map, value, children }) {
  const m = map?.[value] ?? { label: value, tone: '' }
  return <span className={`badge ${m.tone}`}>{children ?? m.label}</span>
}

/* ---------- 재판매 진행 단계 ---------- */
const STEPS = [
  ['RESALE_PENDING', '신청'],
  ['LISTED', '승인·판매'],
  ['DRAWN', '추첨'],
  ['PAID', '결제'],
  ['REISSUED', '재발급'],
  ['SETTLED', '정산'],
]
export function ResaleStepper({ status }) {
  const failed = status === 'REISSUE_FAILED'
  const idx = failed ? 3 : STEPS.findIndex(([s]) => s === status)
  if (idx < 0) return <Badge map={RESALE_STATUS} value={status} />
  return (
    <div className={`stepper ${failed ? 'failed' : ''}`}>
      {STEPS.map(([s, label], i) => {
        const done = i < idx || (i === idx && status === 'SETTLED')
        const now = i === idx && status !== 'SETTLED'
        return (
          <div key={s} className={`step ${done ? 'done' : ''} ${now ? 'now' : ''}`}>
            <div className="dot">{done ? <Check size={12} strokeWidth={3} /> : failed && now ? <X size={12} strokeWidth={3} /> : null}</div>
            {failed && now ? '실패' : label}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 아바타 ---------- */
const AVATAR = { 'ft-u-001': '#f97316', 'ft-u-002': '#10b981', 'ft-u-003': '#6366f1', 'ft-u-004': '#0ea5e9', 'ft-u-005': '#e11d48', 'ft-u-bot': '#64748b' }
export function Avatar({ member, size = 32 }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', flex: 'none',
        background: AVATAR[member?.ftUid] ?? '#94a3b8', color: '#fff', fontWeight: 800, fontSize: size * 0.42,
      }}
    >
      {member?.name?.[0] ?? '?'}
    </span>
  )
}

/* ---------- 회원 이름 (관리자 화면용) ----------
 * FairTicket 은 공통 ID(ft-u-…)만 갖고 이름은 모른다. 시연 화면에서 알아보기 쉽게
 * 예매처 회원 목록에서 이름을 찾아 "이름 (ID)" 로 보여 준다. 처음 한 번만 불러와 공유한다. */
let namesCache = null
let namesLoading = null
function loadNames() {
  if (!namesLoading) {
    namesLoading = Promise.all(
      ['star', 'moon'].map((v) =>
        fetch(`/proxy/${v}/api/members`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    ).then((lists) => {
      namesCache = Object.fromEntries(lists.flat().map((m) => [m.ftUid, m.name]))
      return namesCache
    })
  }
  return namesLoading
}

export function useMemberNames() {
  const [names, setNames] = useState(namesCache ?? {})
  useEffect(() => {
    if (!namesCache) loadNames().then(setNames)
  }, [])
  const withNames = useCallback(
    (text) => (text ?? '').replace(/ft-u-[\w-]+/g, (u) => (names[u] ? `${names[u]}(${u})` : u)),
    [names],
  )
  return { names, withNames }
}

/** 공통 ID 옆에 이름을 같이 보여 준다: 하늘 ft-u-004 */
export function Who({ uid, fallback = '…' }) {
  const { names } = useMemberNames()
  if (!uid) return <span className="muted">{fallback}</span>
  return (
    <span className="who">
      {names[uid] && <b>{names[uid]}</b>} <span className="mono tiny muted">{uid}</span>
    </span>
  )
}
