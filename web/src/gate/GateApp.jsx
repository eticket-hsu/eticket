import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, CheckCircle2, ScanLine, XCircle, Activity, IdCard } from 'lucide-react'
import { api } from '../api.js'
import './gate.css'

const READER_ID = 'qr-reader'

/**
 * 공연장 입장 직원용 앱.
 * 카메라로 QR 을 읽거나 내용을 붙여넣어 확인한다. 어느 예매처 티켓이든 같은 화면에서 처리한다.
 */
export default function GateApp() {
  const [gate, setGate] = useState('A')
  const [camOn, setCamOn] = useState(false)
  const [camError, setCamError] = useState(null)
  const [manual, setManual] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const scanner = useRef(null)
  const lastScan = useRef({ text: '', at: 0 })
  const busy = useRef(false)
  const resultTimer = useRef(null)

  useEffect(() => {
    document.title = 'FairTicket 입장 검증'
    return () => {
      stopCamera()
      clearTimeout(resultTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verify(qr) {
    const text = qr.trim()
    if (!text || busy.current) return
    busy.current = true
    let r
    try {
      r = await api.post('ft', '/v1/verify', { qr: text, gate })
    } catch (e) {
      r = { admitted: false, result: 'ERROR', message: e.message }
    }
    busy.current = false
    const ref = text.split('.')[0]
    setResult({ ...r, ref })
    setHistory((h) => [{ ...r, ref, at: new Date().toLocaleTimeString('ko-KR') }, ...h].slice(0, 30))
    clearTimeout(resultTimer.current)
    // 신분증 확인은 직원이 읽고 확인할 시간이 필요하므로 더 오래 띄운다
    resultTimer.current = setTimeout(() => setResult(null), r?.idCheck ? 8000 : 2600)
  }

  async function startCamera() {
    setCamError(null)
    try {
      const s = new Html5Qrcode(READER_ID, { verbose: false })
      scanner.current = s
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.56, height: Math.min(w, h) * 0.56 }) },
        (text) => {
          const now = Date.now()
          // 같은 QR 이 계속 비치면 3초에 한 번만 확인
          if (text === lastScan.current.text && now - lastScan.current.at < 3000) return
          lastScan.current = { text, at: now }
          verify(text)
        },
        () => {},
      )
      setCamOn(true)
    } catch (e) {
      setCamError('카메라를 열 수 없습니다. 브라우저의 카메라 권한을 확인하거나 아래에 QR 내용을 붙여넣으세요.')
      scanner.current = null
      console.warn(e)
    }
  }

  async function stopCamera() {
    const s = scanner.current
    scanner.current = null
    setCamOn(false)
    if (s) {
      try {
        await s.stop()
        s.clear()
      } catch {
        /* 무시 */
      }
    }
  }

  return (
    <div className="gate">
      <div className="gate-top">
        <div className="t">
          <span className="mk">
            <Activity size={16} color="#fff" />
          </span>
          FairTicket 입장 검증
        </div>
        <label className="row small" style={{ color: '#8a97a8' }}>
          게이트
          <select value={gate} onChange={(e) => setGate(e.target.value)}>
            {['A', 'B', 'C', 'VIP'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="gate-body">
        <div className="col" style={{ gap: 14 }}>
          <div className="scanner">
            <div id={READER_ID} />
            {camOn ? (
              <div className="frame">
                <div className="laser" />
              </div>
            ) : (
              <div className="idle">
                <ScanLine size={56} />
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e7ecf3' }}>관객의 QR을 비춰 주세요</div>
                <div className="small">별티켓·달티켓 등 연동된 모든 예매처의 티켓을 확인합니다</div>
                <button className="btn teal lg" onClick={startCamera}>
                  <Camera size={18} /> 카메라 켜기
                </button>
                {camError && <div className="small" style={{ color: '#fca5a5', maxWidth: 360 }}>{camError}</div>}
              </div>
            )}
          </div>
          {camOn && (
            <button className="btn" onClick={stopCamera} style={{ alignSelf: 'flex-start' }}>
              <CameraOff size={16} /> 카메라 끄기
            </button>
          )}
        </div>

        <div className="gate-side">
          <div className="gate-card">
            <h3>QR 내용 직접 입력</h3>
            <textarea
              rows={3}
              placeholder="FT:star:1:1.xxxxxxxx"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  verify(manual)
                }
              }}
            />
            <button className="btn teal block" style={{ marginTop: 10 }} disabled={!manual.trim()} onClick={() => verify(manual)}>
              확인
            </button>
          </div>
          <div className="gate-card" style={{ flex: 1 }}>
            <h3>최근 확인 {history.length}건</h3>
            <div className="hist">
              {history.length === 0 && <div className="small" style={{ color: '#5d6b7d' }}>아직 확인한 티켓이 없습니다</div>}
              {history.map((h, i) => (
                <div className="h" key={i}>
                  {h.admitted ? <CheckCircle2 size={20} color="#34d399" /> : <XCircle size={20} color="#f87171" />}
                  <div className="m">
                    <div style={{ fontWeight: 700 }}>{h.admitted ? '입장 승인' : h.message}</div>
                    <div className="tiny mono" style={{ color: '#5d6b7d' }}>
                      {h.ref}
                    </div>
                  </div>
                  <span className="tiny" style={{ color: '#5d6b7d' }}>
                    {h.at}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className={`result-over ${result.idCheck ? 'id' : result.admitted ? 'ok' : 'no'}`} onClick={() => setResult(null)}>
          <div>
            <div className="ic">{result.idCheck ? <IdCard size={84} color="#fff" /> : result.admitted ? <CheckCircle2 size={84} color="#fff" /> : <XCircle size={84} color="#fff" />}</div>
            <h2>{result.idCheck ? '신분증 확인' : result.admitted ? '입장 승인' : '입장 불가'}</h2>
            <p>
              {result.idCheck ? `예매자 ${result.idCheck.ownerName} 본인인지 신분증을 확인하세요` : result.message}
              {result.vendorName ? ` · ${result.vendorName}` : ''}
            </p>
            {result.idCheck && <p style={{ fontSize: 16, opacity: 0.85 }}>의심 근거: {result.idCheck.reasons.join(', ')}</p>}
            <small className="mono">
              {result.ref} · 게이트 {gate}
            </small>
          </div>
        </div>
      )}
    </div>
  )
}
