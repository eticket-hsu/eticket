import { useEffect, useState } from 'react'
import { Network, Send, UserX } from 'lucide-react'
import { api, VENDORS } from '../api.js'
import { usePolling, useToast } from '../components/ui.jsx'

const vname = (id) => VENDORS[id]?.name ?? id

/**
 * 사후 검토 (C묶음 ②·③).
 * 공연 전체 기록을 다시 보고, 신호가 2개 이상 겹친 사용자와 여러 예매처에 걸친 계정 묶음을 보여 준다.
 * 취소 여부는 발행처가 결정하므로 FairTicket 은 목록을 "전달"만 한다.
 */
export default function ReviewTab() {
  const [codes, setCodes] = useState([])
  const [code, setCode] = useState('PERF-001')
  const [review, setReview] = useState(null)
  const [reports, setReports] = useState([])
  const toast = useToast()

  usePolling(async () => {
    try {
      setCodes(await api.get('ft', '/v1/risk/review/performances'))
      setReports(await api.get('ft', '/v1/risk/review/reports'))
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

  async function send() {
    const uids = review?.suspects.map((s) => s.uid) ?? []
    try {
      await api.post('ft', '/v1/risk/review/reports', { performanceCode: code, uids })
      toast(`의심 ${uids.length}명 목록을 발행처에 전달했습니다. 취소 여부는 발행처가 결정합니다`, 'good')
      setReports(await api.get('ft', '/v1/risk/review/reports'))
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  const sent = reports.filter((r) => r.performanceCode === code)

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
        공연 전체 구매 기록을 다시 봅니다. 신호가 2개 이상 겹친 사용자만 의심 목록에 올리고(한 가지 신호로는 올리지 않음), 취소 여부는 발행처가 결정합니다.
      </p>

      <div className="split">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="panel-h">
            <h2 className="row" style={{ gap: 6 }}>
              <UserX size={17} /> 의심 사용자 {review?.suspects.length ?? 0}명
            </h2>
            <button className="btn sm dark" disabled={!review?.suspects.length} onClick={send}>
              <Send size={14} /> 발행처에 전달
            </button>
          </div>
          {!review?.suspects.length ? (
            <div className="empty">의심 사용자가 없습니다</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>사용자</th>
                  <th>예매처</th>
                  <th>요청·성공</th>
                  <th>겹친 신호</th>
                </tr>
              </thead>
              <tbody>
                {review.suspects.map((s) => (
                  <tr key={s.uid}>
                    <td className="mono">{s.uid}</td>
                    <td className="small">{s.vendors.map(vname).join(', ')}</td>
                    <td className="small">
                      {s.attempts}회 · {s.successes}매
                    </td>
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
          {sent.length > 0 && (
            <div className="small muted" style={{ padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
              전달 기록:{' '}
              {sent.map((r, i) => (
                <span key={i}>
                  {r.sentAt.slice(11, 19)} {r.uids.length}명{i < sent.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="panel-h">
            <h2 className="row" style={{ gap: 6 }}>
              <Network size={17} /> 계정 묶음 {review?.clusters.length ?? 0}개
            </h2>
          </div>
          <p className="small muted" style={{ padding: '12px 18px 0' }}>
            같은 IP로 이어진 계정들을 <b>여러 예매처에 걸쳐</b> 묶었습니다. 한 예매처는 자기 사이트의 계정만 볼 수 있어 이 묶음을 알 수 없습니다.
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
                      <span key={u} className="chip-reason mono">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
