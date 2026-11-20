import { VENDORS } from '../api.js'
import { Badge, Who, timeLabel } from '../components/ui.jsx'

const vname = (id) => VENDORS[id]?.name ?? id

const QUOTA_STATUS = {
  HELD: { label: '결제 대기 (예약)', tone: 'warn' },
  CONFIRMED: { label: '확정', tone: 'good' },
  RELEASED: { label: '반환', tone: '' },
}

export function QuotaTable({ rows }) {
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
                <td>
                  <Who uid={q.uid} />
                </td>
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
