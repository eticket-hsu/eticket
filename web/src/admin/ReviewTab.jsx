import { useEffect, useState } from 'react'
import { Ban, Network, UserX } from 'lucide-react'
import { api, VENDORS } from '../api.js'
import { Modal, Who, timeLabel, usePolling, useToast } from '../components/ui.jsx'

const vname = (id) => VENDORS[id]?.name ?? id

/**
 * 사후 검토 (C묶음 ②·③).
 * 공연 전체 기록을 다시 보고, 신호가 2개 이상 겹친 사용자와 여러 예매처에 걸친 계정 묶음을 보여 준다.
 * 탐지 → 조치: 발행처 담당자가 의심 계정을 골라 표 취소를 요청한다. 취소된 표는 입장 검증에서 거절된다.
 */
export default function ReviewTab() {
  const [codes, setCodes] = useState([])
  const [code, setCode] = useState('PERF-001')
  const [review, setReview] = useState(null)
  const [history, setHistory] = useState([])
  const [picked, setPicked] = useState({}) // uid → 선택 여부
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  usePolling(async () => {
    try {
      setCodes(await api.get('ft', '/v1/risk/review/performances'))
      setHistory(await api.get('ft', '/v1/risk/review/cancellations'))
    } catch {
      /* 무시 */
    }
  }, 5000)

  usePolling(
    async () => {
      try {
        setReview(await api.get('ft', `/v1/risk/review?performanceCode=${encodeURIComponent(code)}`))
      } catch {
        setReview(null)
      }
    },
    4000,
    [code],
  )

  useEffect(() => {
    if (codes.length && !codes.includes(code)) setCode(codes[0])
  }, [codes, code])

  const suspects = review?.suspects ?? []
  // 표를 가진 의심 계정은 기본 선택. 담당자가 확인하고 빼는 방식
  const isPicked = (s) => picked[s.uid] ?? s.heldTickets.length > 0
  const chosen = suspects.filter((s) => isPicked(s) && s.heldTickets.length > 0)
  const ticketCount = chosen.reduce((n, s) => n + s.heldTickets.length, 0)

  async function cancel() {
    setBusy(true)
    try {
      const res = await api.post('ft', '/v1/risk/review/cancel', { performanceCode: code, uids: chosen.map((s) => s.uid) })
      const ok = res.filter((x) => x.result === 'CANCELLED').length
      const fail = res.length - ok
      toast(`표 ${ok}장을 취소했습니다${fail ? ` (실패 ${fail}장)` : ''}. 취소된 표는 입장할 수 없습니다`, fail ? 'bad' : 'good')
      setConfirming(false)
      setPicked({})
      setHistory(await api.get('ft', '/v1/risk/review/cancellations'))
      setReview(await api.get('ft', `/v1/risk/review?performanceCode=${encodeURIComponent(code)}`))
    } catch (e) {
      toast(e.message, 'bad')
    }
    setBusy(false)
  }

  const done = history.filter((h) => h.performanceCode === code)

  return (
    <>
      <div className="spread" style={{ marginBottom: 6 }}>
        <h1>사후 검토</h1>
        <select className="field" style={{ width: 'auto' }} value={code} onChange={(e) => setCode(e.target.value)}>
          {(codes.length ? codes : [code]).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <p className="small muted" style={{ margin: '0 0 20px' }}>
        공연 전체 구매 기록을 다시 봅니다. 신호가 2개 이상 겹친 사용자만 의심 목록에 올립니다. 발행처 담당자가 확인하고 고른 계정의 표만 취소합니다.
      </p>

      <div className="split">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="panel-h">
            <h2 className="row" style={{ gap: 6 }}>
              <UserX size={17} /> 의심 사용자 {review?.suspects.length ?? 0}명
            </h2>
            <button className="btn sm danger" disabled={!ticketCount} onClick={() => setConfirming(true)}>
              <Ban size={14} /> 선택 계정 표 취소 ({ticketCount}장)
            </button>
          </div>
          {!review?.suspects.length ? (
            <div className="empty">의심 사용자가 없습니다</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th></th>
                  <th>사용자</th>
                  <th>예매처</th>
                  <th>갖고 있는 표</th>
                  <th>겹친 신호</th>
                </tr>
              </thead>
              <tbody>
                {review.suspects.map((s) => (
                  <tr key={s.uid}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${s.uid} 선택`}
                        disabled={!s.heldTickets.length}
                        checked={isPicked(s) && s.heldTickets.length > 0}
                        onChange={(e) => setPicked((p) => ({ ...p, [s.uid]: e.target.checked }))}
                      />
                    </td>
                    <td><Who uid={s.uid} /></td>
                    <td className="small">{s.vendors.map(vname).join(', ')}</td>
                    <td className="small">{s.heldTickets.length ? `${s.heldTickets.length}장` : <span className="muted">없음</span>}</td>
                    <td>
                      {s.flags.map((f) => (
                        <span key={f} className="chip-reason">
                          {f}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="panel-h">
            <h2 className="row" style={{ gap: 6 }}>
              <Network size={17} /> 계정 묶음 {review?.clusters.length ?? 0}개
            </h2>
          </div>
          <p className="small muted lines" style={{ padding: '12px 18px 0', fontSize: 12.5 }}>
            <span>
              같은 IP로 이어진 계정들을 <b>여러 예매처에 걸쳐</b> 묶었습니다.
            </span>
            <span>한 예매처는 자기 사이트 계정만 볼 수 있어 이 묶음을 알 수 없습니다.</span>
          </p>
          {!review?.clusters.length ? (
            <div className="empty">묶인 계정이 없습니다</div>
          ) : (
            <div style={{ padding: 18, display: 'grid', gap: 12 }}>
              {review.clusters.map((c, i) => (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
                  <div className="spread">
                    <b>묶음 {i + 1} · 계정 {c.uids.length}개</b>
                    {c.crossVendor ? <span className="badge bad">여러 예매처에 걸침</span> : <span className="badge">한 예매처</span>}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {c.vendors.map(vname).join(' · ')} · IP {c.ipCount}개 · 기록 {c.events}건
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {c.uids.map((u) => (
                      <span key={u} className="chip-reason">
                        <Who uid={u} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginTop: 18 }}>
        <div className="panel-h">
          <h2 className="row" style={{ gap: 6 }}>
            <Ban size={17} /> 취소 기록 {done.length}건
          </h2>
        </div>
        {!done.length ? (
          <div className="empty">아직 취소한 표가 없습니다</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>시각</th>
                <th>사용자</th>
                <th>표</th>
                <th>결과</th>
                <th>근거</th>
              </tr>
            </thead>
            <tbody>
              {done.map((h) => (
                <tr key={h.id}>
                  <td className="mono small">{timeLabel(h.createdAt)}</td>
                  <td><Who uid={h.uid} /></td>
                  <td className="small">
                    {vname(h.vendorId)} #{h.vendorTicketId}
                  </td>
                  <td>
                    {h.result === 'CANCELLED' ? <span className="badge bad">취소 · 입장 불가</span> : <span className="badge" title={h.error}>취소 실패</span>}
                  </td>
                  <td className="small muted">{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirming && (
        <Modal title="의심 계정 표 취소" onClose={busy ? undefined : () => setConfirming(false)}>
          <p className="small text-2" style={{ lineHeight: 1.7, marginBottom: 14 }}>
            아래 계정이 가진 표 <b>{ticketCount}장</b>을 발행처에 취소 요청합니다.
            <br />
            취소된 표는 대금이 환불되고, 공연장 입장 검증에서 거절됩니다.
          </p>
          <ul className="small" style={{ margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.8 }}>
            {chosen.map((s) => (
              <li key={s.uid}>
                <Who uid={s.uid} /> · {s.heldTickets.length}장 · {s.flags.join(', ')}
              </li>
            ))}
          </ul>
          <button className="btn danger lg block" disabled={busy} onClick={cancel}>
            <Ban size={16} /> {busy ? '취소 요청 중…' : `표 ${ticketCount}장 취소`}
          </button>
        </Modal>
      )}
    </>
  )
}
