import { useState } from 'react'

import { ShieldCheck } from 'lucide-react'
import { api } from '../api.js'
import { Modal, useToast } from '../components/ui.jsx'
import { useVendor } from './VendorApp.jsx'

/** 다른 기기에 묶인 표를 본인인증으로 이 기기에 옮긴다 (폰 교체·분실 대비) */
export function DeviceMoveModal({ ticket, onClose, onDone }) {
  const { vendorId, me } = useVendor()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(null)
  const toast = useToast()
  async function submit() {
    setBusy(true)
    try {
      await api.post(vendorId, `/api/tickets/${ticket.id}/device`, { memberId: me.id, code })
      toast('이 기기로 표를 옮겼습니다. 이전 기기에서는 QR이 보이지 않습니다', 'good')
      onDone()
      onClose()
    } catch (e) {
      // 공연 직전(24시간 전부터)에는 옮길 수 없음: 현장 신분증 확인 안내
      if (e.data?.moveClosed) setClosed(e.message)
      else toast(e.message, 'bad')
      setBusy(false)
    }
  }
  if (closed) {
    return (
      <Modal title="기기를 옮길 수 없습니다" onClose={onClose}>
        <p className="small text-2" style={{ lineHeight: 1.7 }}>
          {closed}
        </p>
        <button className="btn lg block" style={{ marginTop: 14 }} onClick={onClose}>
          닫기
        </button>
      </Modal>
    )
  }
  return (
    <Modal title="이 기기로 표 옮기기" onClose={onClose}>
      <p className="small text-2 lines" style={{ lineHeight: 1.7, marginBottom: 14 }}>
        <span>이 표는 예매한 기기에 묶여 있어서, 그 기기에서만 QR이 보입니다.</span>
        <span>폰을 바꿨거나 잃어버렸다면 예매자 본인인증 후 이 기기로 옮길 수 있습니다.</span>
        <span>공연 24시간 전부터는 옮길 수 없습니다.</span>
      </p>
      <input
        className="field"
        inputMode="numeric"
        maxLength={6}
        placeholder="인증번호 6자리 (시연용 123456)"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <button
        className="btn primary lg block"
        style={{ marginTop: 14 }}
        disabled={busy || code.length !== 6}
        onClick={submit}
      >
        <ShieldCheck size={16} /> 본인인증하고 옮기기
      </button>
      <p className="tiny muted center" style={{ marginTop: 10 }}>
        옮긴 기록은 남습니다. 자주 옮기면 계정 양도 의심으로 검토될 수 있습니다
      </p>
    </Modal>
  )
}
