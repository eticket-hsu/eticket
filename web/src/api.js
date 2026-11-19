// 백엔드 호출 헬퍼. vite.config.js 의 프록시를 거친다.
//   ft   → FairTicket 서버 (8080)
//   star → 별티켓 (8081), moon → 달티켓 (8082)

async function request(base, path, options = {}) {
  // 요청 본문 변환 오류는 네트워크 문제와 구분되도록 fetch 밖에서 한다
  const body = options.body === undefined ? undefined : JSON.stringify(options.body)
  const headers = { 'Content-Type': 'application/json' }
  // 예매처에는 기기 ID 를 보낸다: 표는 예매한 기기에서만 보인다
  if (base !== 'ft') headers['X-Device-Id'] = deviceId()
  // 시연용: 예매처 화면에서 고른 접속 위치(해외·VPN 등)를 예매처 서버에 알린다
  const demoIp = base !== 'ft' ? demoLocation.ip() : null
  if (demoIp) headers['X-Demo-Client-Ip'] = demoIp
  let res
  try {
    res = await fetch(`/proxy/${base}${path}`, {
      headers,
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
  'ft-u-004': '재판매 응모자 (추첨 확인용)',
  'ft-u-005': '재판매 응모자 (추첨 확인용)',
  'ft-u-bot': '매크로 시연용 계정',
}

/**
 * 이 브라우저의 기기 ID. 처음 한 번 만들어 저장한다 (시크릿 창이나 다른 브라우저는 다른 기기로 보임).
 * 실서비스 앱이라면 설치된 기기의 ID 를 쓴다.
 */
let memoryDeviceId = null
export function deviceId() {
  try {
    let id = localStorage.getItem('ft-device-id')
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).toString()
      localStorage.setItem('ft-device-id', id)
    }
    return id
  } catch {
    memoryDeviceId ??= `${Date.now()}-${Math.random()}`
    return memoryDeviceId
  }
}

/**
 * 시연용 접속 위치. 서버의 IP 종류 목록(ip-ranges.csv)에 있는 시연용 대역을 쓴다.
 * 실제 IP 를 바꾸지 않고, 예매처 서버가 시연 모드일 때만 이 값을 접속 IP 로 본다.
 */
export const DEMO_LOCATIONS = [
  { id: 'home', label: '내 컴퓨터 (국내)', ip: null },
  { id: 'foreign', label: '해외 IP', ip: '203.0.113.50' },
  { id: 'vpn', label: 'VPN', ip: '198.18.0.50' },
  { id: 'datacenter', label: '데이터센터 서버', ip: '192.0.2.50' },
]

export const demoLocation = {
  get() {
    try {
      return localStorage.getItem('ft-demo-location') ?? 'home'
    } catch {
      return 'home'
    }
  },
  set(id) {
    try {
      localStorage.setItem('ft-demo-location', id)
    } catch {
      /* 무시 */
    }
  },
  ip() {
    return DEMO_LOCATIONS.find((l) => l.id === demoLocation.get())?.ip ?? null
  },
}

/** 브라우저 시간대 (예: Asia/Seoul). IP 위치와 다르면 VPN 신호가 된다 */
export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return null
  }
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
