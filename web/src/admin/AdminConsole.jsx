import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, LayoutDashboard, Repeat, ScanLine, ShieldAlert, Wrench, XCircle, Zap, Users, Bot,
  Gauge, SearchCheck, Building2,
} from 'lucide-react'
import { api, VENDORS } from '../api.js'
import { Badge, RESALE_STATUS, RISK, ResaleStepper, timeLabel, usePolling, useToast, won } from '../components/ui.jsx'
import { runTraffic } from './traffic.js'
import ReviewTab from './ReviewTab.jsx'
import './admin.css'

const ACTIVE = ['RESALE_PENDING', 'LISTED', 'DRAWN', 'PAID', 'REISSUED']
const vname = (id) => VENDORS[id]?.name ?? id

export default function AdminConsole() {
  const [tab, setTab] = useState('dash')
  const [resales, setResales] = useState([])
  const [risks, setRisks] = useState([])
  const [logs, setLogs] = useState([])
  const [quota, setQuota] = useState([])
  const [failReissue, setFailReissue] = useState(false)
  const [offline, setOffline] = useState(false)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    document.title = 'FairTicket 관리자'
  }, [])

  usePolling(async () => {
    try {
      const [rs, rk, lg, fr, qt] = await Promise.all([
        api.get('ft', '/v1/resales'),
        api.get('ft', '/v1/risk/overview'),
        api.get('ft', '/v1/verify/logs'),
        api.get('ft', '/v1/demo/fail-reissue'),
        api.get('ft', '/v1/quota/recent'),
      ])
      setQuota(qt)
      setResales(rs)
      setRisks(rk)
      setLogs(lg)
      setFailReissue(fr.enabled)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, 2000)

  const high = risks.filter((r) => r.riskLevel === 'HIGH')
  const active = resales.filter((r) => ACTIVE.includes(r.status))
  const admitted = logs.filter((l) => l.result === 'ADMITTED').length

  const nav = [
    ['dash', '대시보드', LayoutDashboard, null],
    ['resale', '재판매 진행', Repeat, active.length],
    ['risk', '위험 신호', ShieldAlert, high.length, high.length > 0],
    ['review', '사후 검토', SearchCheck, null],
    ['quota', '공통 구매 한도', Gauge, null],
    ['verify', '입장 검증 기록', ScanLine, logs.length],
    ['tools', '시연 도구', Wrench, failReissue ? '!' : null, failReissue],
  ]

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-logo">
          <span className="mk">
            <Activity size={18} color="#fff" />
          </span>
          <div>
            FairTicket
            <small>운영 콘솔</small>
          </div>
        </div>
        {nav.map(([k, label, Icon, cnt, hot]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon size={17} /> {label}
            {cnt ? <span className={`cnt ${hot ? 'hot' : ''}`}>{cnt}</span> : null}
          </button>
        ))}
        <div className="foot">
          연동 예매처
          <br />
          별티켓 · 달티켓
          <br />
          FairTicket은 티켓과 대금을 보유하지 않습니다.
        </div>
      </aside>

      <main className="adm-main">
        {offline && <div className="toast bad" style={{ position: 'static', marginBottom: 16, maxWidth: 'none' }}>FairTicket 서버(8080)에 연결할 수 없습니다</div>}

        {tab === 'dash' && (
          <>
            <h1>대시보드</h1>
            <div className="kpis">
              <Kpi icon={Repeat} label="진행 중인 재판매" value={active.length} sub={`전체 ${resales.length}건`} />
              <Kpi icon={CheckCircle2} label="거래 완료 · 정산" value={resales.filter((r) => r.status === 'SETTLED').length} sub="재발급 후 정산까지 완료" />
              <Kpi icon={ShieldAlert} label="고위험 신호" value={high.length} sub={`최근 1시간 분석 대상 ${risks.length}명`} tone={high.length ? 'var(--bad)' : undefined} />
              <Kpi icon={ScanLine} label="입장 승인 / 거절" value={`${admitted} / ${logs.length - admitted}`} sub="최근 50건" />
            </div>
            <div className="split">
              <ResaleTable resales={resales.slice(0, 6)} selected={selected} onSelect={(id) => { setSelected(id); setTab('resale') }} title="최근 재판매" />
              <RiskTable risks={risks.slice(0, 5)} compact />
            </div>
          </>
        )}

        {tab === 'resale' && (
          <>
            <h1>재판매 진행</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              건을 선택하면 단계별 이력과 응모자를 볼 수 있습니다. 추첨과 결제 기한 처리는 시연을 위해 버튼으로 실행합니다.
            </p>
            <div className="split">
              <ResaleTable resales={resales} selected={selected} onSelect={setSelected} title={`전체 ${resales.length}건`} />
              <ResaleDetail id={selected} />
            </div>
          </>
        )}

        {tab === 'risk' && (
          <>
            <h1>위험 신호</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              여러 예매처의 구매 시도를 함께 분석한 결과입니다. 부정사용자 확정이 아닌 신호와 근거이며, 허용·추가 인증·보류는 각 예매처가 결정합니다.
            </p>
            <RiskTable risks={risks} />
          </>
        )}

        {tab === 'review' && <ReviewTab />}

        {tab === 'quota' && (
          <>
            <h1>공통 구매 한도</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              별티켓·달티켓의 구매를 사람·공연 단위로 합산합니다. 한도 값은 발행처가 정하고, 예매처마다 다르면 작은 값을 씁니다. 결제 전 예약은 예매처의 결제 제한 시간이 지나면 자동 반환됩니다.
            </p>
            <QuotaTable rows={quota} />
          </>
        )}

        {tab === 'verify' && (
          <>
            <h1>입장 검증 기록</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              입장 판단 기준은 발행처의 최신 기록입니다. FairTicket은 요청을 해당 발행처로 연결하고 결과를 남깁니다.
            </p>
            <VerifyTable logs={logs} />
          </>
        )}

        {tab === 'tools' && <Tools failReissue={failReissue} setFailReissue={setFailReissue} />}
      </main>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="card kpi">
      <div className="k">
        <Icon size={15} /> {label}
      </div>
      <div className="v" style={{ color: tone }}>
        {value}
      </div>
      <div className="s">{sub}</div>
    </div>
  )
}

function ResaleTable({ resales, selected, onSelect, title }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="panel-h">
        <h2>{title}</h2>
      </div>
      {resales.length === 0 ? (
        <div className="empty">아직 재판매 신청이 없습니다</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>공연 · 좌석</th>
              <th>판매자 → 당첨자</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {resales.map((r) => (
              <tr key={r.id} className={`click ${selected === r.id ? 'sel' : ''}`} onClick={() => onSelect(r.id)}>
                <td className="muted">{r.id}</td>
                <td>
                  <b>{r.performanceTitle ?? r.performanceCode}</b>
                  <div className="tiny muted">
                    {vname(r.vendorId)} · {r.seat ?? `티켓 ${r.vendorTicketId}`}
                  </div>
                </td>
                <td className="mono small">
                  {r.sellerUid} → {r.winnerUid ?? '…'}
                </td>
                <td>
                  <Badge map={RESALE_STATUS} value={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ResaleDetail({ id }) {
  const [d, setD] = useState(null)
  const toast = useToast()
  usePolling(async () => {
    if (!id) return setD(null)
    try {
      setD(await api.get('ft', `/v1/resales/${id}`))
    } catch {
      /* 무시 */
    }
  }, 1500, [id])

  if (!id || !d) return <div className="card empty">왼쪽에서 재판매 건을 선택하세요</div>
  const l = d.listing
  const act = async (fn, msg) => {
    try {
      await fn()
      toast(msg, 'good')
    } catch (e) {
      toast(e.message, 'bad')
    }
  }
  const tone = (s) => (['REISSUE_FAILED'].includes(s) ? 'bad' : ['CANCELLED', 'EXPIRED'].includes(s) ? 'mut' : '')

  return (
    <div className="card">
      <div className="panel-h">
        <h2>재판매 #{l.id}</h2>
        <span className="row" style={{ gap: 6 }}>
          {l.status === 'LISTED' && <span className={`badge ${l.selectionPhase === 'FIRST_COME' ? 'warn' : 'info'}`}>{l.selectionPhase === 'FIRST_COME' ? '선착순' : '추첨'}</span>}
          <Badge map={RESALE_STATUS} value={l.status} />
        </span>
      </div>
      <div style={{ padding: 18, display: 'grid', gap: 18 }}>
        <div>
          <b>{l.performanceTitle}</b>
          <div className="small muted">
            {vname(l.vendorId)} · {l.seat} · {won(l.price)} · 수수료 {l.fee > 0 ? won(l.fee) : '없음'}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {l.lotteryCloseAt ? `추첨 마감 ${l.lotteryCloseAt.replace('T', ' ').slice(0, 16)} · ` : ''}판매 종료 {l.saleCloseAt?.replace('T', ' ').slice(0, 16)} · 결제 기한 {l.paymentMinutes}분
            {l.paymentDeadline && l.status === 'DRAWN' ? ` (마감 ${timeLabel(l.paymentDeadline)})` : ''}
          </div>
        </div>
        <ResaleStepper status={l.status} />
        <div className="row wrap">
          <button className="btn sm dark" disabled={l.status !== 'LISTED' || l.selectionPhase === 'FIRST_COME'} title="응모자가 없으면 선착순으로 넘어갑니다" onClick={() => act(() => api.post('ft', `/v1/resales/${l.id}/draw`), '추첨 마감을 처리했습니다')}>
            추첨 마감 (실행)
          </button>
          <button className="btn sm" disabled={l.status !== 'DRAWN'} onClick={() => act(() => api.post('ft', `/v1/resales/${l.id}/forfeit`), '차순위로 넘겼습니다')}>
            결제 기한 초과 처리
          </button>
          <button className="btn sm" disabled={!['RESALE_PENDING', 'LISTED'].includes(l.status)} onClick={() => act(() => api.del('ft', `/v1/resales/${l.id}`), '취소하고 권한을 복원했습니다')}>
            판매 취소
          </button>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 10, fontWeight: 600 }}>
            진행 이력
          </div>
          <ul className="tl">
            {d.history.map((h) => (
              <li key={h.id}>
                <span className={`d ${tone(h.toStatus)}`} />
                <div className="spread">
                  <b>{RESALE_STATUS[h.toStatus]?.label ?? h.toStatus}</b>
                  <span className="tiny muted mono">{timeLabel(h.at)}</span>
                </div>
                <p>{h.note}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 8, fontWeight: 600 }}>
            응모자 {d.entries.length}명
          </div>
          {d.entries.length === 0 ? (
            <div className="small muted">아직 응모자가 없습니다</div>
          ) : (
            <table className="tbl">
              <tbody>
                {d.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="mono small">{e.buyerUid}</td>
                    <td>
                      <Badge map={RISK} value={e.riskLevel} />
                    </td>
                    <td className="small">{e.drawRank ? `${e.drawRank}순위` : '추첨 전'}</td>
                    <td className="small">{e.forfeited ? <span className="badge bad">자격 상실</span> : e.buyerUid === l.winnerUid ? <span className="badge good">당첨</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function RiskTable({ risks, compact }) {
  const color = (s) => (s >= 70 ? 'var(--bad)' : s >= 40 ? 'var(--warn)' : 'var(--good)')
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="panel-h">
        <h2>{compact ? '위험 신호 상위' : '최근 1시간 분석 결과'}</h2>
        <span className="tiny muted">0~39 정상 · 40~69 주의 · 70+ 고위험</span>
      </div>
      {risks.length === 0 ? (
        <div className="empty">분석된 구매 시도가 없습니다. 시연 도구에서 트래픽을 만들어 보세요.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>사용자</th>
              <th>등급</th>
              <th>점수</th>
              {!compact && <th>판단 근거</th>}
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr key={r.uid + r.performanceCode}>
                <td>
                  <span className="mono">{r.uid}</span>
                  <div className="tiny muted">{r.performanceCode}</div>
                </td>
                <td>
                  <Badge map={RISK} value={r.riskLevel} />
                </td>
                <td>
                  <div className="row">
                    <b style={{ width: 28 }}>{r.score}</b>
                    <div className="scorebar">
                      <i style={{ width: `${r.score}%`, background: color(r.score) }} />
                    </div>
                  </div>
                </td>
                {!compact && (
                  <td>
                    {r.reasons.length === 0 ? (
                      <span className="small muted">특이 사항 없음</span>
                    ) : (
                      r.reasons.map((x) => (
                        <span key={x.rule} className="chip-reason">
                          <b>+{x.points}</b> {x.detail}
                        </span>
                      ))
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const QUOTA_STATUS = {
  HELD: { label: '결제 대기 (예약)', tone: 'warn' },
  CONFIRMED: { label: '확정', tone: 'good' },
  RELEASED: { label: '반환', tone: '' },
}

function QuotaTable({ rows }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {rows.length === 0 ? (
        <div className="empty">아직 한도 기록이 없습니다. 예매처에서 티켓을 사 보세요.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>시각</th>
              <th>사용자</th>
              <th>공연</th>
              <th>예매처</th>
              <th>경로</th>
              <th>상태</th>
              <th>티켓</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td className="mono small">{timeLabel(q.createdAt)}</td>
                <td className="mono">{q.uid}</td>
                <td className="small">{q.performanceCode}</td>
                <td>{vname(q.vendorId)}</td>
                <td className="small">{q.source === 'RESALE' ? '공식 재판매' : '일반 구매'}</td>
                <td>
                  <Badge map={QUOTA_STATUS} value={q.status} />
                </td>
                <td className="mono small">{q.ref ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const VERIFY_LABEL = {
  ADMITTED: '입장 승인',
  ALREADY_USED: '이미 사용됨',
  RESALE_LOCKED: '재판매 중',
  OUTDATED_VERSION: '재발급으로 무효',
  VOIDED: '무효 티켓',
  INVALID_SIGNATURE: '위조 의심',
  WRONG_VENDOR: '발행처 불일치',
  NOT_FOUND: '없는 티켓',
  MALFORMED: '형식 오류',
  UNKNOWN_VENDOR: '미연동 발행처',
}

function VerifyTable({ logs }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {logs.length === 0 ? (
        <div className="empty">아직 입장 검증 기록이 없습니다</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>시각</th>
              <th>발행처</th>
              <th>티켓</th>
              <th>게이트</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((g) => (
              <tr key={g.id}>
                <td className="mono small">{timeLabel(g.scannedAt)}</td>
                <td>{g.vendorId ? vname(g.vendorId) : '-'}</td>
                <td className="mono small">{g.ticketRef ?? '-'}</td>
                <td>{g.gate}</td>
                <td>
                  <span className={`badge ${g.result === 'ADMITTED' ? 'good' : 'bad'}`}>
                    {g.result === 'ADMITTED' ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {VERIFY_LABEL[g.result] ?? g.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Tools({ failReissue, setFailReissue }) {
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)
  const [loseResp, setLoseResp] = useState(false)
  const toast = useToast()

  usePolling(async () => {
    const r = await api.get('ft', '/v1/demo/lose-reissue-response')
    setLoseResp(r.enabled)
  }, 3000)

  async function toggleLose() {
    try {
      const r = await api.post('ft', '/v1/demo/lose-reissue-response', { enabled: !loseResp })
      setLoseResp(r.enabled)
      toast(r.enabled ? '다음 재발급 1회의 응답이 사라집니다' : '응답 유실을 껐습니다', r.enabled ? 'bad' : 'good')
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  async function toggle() {
    try {
      const r = await api.post('ft', '/v1/demo/fail-reissue', { enabled: !failReissue })
      setFailReissue(r.enabled)
      toast(r.enabled ? '이제 재발급이 실패합니다 (예외 흐름 시연)' : '재발급이 정상 동작합니다', r.enabled ? 'bad' : 'good')
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  async function run(kind) {
    setBusy(true)
    setLog('')
    try {
      await runTraffic(kind, (line) => setLog((s) => s + line + '\n'))
    } catch (e) {
      setLog((s) => s + '오류: ' + e.message + '\n')
    }
    setBusy(false)
  }

  return (
    <>
      <h1>시연 도구</h1>
      <p className="small muted" style={{ margin: '6px 0 20px' }}>
        발표·영상 촬영용 기능입니다. 실제 서비스에는 없습니다.
      </p>
      <div className="split">
        <div className="col" style={{ gap: 18 }}>
          <div className="card tool">
            <h3>
              <Zap size={18} /> 구매 트래픽 만들기
            </h3>
            <p>정해진 패턴의 구매 시도를 FairTicket에 보냅니다. 결과는 위험 신호·사후 검토 탭에서 확인합니다. 등급별 조치: 정상 허용, 주의 보안문자, 고위험 보류(보안문자 + 본인인증).</p>
            <div className="row wrap">
              <button className="btn" disabled={busy} onClick={() => run('normal')}>
                <Users size={16} /> 정상 사용자
              </button>
              <button className="btn" disabled={busy} onClick={() => run('pcbang')}>
                <Building2 size={16} /> PC방 (공용 IP)
              </button>
              <button className="btn danger" disabled={busy} onClick={() => run('macro')}>
                <Bot size={16} /> 매크로 공격
              </button>
              <button className="btn danger" disabled={busy} onClick={() => run('ring')}>
                분산 매크로 (계정 묶음)
              </button>
              <button className="btn dark" disabled={busy} onClick={() => run('buy')}>
                매크로봇 실제 구매 시도
              </button>
            </div>
            {log && <div className="log">{log}</div>}
          </div>
        </div>
        <div className="card tool">
          <div className="spread">
            <h3>
              <AlertTriangle size={18} /> 재발급 실패 시키기
            </h3>
            <button className={`switch ${failReissue ? 'on' : ''}`} onClick={toggle} aria-label="재발급 실패 스위치" />
          </div>
          <p>
            켜면 당첨자가 결제한 뒤 발행처 재발급이 3번 실패하도록 만듭니다. 이때 새 구매자에게 환불하고 원 구매자의 티켓 사용 권한을 복원하는 예외 흐름을 보여줄 수 있습니다.
          </p>
          {failReissue && <span className="badge bad">켜짐 · 다음 결제부터 재발급 실패</span>}
          <div className="spread" style={{ marginTop: 22 }}>
            <h3>
              <AlertTriangle size={18} /> 재발급 응답 유실
            </h3>
            <button className={`switch ${loseResp ? 'on' : ''}`} onClick={toggleLose} aria-label="재발급 응답 유실 스위치" />
          </div>
          <p>
            켜면 다음 재발급 1회는 발행처가 처리했는데 응답이 네트워크에서 사라진 상황이 됩니다. FairTicket은 같은 멱등키로 다시 요청하고, 발행처는 다시 처리하지 않고 저장된 결과를 돌려줍니다. 재판매 진행 기록에서 중복 발급 없이 끝나는 것을 확인할 수 있습니다.
          </p>
          {loseResp && <span className="badge bad">켜짐 · 다음 재발급 1회 응답 유실</span>}
        </div>
      </div>
    </>
  )
}
