import { LogOut } from 'lucide-react'
import { PERSONAS } from '../api.js'
import { Avatar, Modal } from '../components/ui.jsx'
import { useVendor } from './VendorApp.jsx'

/** 시연용 로그인: 비밀번호 없이 데모 계정을 고른다. */
export default function LoginModal({ onClose }) {
  const { vendor, members, me, login } = useVendor()
  return (
    <Modal title={`${vendor.name} 로그인`} onClose={onClose}>
      <p className="small text-2" style={{ marginBottom: 14 }}>
        시연용 계정을 선택하세요. 모든 예매처가 같은 가상 공통 식별자를 사용합니다.
      </p>
      <div className="persona-list">
        {members.map((m) => (
          <button key={m.id} className={`persona ${me?.id === m.id ? 'on' : ''}`} onClick={() => login(m)}>
            <Avatar member={m} size={42} />
            <div className="grow">
              <b>{m.name}</b>
              <div className="small muted">{PERSONAS[m.ftUid] ?? '데모 계정'}</div>
            </div>
            <span className="tiny mono muted">{m.ftUid}</span>
          </button>
        ))}
      </div>
      {me && (
        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => login(null)}>
          <LogOut size={16} /> 로그아웃
        </button>
      )}
    </Modal>
  )
}
