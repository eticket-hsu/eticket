// 시연용 트래픽 생성기 (simulator/simulate.mjs 의 브라우저 버전)
// 예매처 전용 API 는 서명이 필요하므로, 시연 모드에서만 열리는 /v1/demo/* 로 보낸다
import { api } from '../api.js'

const PERF = 'PERF-001'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const event = (vendorId, uid, result, ip, reactionMs, clientTimezone = 'Asia/Seoul') =>
  api.post('ft', '/v1/demo/purchase-events', {
    vendorId,
    uid,
    performanceCode: PERF,
    action: 'PURCHASE',
    result,
    ip,
    reactionMs,
    clientTimezone,
  })

async function report(uid, log) {
  const r = await api.get('ft', `/v1/demo/risk?uid=${uid}&performanceCode=${PERF}`)
  const label = { LOW: '정상', MEDIUM: '주의', HIGH: '고위험' }[r.riskLevel]
  log(`→ ${uid}: ${label} (${r.score}점)`)
  for (const x of r.reasons) log(`   +${x.points} ${x.detail}`)
  if (r.reasons.length === 0) log('   특이 사항 없음')
}

/** 예매처 한 곳의 기록만으로 판단한 점수와, eTicket 이 합쳐 판단한 점수를 나란히 보여 준다 */
async function compare(uid, log) {
  const one = async (vendorId) =>
    api.get(
      'ft',
      `/v1/demo/risk?uid=${uid}&performanceCode=${PERF}${vendorId ? `&vendorId=${vendorId}` : ''}`,
    )
  const [star, moon, all] = await Promise.all([one('star'), one('moon'), one(null)])
  const label = (r) =>
    ({ LOW: '정상 → 그냥 구매', MEDIUM: '주의 → 보안문자', HIGH: '고위험 → 구매 보류' })[
      r.riskLevel
    ]
  log('')
  log(`별티켓 혼자 볼 때     ${String(star.score).padStart(3)}점  ${label(star)}`)
  log(`달티켓 혼자 볼 때     ${String(moon.score).padStart(3)}점  ${label(moon)}`)
  log(`eTicket 합쳐 볼 때    ${String(all.score).padStart(3)}점  ${label(all)}`)
  for (const x of all.reasons) log(`   +${x.points} ${x.detail}`)
}

export async function runTraffic(kind, log) {
  if (kind === 'split') {
    // 비교 실험의 "분산 매크로"와 같은 패턴: 사이트마다의 기준(실패 5번 초과, 한도 초과 3번 이상,
    // 0.5초 미만 반응, 1분 20번 초과)을 넘지 않게 두 사이트에 나눠 시도한다
    const uid = `ft-u-split-${Date.now() % 100000}`
    log(`분산 매크로(${uid}): 별티켓·달티켓에 8번씩 번갈아 시도`)
    log(
      '사이트마다 실패 4번 · 한도 초과 2번까지만, 반응 0.6~0.8초, 간격 불규칙 → 한 사이트 기준은 안 넘게',
    )
    const order = ['FAIL', 'FAIL', 'SUCCESS', 'FAIL', 'SUCCESS', 'FAIL', 'QUOTA', 'QUOTA']
    const ip = `10.77.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`
    for (let k = 0; k < 16; k++) {
      const v = k % 2 === 0 ? 'star' : 'moon'
      await event(v, uid, 'ATTEMPT', ip, 600 + Math.floor(Math.random() * 200))
      await event(v, uid, order[Math.floor(k / 2)], ip)
      await sleep(150 + Math.floor(Math.random() * 350))
    }
    await compare(uid, log)
    log('')
    log(
      '→ 각 사이트는 자기 기록만 봐서 정상으로 보지만, 합치면 실패 8번 · 한도 초과 4번 · 두 사이트 동시 시도가 드러납니다',
    )
    return
  }

  if (kind === 'normal') {
    log('정상 사용자 서연: 좌석을 보고 3초 뒤 예매, 몇 초 간격으로 2회')
    await event('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3', 3200)
    await sleep(1500)
    await event('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3', 2400)
    await report('ft-u-003', log)
    return
  }
  if (kind === 'pcbang') {
    log('PC방 손님 6명: 같은 IP지만 각자 사람 속도로 1회씩 (오탐이 없어야 함)')
    for (let i = 0; i < 6; i++) {
      await event(i % 2 ? 'moon' : 'star', `ft-u-pc-${i}`, 'ATTEMPT', '172.16.0.50', 2000 + i * 700)
    }
    await report('ft-u-pc-0', log)
    log('→ IP 공유 신호(+10) 하나뿐이라 정상. 한 가지 신호로는 막지 않음')
    return
  }
  if (kind === 'macro') {
    log(
      '매크로봇: 30회 · 20ms 간격 · 화면 진입 0.12초 만에 요청 · 별티켓/달티켓 번갈아 · 한도 초과 반복',
    )
    for (let i = 0; i < 30; i++) {
      const v = i % 2 === 0 ? 'star' : 'moon'
      await event(v, 'ft-u-bot', 'ATTEMPT', '203.0.113.7', 120)
      if (i % 6 === 0) await event(v, 'ft-u-bot', 'QUOTA', '203.0.113.7')
      if (i % 5 === 0) await event(v, 'ft-u-bot', 'FAIL', '203.0.113.7')
      await sleep(20)
    }
    await report('ft-u-bot', log)
    return
  }
  if (kind === 'vpn') {
    log('VPN 사용자(서연): 사람 속도로 예매하지만 VPN·데이터센터 IP로 접속, 브라우저 시간대는 한국')
    await event('star', 'ft-u-003', 'ATTEMPT', '198.18.0.77', 2600)
    await sleep(800)
    await event('moon', 'ft-u-003', 'ATTEMPT', '192.0.2.40', 2300)
    await report('ft-u-003', log)
    log(
      '→ VPN·데이터센터 IP와 시간대 불일치가 겹쳐 주의 이상. 발행처가 차단 정책을 켜면 바로 보류됩니다',
    )
    return
  }
  if (kind === 'ring') {
    log('계정 묶음: 가짜 계정 5개가 IP 2개를 돌려 쓰며 별티켓·달티켓에 나눠 시도')
    const ips = ['198.51.100.21', '198.51.100.22']
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 4; k++) {
        await event(
          k % 2 ? 'moon' : 'star',
          `ft-u-ring-${i}`,
          'ATTEMPT',
          ips[(i + k) % 2],
          150 + k * 10,
        )
      }
    }
    await report('ft-u-ring-0', log)
    log('→ 개별 점수는 낮아도 사후 검토 탭에서 여러 예매처에 걸친 계정 묶음으로 드러납니다')
    return
  }
  if (kind === 'scalper') {
    // 암표상: 좌석 화면 없이 두 예매처에서 연달아 실제 구매. 보안문자는 풀이 대행으로 통과시킴
    log('암표상(매크로봇)이 별티켓·달티켓에서 NEON WAVE를 화면 없이 연달아 구매합니다')
    const buyAt = async (vendor) => {
      const members = await api.get(vendor, '/api/members')
      const bot = members.find((m) => m.ftUid === 'ft-u-bot')
      const perf = (await api.get(vendor, '/api/performances')).find((p) => p.code === PERF)
      const url = `/api/performances/${perf.id}/purchase`
      try {
        return await api.post(vendor, url, { memberId: bot.id })
      } catch (e) {
        if (!e.data?.captchaRequired) throw e
        const c = await api.get('ft', '/v1/captcha')
        const a = await api.get('ft', `/v1/demo/captcha/${c.id}`)
        log(`   ${vendor === 'star' ? '별티켓' : '달티켓'}이 보안문자 요구 → 풀이 대행으로 통과`)
        return await api.post(vendor, url, {
          memberId: bot.id,
          captchaId: c.id,
          captchaAnswer: a.answer,
        })
      }
    }
    for (const vendor of ['star', 'moon', 'star', 'moon', 'star']) {
      const name = vendor === 'star' ? '별티켓' : '달티켓'
      try {
        const r = await buyAt(vendor)
        log(`→ ${name} 구매 성공: ${r.ticket.seat}`)
      } catch (e) {
        log(
          `→ ${name} 실패: ${e.data?.quotaExceeded ? '공통 구매 한도 초과' : e.data?.held ? '구매 보류(고위험)' : e.message}`,
        )
      }
    }
    log(
      '→ 예매 단계에서는 표 일부를 가져갔습니다. 사후 검토 탭에서 의심 계정으로 찾아 표를 취소해 보세요',
    )
    return
  }
  if (kind === 'buy') {
    const members = await api.get('star', '/api/members')
    const bot = members.find((m) => m.ftUid === 'ft-u-bot')
    const perf = (await api.get('star', '/api/performances')).find((p) => p.code === PERF)
    log('매크로봇이 별티켓에서 좌석 화면 없이 바로 구매를 시도합니다')
    try {
      const r = await api.post('star', `/api/performances/${perf.id}/purchase`, {
        memberId: bot.id,
      })
      log(`→ 구매 승인됨 (등급 ${r.level}). 먼저 '매크로 공격'을 실행해 보세요`)
    } catch (e) {
      if (e.data?.held) log('→ 별티켓이 구매를 보류했습니다 (고위험: 보안문자 + 본인인증 필요)')
      else if (e.data?.captchaRequired) log('→ 별티켓이 보안문자를 요구했습니다 (주의)')
      else log(`→ 거절: ${e.message}`)
      for (const x of e.data?.risk?.reasons ?? []) log(`   근거: ${x.detail}`)
    }
  }
}
