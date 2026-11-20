import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Repeat, ScanLine } from 'lucide-react'
import { api } from '../api.js'
import { Poster, dateLabel, usePolling, won } from '../components/ui.jsx'
import { useVendor } from './VendorApp.jsx'

export default function Home() {
  const { vendor, vendorId } = useVendor()
  const [perfs, setPerfs] = useState(null)

  usePolling(async () => {
    try {
      setPerfs(await api.get(vendorId, '/api/performances'))
    } catch {
      /* 오프라인 배너는 레이아웃에서 */
    }
  }, 10000)

  return (
    <>
      <section className="v-hero" style={{ background: vendor.hero }}>
        <div className="orb" style={{ width: 340, height: 340, right: -80, top: -120 }} />
        <div
          className="orb"
          style={{ width: 160, height: 160, right: 220, bottom: -90, opacity: 0.12 }}
        />
        <h1>
          {vendor.tagline}
          <br />
          {vendor.name}에서 안전하게 예매하세요
        </h1>
        <p className="lines">
          <span>{vendor.name}은 eTicket과 연동되어 매크로·다중 계정 구매를 함께 막습니다.</span>
          <span>못 가게 된 티켓은 공식 재판매로 정가 이하에 넘길 수 있습니다.</span>
        </p>
        <div className="chips">
          <span className="chip">
            <ShieldCheck size={15} /> eTicket 부정구매 공동 대응
          </span>
          <span className="chip">
            <Repeat size={15} /> 정가 이하 공식 재판매
          </span>
          <span className="chip">
            <ScanLine size={15} /> 재발급 즉시 이전 QR 무효
          </span>
        </div>
      </section>

      <h2 className="section-title">지금 예매 가능한 공연</h2>
      <div className="perf-grid">
        {perfs?.map((p) => (
          <Link key={p.id} to={`/${vendorId}/perf/${p.id}`} className="perf-card">
            <Poster perf={p} />
            <div>
              <h3>{p.title}</h3>
              <div className="meta">
                {p.venue} · {dateLabel(p.startsAt)}
              </div>
              <div className="price">{won(p.price)}</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
