import { useState } from 'react'
import { AlertTriangle, Zap, Users, Bot, Building2 } from 'lucide-react'
import { api } from '../api.js'
import { usePolling, useToast } from '../components/ui.jsx'
import { runTraffic } from './traffic.js'

export function Tools({ failReissue, setFailReissue }) {
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
      toast(
        r.enabled ? '다음 재발급 1회의 응답이 사라집니다' : '응답 유실을 껐습니다',
        r.enabled ? 'bad' : 'good',
      )
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  async function toggle() {
    try {
      const r = await api.post('ft', '/v1/demo/fail-reissue', { enabled: !failReissue })
      setFailReissue(r.enabled)
      toast(
        r.enabled ? '이제 재발급이 실패합니다 (예외 흐름 시연)' : '재발급이 정상 동작합니다',
        r.enabled ? 'bad' : 'good',
      )
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
            <p className="lines">
              <span>정해진 패턴의 구매 시도를 eTicket에 보냅니다.</span>
              <span>결과는 위험 신호·사후 검토 탭에서 확인합니다.</span>
              <span>등급별 조치: 정상 허용 · 주의 보안문자 · 고위험 보류(보안문자 + 본인인증)</span>
            </p>
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
              <button className="btn danger" disabled={busy} onClick={() => run('vpn')}>
                VPN·데이터센터 접속
              </button>
              <button className="btn danger" disabled={busy} onClick={() => run('split')}>
                분산 매크로 (사이트별 비교)
              </button>
              <button className="btn danger" disabled={busy} onClick={() => run('ring')}>
                계정 묶음 (IP 돌려쓰기)
              </button>
              <button className="btn dark" disabled={busy} onClick={() => run('buy')}>
                매크로봇 실제 구매 시도
              </button>
              <button className="btn danger" disabled={busy} onClick={() => run('scalper')}>
                암표상 실제 구매 (사후 검토용)
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
            <button
              className={`switch ${failReissue ? 'on' : ''}`}
              onClick={toggle}
              aria-label="재발급 실패 스위치"
            />
          </div>
          <p className="lines">
            <span>켜면 당첨자가 결제한 뒤 발행처 재발급이 3번 실패합니다.</span>
            <span>새 구매자 환불과 원 구매자 권한 복원 흐름을 볼 수 있습니다.</span>
          </p>
          {failReissue && <span className="badge bad">켜짐 · 다음 결제부터 재발급 실패</span>}
          <div className="spread" style={{ marginTop: 22 }}>
            <h3>
              <AlertTriangle size={18} /> 재발급 응답 유실
            </h3>
            <button
              className={`switch ${loseResp ? 'on' : ''}`}
              onClick={toggleLose}
              aria-label="재발급 응답 유실 스위치"
            />
          </div>
          <p className="lines">
            <span>켜면 다음 재발급 1회의 응답이 네트워크에서 사라집니다.</span>
            <span>eTicket은 같은 멱등키로 다시 요청하고,</span>
            <span>발행처는 다시 처리하지 않고 저장된 결과를 돌려줍니다.</span>
            <span>재판매 진행 기록에서 중복 발급이 없는지 확인하세요.</span>
          </p>
          {loseResp && <span className="badge bad">켜짐 · 다음 재발급 1회 응답 유실</span>}
        </div>
      </div>
    </>
  )
}
