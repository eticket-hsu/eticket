// 백엔드 호출 헬퍼. vite.config.js 의 프록시를 거친다.
//   ft   → FairTicket 서버 (8080)
//   star → 별티켓 (8081), moon → 달티켓 (8082)

async function request(base, path, options = {}) {
  // 요청 본문 변환 오류는 네트워크 문제와 구분되도록 fetch 밖에서 한다
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  let res
  try {
    res = await fetch(`/proxy/${base}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body,
    })
  } catch {
    const err = new Error('서버에 연결할 수 없습니다')
    err.offline = true
    throw err
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (!res.ok) {
    const err = new Error(data?.message || data?.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    err.offline = res.status === 502 || res.status === 503 || res.status === 504
    throw err
  }
  return data
}

export const api = {
  get: (base, path) => request(base, path),
  post: (base, path, body = {}) => request(base, path, { method: 'POST', body }),
  del: (base, path) => request(base, path, { method: 'DELETE' }),
}

export const VENDORS = {
  star: {
    id: 'star',
    name: '별티켓',
    tagline: '오늘 밤, 가장 빛나는 자리',
    port: 8081,
    brand: '#2b50ec',
    accent: '#ffc83d',
    hero: 'linear-gradient(120deg,#16257a 0%,#2b50ec 60%,#5b8cff 100%)',
  },
  moon: {
    id: 'moon',
    name: '달티켓',
    tagline: '달빛 아래 특별한 무대',
    port: 8082,
    brand: '#6d3bea',
    accent: '#f5d06f',
    hero: 'linear-gradient(120deg,#1f0b4d 0%,#5b2bd6 60%,#a78bfa 100%)',
  },
}

/** 시연용 계정 (모든 예매처 공통 가상 식별자) */
export const PERSONAS = {
  'ft-u-001': '공연에 못 가게 되어 재판매하는 구매자',
  'ft-u-002': '재판매 티켓을 사려는 구매자',
  'ft-u-003': '일반 구매자',
  'ft-u-bot': '매크로 시연용 계정',
}

/** 예매처별 로그인 회원 기억 (브라우저 저장소가 막혀도 동작) */
export const session = {
  get(vendorId) {
    try {
      return localStorage.getItem(`ft-session-${vendorId}`)
    } catch {
      return null
    }
  },
  set(vendorId, memberId) {
    try {
      if (memberId == null) localStorage.removeItem(`ft-session-${vendorId}`)
      else localStorage.setItem(`ft-session-${vendorId}`, String(memberId))
    } catch {
      /* 무시 */
    }
  },
}
