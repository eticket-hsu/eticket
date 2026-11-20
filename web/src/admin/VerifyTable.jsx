import { CheckCircle2, XCircle } from 'lucide-react'
import { VENDORS } from '../api.js'
import { timeLabel } from '../components/ui.jsx'

const vname = (id) => VENDORS[id]?.name ?? id

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

export function VerifyTable({ logs }) {
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
                    {g.result === 'ADMITTED' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{' '}
                    {VERIFY_LABEL[g.result] ?? g.result}
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
