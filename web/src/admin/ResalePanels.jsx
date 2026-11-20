import { useState } from 'react'

import { api, VENDORS } from '../api.js'
import {
  Badge,
  RESALE_STATUS,
  RISK,
  ResaleStepper,
  Who,
  timeLabel,
  useMemberNames,
  usePolling,
  useToast,
  won,
} from '../components/ui.jsx'

const vname = (id) => VENDORS[id]?.name ?? id

export function ResaleTable({ resales, selected, onSelect, title }) {
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
              <tr
                key={r.id}
                className={`click ${selected === r.id ? 'sel' : ''}`}
                onClick={() => onSelect(r.id)}
              >
                <td className="muted">{r.id}</td>
                <td>
                  <b className="cell-title">{r.performanceTitle ?? r.performanceCode}</b>
                  <div className="tiny muted">
                    {vname(r.vendorId)} · {r.seat ?? `티켓 ${r.vendorTicketId}`}
                  </div>
                </td>
                <td className="mono small">
                  <Who uid={r.sellerUid} /> → <Who uid={r.winnerUid} />
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

export function ResaleDetail({ id }) {
  const { withNames } = useMemberNames()
  const [d, setD] = useState(null)
  const toast = useToast()
  usePolling(
    async () => {
      if (!id) return setD(null)
      try {
        setD(await api.get('ft', `/v1/resales/${id}`))
      } catch {
        /* 무시 */
      }
    },
    1500,
    [id],
  )

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
  const tone = (s) =>
    ['REISSUE_FAILED'].includes(s) ? 'bad' : ['CANCELLED', 'EXPIRED'].includes(s) ? 'mut' : ''

  return (
    <div className="card">
      <div className="panel-h">
        <h2>재판매 #{l.id}</h2>
        <span className="row" style={{ gap: 6 }}>
          {l.status === 'LISTED' && (
            <span className={`badge ${l.selectionPhase === 'FIRST_COME' ? 'warn' : 'info'}`}>
              {l.selectionPhase === 'FIRST_COME' ? '선착순' : '추첨'}
            </span>
          )}
          <Badge map={RESALE_STATUS} value={l.status} />
        </span>
      </div>
      <div style={{ padding: 18, display: 'grid', gap: 18 }}>
        <div>
          <b>{l.performanceTitle}</b>
          <div className="small muted">
            {vname(l.vendorId)} · {l.seat} · {won(l.price)} · 수수료{' '}
            {l.fee > 0 ? won(l.fee) : '없음'}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {l.lotteryCloseAt
              ? `추첨 마감 ${l.lotteryCloseAt.replace('T', ' ').slice(0, 16)} · `
              : ''}
            판매 종료 {l.saleCloseAt?.replace('T', ' ').slice(0, 16)} · 결제 기한 {l.paymentMinutes}
            분
            {l.paymentDeadline && l.status === 'DRAWN'
              ? ` (마감 ${timeLabel(l.paymentDeadline)})`
              : ''}
          </div>
        </div>
        <ResaleStepper status={l.status} />
        <div className="row wrap">
          <button
            className="btn sm dark"
            disabled={l.status !== 'LISTED' || l.selectionPhase === 'FIRST_COME'}
            title="응모자가 없으면 선착순으로 넘어갑니다"
            onClick={() =>
              act(() => api.post('ft', `/v1/resales/${l.id}/draw`), '추첨 마감을 처리했습니다')
            }
          >
            추첨 마감 (실행)
          </button>
          <button
            className="btn sm"
            disabled={l.status !== 'DRAWN'}
            onClick={() =>
              act(() => api.post('ft', `/v1/resales/${l.id}/forfeit`), '차순위로 넘겼습니다')
            }
          >
            결제 기한 초과 처리
          </button>
          <button
            className="btn sm"
            disabled={!['RESALE_PENDING', 'LISTED'].includes(l.status)}
            onClick={() =>
              act(() => api.del('ft', `/v1/resales/${l.id}`), '취소하고 권한을 복원했습니다')
            }
          >
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
                <p>{withNames(h.note)}</p>
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
                    <td className="small">
                      <Who uid={e.buyerUid} />
                    </td>
                    <td>
                      <Badge map={RISK} value={e.riskLevel} />
                    </td>
                    <td className="small">{e.drawRank ? `${e.drawRank}순위` : '추첨 전'}</td>
                    <td className="small">
                      {e.forfeited ? (
                        <span className="badge bad">자격 상실</span>
                      ) : e.buyerUid === l.winnerUid ? (
                        <span className="badge good">당첨</span>
                      ) : (
                        ''
                      )}
                    </td>
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
