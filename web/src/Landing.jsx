import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ExternalLink, Moon, ScanLine, Star, LayoutDashboard } from 'lucide-react'
import { api } from './api.js'
import { usePolling } from './components/ui.jsx'
import './landing.css'

const APPS = [
  { to: '/star', name: '별티켓', desc: '가상 예매처 A · 공연 예매, 내 티켓, 공식 재판매', icon: Star, color: '#2b50ec', server: 'star' },
  { to: '/moon', name: '달티켓', desc: '가상 예매처 B · 같은 공연을 다른 구역으로 판매', icon: Moon, color: '#6d3bea', server: 'moon' },
  { to: '/admin', name: 'FairTicket 운영 콘솔', desc: '재판매 진행, 위험 신호와 근거, 입장 기록, 시연 도구', icon: LayoutDashboard, color: '#0f9d8a', server: 'ft' },
  { to: '/gate', name: '입장 검증', desc: '공연장 직원용 · 카메라로 QR 스캔', icon: ScanLine, color: '#0b0f14', server: 'ft' },
]

const SCENARIO = [
  ['운영 콘솔 → 시연 도구', '‘매크로 공격’ 후 ‘매크로봇 실제 구매 시도’ → 별티켓이 근거와 함께 구매 보류'],
  ['별티켓 · 민지', 'NEON WAVE(1인 2매) 좌석 선택 → 예매 → 내 티켓에서 QR 확인'],
  ['달티켓 · 민지', '1매 더 사면 성공(합산 2/2) → 3번째는 어느 예매처든 “공통 구매 한도 초과”'],
  ['별티켓 · 민지', '공식 재판매 신청, 가격은 정가 이하로 직접 입력 → QR이 즉시 사용 정지'],
  ['입장 검증', '민지의 QR 스캔 → “재판매 진행 중인 티켓”으로 거절'],
  ['별티켓 · 지수', '공식 재판매 탭에서 응모 → 운영 콘솔에서 추첨 실행'],
  ['별티켓 · 당첨자', '‘당첨! 결제하기’(수수료 없음) → 재발급 → 정산, 민지 한도 반환'],
  ['입장 검증', '당첨자 QR 승인 → 같은 QR 재스캔 거절 → 민지의 옛 QR 거절'],
  ['운영 콘솔 → 시연 도구', '재발급 실패 켜고 재판매 반복 → 환불과 원 구매자 권한 복원'],
]

export default function Landing() {
  const [up, setUp] = useState({})
  useEffect(() => {
    document.title = 'FairTicket 시연'
  }, [])
  usePolling(async () => {
    const check = async (base, path) => {
      try {
        await api.get(base, path)
        return true
      } catch {
        return false
      }
    }
    const [ft, star, moon] = await Promise.all([check('ft', '/v1/demo/fail-reissue'), check('star', '/api/info'), check('moon', '/api/info')])
    setUp({ ft, star, moon })
  }, 4000)

  return (
    <div className="landing">
      <header className="l-hero">
        <div className="l-badge">
          <Activity size={14} /> CodeTree × 한성대 IT공과대학 오픈 이노베이션 공모전
        </div>
        <h1>
          기존 예매처는 그대로,
          <br />더 안전한 티켓 예매와 유통은 <span>FairTicket</span>으로
        </h1>
        <p>
          여러 예매처를 연결해 부정구매 위험을 함께 분석하고, 공식 재판매와 입장 검증을 지원합니다. 티켓 발급·무효화·재발급 권한은 예매처가 유지하고 FairTicket은 절차를 연결합니다.
        </p>
        <div className="l-status">
          {[['ft', 'FairTicket 8080'], ['star', '별티켓 8081'], ['moon', '달티켓 8082']].map(([k, label]) => (
            <span key={k} className={`l-dot ${up[k] === undefined ? '' : up[k] ? 'on' : 'off'}`}>
              <i /> {label}
            </span>
          ))}
        </div>
      </header>

      <section className="l-apps">
        {APPS.map((a) => (
          <div key={a.to} className="l-app">
            <span className="l-ic" style={{ background: a.color }}>
              <a.icon size={22} color="#fff" />
            </span>
            <h3>{a.name}</h3>
            <p>{a.desc}</p>
            <div className="row" style={{ marginTop: 'auto' }}>
              <Link className="btn primary sm" to={a.to} style={{ background: a.color, borderColor: a.color }}>
                열기
              </Link>
              <a className="btn sm" href={a.to} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> 새 창
              </a>
            </div>
          </div>
        ))}
      </section>

      <section className="l-scenario">
        <h2>시연 순서</h2>
        <p className="small muted" style={{ marginBottom: 16 }}>
          화면 네 개를 새 창으로 나란히 띄우면 흐름이 잘 보입니다. 서버를 다시 켜면 데이터가 초기화됩니다.
        </p>
        <ol>
          {SCENARIO.map(([where, what], i) => (
            <li key={i}>
              <span className="n">{i + 1}</span>
              <div>
                <b>{where}</b>
                <div className="text-2 small">{what}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
