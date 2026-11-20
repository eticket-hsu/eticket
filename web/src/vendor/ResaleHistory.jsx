import { Badge, RESALE_STATUS, won } from '../components/ui.jsx'

export function ResaleHistory({ resales }) {
  if (resales.length === 0) return null
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 40 }}>
        지난 재판매 내역
      </h2>
      <div className="card">
        {resales.map((r) => (
          <div
            key={r.id}
            className="spread"
            style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}
          >
            <div>
              <b>{r.performanceTitle ?? `티켓 ${r.vendorTicketId}`}</b>
              <div className="small muted">
                {r.seat} · 재판매 #{r.id} · {won(r.price)}
              </div>
            </div>
            <Badge map={RESALE_STATUS} value={r.status} />
          </div>
        ))}
      </div>
    </>
  )
}
