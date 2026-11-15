import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api.js'

/**
 * FairTicket 공통 보안문자. 이미지를 받아 보여 주고, 입력값을 onChange({ id, answer }) 로 넘긴다.
 * 답은 서버에서 한 번만 확인할 수 있어서, 틀리면 새 문제를 받아야 한다 (reloadKey 를 바꾸면 새로 받음).
 */
export default function Captcha({ onChange, reloadKey = 0, autoFocus = true }) {
  const [challenge, setChallenge] = useState(null)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)

  async function load() {
    setAnswer('')
    setError(null)
    try {
      const c = await api.get('ft', '/v1/captcha')
      setChallenge(c)
      onChange?.({ id: c.id, answer: '' })
    } catch {
      setError('보안문자를 불러올 수 없습니다')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  return (
    <div>
      <div className="row" style={{ gap: 10 }}>
        <div
          style={{ width: 180, height: 60, borderRadius: 8, border: '1px solid var(--line)', background: '#eef1f6', flex: 'none' }}
        >
          {challenge && <img src={challenge.image} alt="보안문자" width={180} height={60} />}
        </div>
        <button className="btn sm" type="button" onClick={load} title="새 문제">
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>
      <input
        className="field"
        style={{ marginTop: 10, fontSize: 18, letterSpacing: '0.3em', fontWeight: 700 }}
        inputMode="numeric"
        maxLength={5}
        placeholder="숫자 5자리"
        autoFocus={autoFocus}
        value={answer}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '')
          setAnswer(v)
          onChange?.({ id: challenge?.id, answer: v })
        }}
      />
      {error && <p className="tiny" style={{ color: 'var(--bad)', marginTop: 6 }}>{error}</p>}
    </div>
  )
}
