import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { NavLink, Route, Routes, Link } from 'react-router-dom'
import { ChevronDown, Star, Moon, Ticket, Repeat, LayoutGrid } from 'lucide-react'
import { api, session, VENDORS } from '../api.js'
import { Avatar, Modal, usePolling } from '../components/ui.jsx'
import LoginModal from './LoginModal.jsx'
import Home from './Home.jsx'
import PerformanceDetail from './PerformanceDetail.jsx'
import MyTickets from './MyTickets.jsx'
import ResaleMarket from './ResaleMarket.jsx'
import './vendor.css'

const Ctx = createContext(null)
export const useVendor = () => useContext(Ctx)

/** 가상 예매처 사이트 (별티켓·달티켓 공용). 브랜드 색과 이름만 다르다. */
export default function VendorApp({ vendorId }) {
  const vendor = VENDORS[vendorId]
  const [members, setMembers] = useState([])
  const [meId, setMeId] = useState(() => session.get(vendorId))
  const [offline, setOffline] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [myCount, setMyCount] = useState(0)

  const me = members.find((m) => String(m.id) === String(meId)) ?? null

  useEffect(() => {
    document.title = `${vendor.name} · 예매`
  }, [vendor])

  const loadMembers = useCallback(async () => {
    try {
      setMembers(await api.get(vendorId, '/api/members'))
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [vendorId])

  usePolling(loadMembers, 5000)

  usePolling(async () => {
    if (!meId) return setMyCount(0)
    try {
      const ts = await api.get(vendorId, `/api/members/${meId}/tickets`)
      setMyCount(ts.length)
    } catch {
      /* 무시 */
    }
  }, 4000, [meId])

  const login = (m) => {
    setMeId(m ? String(m.id) : null)
    session.set(vendorId, m?.id)
    setLoginOpen(false)
  }

  const value = { vendor, vendorId, members, me, login, openLogin: () => setLoginOpen(true), offline }

  return (
    <Ctx.Provider value={value}>
      <div style={{ '--brand': vendor.brand, '--accent': vendor.accent, '--brand-soft': `${vendor.brand}14` }}>
        <header className="v-header">
          <div className="v-header-inner">
            <Link to={`/${vendorId}`} className="v-logo">
              <span className="v-logo-mark">{vendorId === 'star' ? <Star size={18} fill="currentColor" /> : <Moon size={18} fill="currentColor" />}</span>
              {vendor.name}
            </Link>
            <nav className="v-nav">
              <NavLink to={`/${vendorId}`} end>
                <LayoutGrid size={16} /> 공연
              </NavLink>
              <NavLink to={`/${vendorId}/resale`}>
                <Repeat size={16} /> 공식 재판매
              </NavLink>
              <NavLink to={`/${vendorId}/my`}>
                <Ticket size={16} /> 내 티켓 {myCount > 0 && <span className="count">{myCount}</span>}
              </NavLink>
            </nav>
            {me ? (
              <button className="v-user" onClick={() => setLoginOpen(true)}>
                <Avatar member={me} size={30} /> {me.name}님 <ChevronDown size={16} />
              </button>
            ) : (
              <button className="btn primary sm" onClick={() => setLoginOpen(true)}>
                로그인
              </button>
            )}
          </div>
        </header>
        {offline && (
          <div className="v-offline">
            {vendor.name} 서버(포트 {vendor.port})에 연결할 수 없습니다. 서버를 켠 뒤 잠시 기다려 주세요.
          </div>
        )}
        <main className="v-main">
          <Routes>
            <Route index element={<Home />} />
            <Route path="perf/:id" element={<PerformanceDetail />} />
            <Route path="my" element={<MyTickets />} />
            <Route path="resale" element={<ResaleMarket />} />
          </Routes>
        </main>
        {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
      </div>
    </Ctx.Provider>
  )
}

/** 로그인이 필요한 화면에서 쓰는 안내 */
export function NeedLogin({ text = '로그인이 필요합니다' }) {
  const { openLogin } = useVendor()
  return (
    <div className="card empty">
      <p style={{ marginBottom: 14 }}>{text}</p>
      <button className="btn primary" onClick={openLogin}>
        로그인
      </button>
    </div>
  )
}

export { Modal }
