import { Badge, RISK, Who } from '../components/ui.jsx'

export function RiskTable({ risks, compact }) {
  const color = (s) => (s >= 70 ? 'var(--bad)' : s >= 40 ? 'var(--warn)' : 'var(--good)')
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="panel-h">
        <h2>{compact ? '위험 신호 상위' : '최근 1시간 분석 결과'}</h2>
        <span className="tiny muted">0~39 정상 · 40~69 주의 · 70+ 고위험</span>
      </div>
      {risks.length === 0 ? (
        <div className="empty">
          분석된 구매 시도가 없습니다. 시연 도구에서 트래픽을 만들어 보세요.
        </div>
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
                  <Who uid={r.uid} />
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
