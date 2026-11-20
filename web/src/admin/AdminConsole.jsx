import { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  LayoutDashboard,
  Repeat,
  ScanLine,
  ShieldAlert,
  Wrench,
  Gauge,
  SearchCheck,
} from 'lucide-react'
import { api } from '../api.js'
import { usePolling } from '../components/ui.jsx'
import ReviewTab from './ReviewTab.jsx'
import { ResaleTable, ResaleDetail } from './ResalePanels.jsx'
import { RiskTable } from './RiskTable.jsx'
import { QuotaTable } from './QuotaTable.jsx'
import { VerifyTable } from './VerifyTable.jsx'
import { Tools } from './DemoTools.jsx'
import './admin.css'

const ACTIVE = ['RESALE_PENDING', 'LISTED', 'DRAWN', 'PAID', 'REISSUED']

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
    document.title = 'eTicket 관리자'
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
            eTicket
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
          eTicket은 티켓과 대금을 보유하지 않습니다.
        </div>
      </aside>

      <main className="adm-main">
        {offline && (
          <div
            className="toast bad"
            style={{ position: 'static', marginBottom: 16, maxWidth: 'none' }}
          >
            eTicket 서버(8080)에 연결할 수 없습니다
          </div>
        )}

        {tab === 'dash' && (
          <>
            <h1>대시보드</h1>
            <div className="kpis">
              <Kpi
                icon={Repeat}
                label="진행 중인 재판매"
                value={active.length}
                sub={`전체 ${resales.length}건`}
              />
              <Kpi
                icon={CheckCircle2}
                label="거래 완료 · 정산"
                value={resales.filter((r) => r.status === 'SETTLED').length}
                sub="재발급 후 정산까지 완료"
              />
              <Kpi
                icon={ShieldAlert}
                label="고위험 신호"
                value={high.length}
                sub={`최근 1시간 분석 대상 ${risks.length}명`}
                tone={high.length ? 'var(--bad)' : undefined}
              />
              <Kpi
                icon={ScanLine}
                label="입장 승인 / 거절"
                value={`${admitted} / ${logs.length - admitted}`}
                sub="최근 50건"
              />
            </div>
            <div className="split">
              <ResaleTable
                resales={resales.slice(0, 6)}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id)
                  setTab('resale')
                }}
                title="최근 재판매"
              />
              <RiskTable risks={risks.slice(0, 5)} compact />
            </div>
          </>
        )}

        {tab === 'resale' && (
          <>
            <h1>재판매 진행</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              건을 선택하면 단계별 이력과 응모자를 볼 수 있습니다. 추첨과 결제 기한 처리는 시연을
              위해 버튼으로 실행합니다.
            </p>
            <div className="split">
              <ResaleTable
                resales={resales}
                selected={selected}
                onSelect={setSelected}
                title={`전체 ${resales.length}건`}
              />
              <ResaleDetail id={selected} />
            </div>
          </>
        )}

        {tab === 'risk' && (
          <>
            <h1>위험 신호</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              여러 예매처의 구매 시도를 함께 분석한 결과입니다. 부정사용자 확정이 아닌 신호와
              근거이며, 허용·추가 인증·보류는 각 예매처가 결정합니다.
            </p>
            <RiskTable risks={risks} />
          </>
        )}

        {tab === 'review' && <ReviewTab />}

        {tab === 'quota' && (
          <>
            <h1>공통 구매 한도</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              별티켓·달티켓의 구매를 사람·공연 단위로 합산합니다. 한도 값은 발행처가 정하고,
              예매처마다 다르면 작은 값을 씁니다. 결제 전 예약은 예매처의 결제 제한 시간이 지나면
              자동 반환됩니다.
            </p>
            <QuotaTable rows={quota} />
          </>
        )}

        {tab === 'verify' && (
          <>
            <h1>입장 검증 기록</h1>
            <p className="small muted" style={{ margin: '6px 0 20px' }}>
              입장 판단 기준은 발행처의 최신 기록입니다. eTicket은 요청을 해당 발행처로 연결하고
              결과를 남깁니다.
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
