import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './Landing.jsx'
import VendorApp from './vendor/VendorApp.jsx'
import AdminConsole from './admin/AdminConsole.jsx'
import GateApp from './gate/GateApp.jsx'

/**
 * 시연용 앱 묶음. 실제로는 서로 다른 회사의 서비스지만 시연 편의를 위해 한 번에 띄운다.
 *   /star, /moon : 가상 예매처 (각자 다른 백엔드)
 *   /admin       : FairTicket 운영 콘솔
 *   /gate        : 공연장 입장 검증 앱
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/star/*" element={<VendorApp key="star" vendorId="star" />} />
      <Route path="/moon/*" element={<VendorApp key="moon" vendorId="moon" />} />
      <Route path="/admin" element={<AdminConsole />} />
      <Route path="/gate" element={<GateApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
