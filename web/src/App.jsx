import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './Landing.jsx'

// 각 앱의 코드와 스타일은 해당 화면에 진입할 때 불러온다.
const VendorApp = lazy(() => import('./vendor/VendorApp.jsx'))
const AdminConsole = lazy(() => import('./admin/AdminConsole.jsx'))
const GateApp = lazy(() => import('./gate/GateApp.jsx'))

/**
 * 시연용 앱 묶음. 실제로는 서로 다른 회사의 서비스지만 시연 편의를 위해 한 번에 띄운다.
 *   /star, /moon : 가상 예매처 (각자 다른 백엔드)
 *   /admin       : eTicket 운영 콘솔
 *   /gate        : 공연장 입장 검증 앱
 */
export default function App() {
  return (
    <Suspense fallback={<div className="empty">불러오는 중…</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/star/*" element={<VendorApp key="star" vendorId="star" />} />
        <Route path="/moon/*" element={<VendorApp key="moon" vendorId="moon" />} />
        <Route path="/admin" element={<AdminConsole />} />
        <Route path="/gate" element={<GateApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
