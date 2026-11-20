// C묶음 확정 규칙 확인: 위험 규칙 7개, 등급별 조치(보안문자/본인인증), 재판매 응모 제한, 사후 검토·계정 묶음
// 회원마다 다른 기기에서 접속하는 것처럼 (본문 memberId 나 주소의 회원 번호로 정함)
const e2eDevice = (url, body) =>
  `e2e-${body?.memberId ?? String(url).match(/members\/(\d+)/)?.[1] ?? 'x'}`
const FT = 'http://localhost:8080',
  STAR = 'http://localhost:8081',
  MOON = 'http://localhost:8082'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': e2eDevice(url, body) },
    body: body && JSON.stringify(body),
  })
  const t = await res.text()
  let data = null
  try {
    data = t ? JSON.parse(t) : null
  } catch {
    data = t
  }
  return { status: res.status, data }
}
let fails = 0
const check = (n, c, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`)
  if (!c) fails++
}
for (const u of [`${FT}/v1/resales`, `${STAR}/api/info`, `${MOON}/api/info`])
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(u)).ok) break
    } catch {}
    await sleep(1000)
  }

const PERF = 'PERF-001'
const ev = (vendorId, uid, result, ip, reactionMs) =>
  call('POST', `${FT}/v1/demo/purchase-events`, {
    vendorId,
    uid,
    performanceCode: PERF,
    action: 'PURCHASE',
    result,
    ip,
    reactionMs,
  })
const risk = async (uid) =>
  (await call('GET', `${FT}/v1/demo/risk?uid=${uid}&performanceCode=${PERF}`)).data
const rules = (r) => r.reasons.map((x) => x.rule).join(',')
const captcha = async () => {
  const c = (await call('GET', `${FT}/v1/captcha`)).data
  return { id: c.id, answer: (await call('GET', `${FT}/v1/demo/captcha/${c.id}`)).data.answer }
}
const mem = (await call('GET', `${STAR}/api/members`)).data,
  mid = (u) => mem.find((m) => m.ftUid === u).id
const perf = (await call('GET', `${STAR}/api/performances`)).data.find((p) => p.code === PERF)
const purchase = (uid, extra = {}) =>
  call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId: mid(uid), ...extra })
const view = (uid) =>
  call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId: mid(uid) })

console.log('--- 규칙 ---')
await ev('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3', 3200)
await sleep(300)
await ev('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3', 2400)
let r = await risk('ft-u-003')
check(
  '정상 사용자(사람 속도) → 정상, 신호 없음',
  r.riskLevel === 'LOW' && r.score === 0,
  `${r.score}`,
)
for (let i = 0; i < 6; i++)
  await ev(i % 2 ? 'moon' : 'star', `ft-u-pc-${i}`, 'ATTEMPT', '172.16.0.50', 2000 + i * 500)
r = await risk('ft-u-pc-0')
check(
  'PC방 6명 같은 IP → IP 공유 신호만, 정상 (오탐 없음)',
  r.riskLevel === 'LOW' && rules(r) === 'SHARED_IP',
  `${r.score} ${rules(r)}`,
)
for (let i = 0; i < 30; i++) {
  const v = i % 2 ? 'moon' : 'star'
  await ev(v, 'ft-u-bot', 'ATTEMPT', '203.0.113.7', 120)
  if (i % 6 === 0) await ev(v, 'ft-u-bot', 'QUOTA', '203.0.113.7')
  if (i % 5 === 0) await ev(v, 'ft-u-bot', 'FAIL', '203.0.113.7')
  await sleep(20)
}
r = await risk('ft-u-bot')
check('매크로봇 → 고위험', r.riskLevel === 'HIGH', `${r.score}`)
for (const rule of [
  'REQUEST_RATE',
  'MACHINE_INTERVAL',
  'REACTION_TIME',
  'CROSS_VENDOR',
  'QUOTA_HITS',
  'REPEATED_FAILURE',
])
  check(`  근거에 ${rule}`, rules(r).includes(rule))

console.log('--- 등급별 조치 (별티켓 구매) ---')
await view('ft-u-003')
await sleep(600)
r = await purchase('ft-u-003')
check(
  '정상 → 바로 구매',
  r.status === 200 && r.data.level === 'LOW',
  `${r.status} ${r.data?.level}`,
)

await ev('moon', 'ft-u-002', 'ATTEMPT', '10.0.0.2', 2000) // 달티켓에서도 같은 공연 시도 (+20)
r = await purchase('ft-u-002') // 좌석 화면 없이 바로 요청 (+25) → 45 주의
check(
  '주의 → 보안문자 요구',
  r.status === 403 && r.data.captchaRequired && r.data.level === 'MEDIUM',
  `${r.status} ${r.data?.level}`,
)
r = await purchase('ft-u-002', { captchaId: (await captcha()).id, captchaAnswer: '00000' })
check('보안문자 오답 → 다시 요구', r.status === 403 && r.data.wrong === true)
let c = await captcha()
r = await purchase('ft-u-002', { captchaId: c.id, captchaAnswer: c.answer })
check('보안문자 정답 → 구매 허용', r.status === 200, `${r.status}`)
r = await purchase('ft-u-002', { captchaId: c.id, captchaAnswer: c.answer })
check('같은 보안문자 재사용 불가', r.status === 403 && r.data.wrong === true)

r = await purchase('ft-u-bot')
check('고위험 → 보류 + 본인인증 요구', r.status === 403 && r.data.held && r.data.verifyRequired)
r = await call('POST', `${STAR}/api/identity/verify`, { memberId: mid('ft-u-bot'), code: '000000' })
check('본인인증 오답 거절', r.status === 403)
await call('POST', `${STAR}/api/identity/verify`, { memberId: mid('ft-u-bot'), code: '123456' })
r = await purchase('ft-u-bot')
check('본인인증만으로는 부족 → 보안문자도 요구', r.status === 403 && r.data.captchaRequired)
c = await captcha()
r = await purchase('ft-u-bot', { captchaId: c.id, captchaAnswer: c.answer })
check('본인인증 + 보안문자 → 그 구매는 허용', r.status === 200)
r = await risk('ft-u-bot')
check('통과 후에도 분석은 계속 (여전히 고위험)', r.riskLevel === 'HIGH')

console.log('--- 재판매 응모 제한 ---')
await view('ft-u-001')
await sleep(600)
const t = (await purchase('ft-u-001')).data.ticket
const L = (await call('POST', `${STAR}/api/tickets/${t.id}/resale`, { memberId: mid('ft-u-001') }))
  .data.id
r = await call('POST', `${FT}/v1/resales/${L}/entries`, { buyerUid: 'ft-u-bot' })
check('고위험 응모 불가', r.status === 409, r.data?.error)
r = await call('POST', `${FT}/v1/resales/${L}/entries`, { buyerUid: 'ft-u-002' })
const lvl2 = (await risk('ft-u-002')).riskLevel
if (lvl2 === 'MEDIUM') {
  check('주의 → 응모 전 보안문자 요구', r.status === 403 && r.data.captchaRequired)
  c = await captcha()
  r = await call('POST', `${FT}/v1/resales/${L}/entries`, {
    buyerUid: 'ft-u-002',
    captchaId: c.id,
    captchaAnswer: c.answer,
  })
  check('보안문자 통과 후 응모', r.status === 200)
} else check(`지수 등급 ${lvl2} → 바로 응모`, r.status === 200)

console.log('--- 사후 검토·계정 묶음 ---')
for (let i = 0; i < 5; i++)
  for (let k = 0; k < 4; k++)
    await ev(
      k % 2 ? 'moon' : 'star',
      `ft-u-ring-${i}`,
      'ATTEMPT',
      ['198.51.100.21', '198.51.100.22'][(i + k) % 2],
      150 + k * 10,
    )
const rv = (await call('GET', `${FT}/v1/risk/review?performanceCode=${PERF}`)).data
const sus = rv.suspects.map((s) => s.uid)
check('의심 목록에 매크로봇', sus.includes('ft-u-bot'))
check(
  '의심 목록에 정상 사용자·PC방 손님 없음',
  !sus.includes('ft-u-003') && !sus.some((u) => u.startsWith('ft-u-pc')),
  sus.join(','),
)
const ring = rv.clusters.find((cl) => cl.uids.includes('ft-u-ring-0'))
check(
  '분산 매크로 5계정이 하나의 묶음, 여러 예매처에 걸침',
  ring && ring.uids.length === 5 && ring.crossVendor,
  JSON.stringify(ring?.uids),
)
check(
  'PC방 손님은 묶음으로 보고하지 않음',
  !rv.clusters.some((cl) => cl.uids.some((u) => u.startsWith('ft-u-pc'))),
)
r = await call('POST', `${FT}/v1/risk/review/reports`, { performanceCode: PERF, uids: sus })
check('의심 목록 발행처 전달 기록', r.status === 200 && r.data.uids.length === sus.length)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
