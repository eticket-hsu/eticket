// 기기 묶기 보강: 기기 정보 없는 구매 거절, 계정 넘기기 거래 탐지, 공연 직전 기기 옮기기 금지, QR 유효 시간 단축
const FT = 'http://localhost:8080', STAR = 'http://localhost:8081'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, url, body, device) {
  const headers = { 'Content-Type': 'application/json' }
  if (device) headers['X-Device-Id'] = device
  const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) })
  const t = await res.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { status: res.status, data }
}
let fails = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fails++ }

const mem = (await call('GET', `${STAR}/api/members`)).data
const id = (uid) => mem.find((m) => m.ftUid === uid).id
const perfs = (await call('GET', `${STAR}/api/performances`)).data
const PERF = perfs.find((p) => p.code === 'PERF-004') // 9일 뒤 공연
const SOON = perfs.find((p) => p.code === 'PERF-005') // 12시간 뒤 공연
const verify = async (qr) => (await call('POST', `${FT}/v1/verify`, { qr, gate: 'T' })).data
const myTicket = async (uid, ticketId, device) =>
  (await call('GET', `${STAR}/api/members/${id(uid)}/tickets`, undefined, device)).data.find((t) => t.id === ticketId)
async function buy(uid, device, perf = PERF) {
  await call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId: id(uid) }, device)
  await sleep(700)
  return call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId: id(uid) }, device)
}
const move = (ticketId, uid, device) =>
  call('POST', `${STAR}/api/tickets/${ticketId}/device`, { memberId: id(uid), code: '123456' }, device)

console.log('--- 표는 산 기기에 바로 묶임 ---')
let r = await buy('ft-u-001', null)
check('기기 정보 없이 API 로 바로 사면 거절', r.status === 400 && /기기 정보/.test(r.data.error), `${r.status}`)
r = await buy('ft-u-001', 'phone-1')
const t1 = r.data.ticket
check('기기 정보가 있으면 구매되고 QR 이 보임', r.status === 200 && !!t1.qr, `${r.status}`)
const firstOpen = await myTicket('ft-u-001', t1.id, 'someone-else')
check('산 기기가 아닌 곳에서 처음 열어도 QR 안 보임 (먼저 연 사람 것이 되지 않음)', firstOpen.deviceLocked === true)

console.log('--- 계정 넘기기 거래: 암표상 계정 2개의 표가 구매자 폰 하나로 모임 ---')
const tA = (await buy('ft-u-004', 'scalper-pc')).data.ticket
const tB = (await buy('ft-u-005', 'scalper-pc')).data.ticket
// 암표상이 본인인증 번호를 구매자에게 전달해 구매자 폰으로 옮김
r = await move(tA.id, 'ft-u-004', 'buyer-phone')
check('본인인증을 통과하면 옮겨지기는 함', r.status === 200 && !!r.data.qr, `${r.status}`)
await move(tB.id, 'ft-u-005', 'buyer-phone')
const review = (await call('GET', `${FT}/v1/risk/review?performanceCode=PERF-004`)).data
const cluster = review.clusters.find((c) => c.uids.includes('ft-u-004') && c.uids.includes('ft-u-005'))
check('같은 기기로 이어진 두 계정이 한 묶음으로 잡힘', !!cluster, JSON.stringify(review.clusters.map((c) => c.uids)))

console.log('--- 한 기기에서 계정 여러 개로 예매 ---')
await buy('ft-u-bot', 'scalper-pc')
const risk = (await call('GET', `${FT}/v1/demo/risk?uid=ft-u-bot&performanceCode=PERF-004`)).data
const shared = risk.reasons.find((x) => x.rule === 'SHARED_DEVICE')
check('같은 기기에서 3개 계정 시도 → 위험 신호', !!shared, shared?.detail ?? JSON.stringify(risk.reasons.map((x) => x.rule)))

console.log('--- 공연 직전에는 기기 옮기기 금지 ---')
const tSoon = (await buy('ft-u-002', 'phone-2', SOON)).data.ticket
r = await move(tSoon.id, 'ft-u-002', 'phone-3')
check('공연 24시간 전부터는 옮길 수 없음 (현장 신분증 안내)', r.status === 409 && r.data.moveClosed === true, `${r.status} ${r.data.error}`)
const still = await myTicket('ft-u-002', tSoon.id, 'phone-2')
check('원래 기기에서는 그대로 보임', !!still.qr)

console.log('--- QR 한 장의 수명: 30초 + 여유 10초 ---')
const now = await myTicket('ft-u-001', t1.id, 'phone-1')
check('만료 시각 = 바뀌는 시각 + 10초', now.qrExpiresAt - now.qrRefreshAt === 10000, `${now.qrExpiresAt - now.qrRefreshAt}ms`)
// 칸이 바뀐 지 12초 이상 지난 때를 기다린다 (그 전에는 바로 앞 칸도 받아 줌)
while (Math.floor(Date.now() / 1000) % 30 < 12 || Math.floor(Date.now() / 1000) % 30 > 27) await sleep(500)
const prev = (await call('GET', `${STAR}/api/demo/tickets/${t1.id}/old-qr?secondsAgo=30`)).data.qr
let v = await verify(prev)
check('바로 앞 30초 칸 QR 도 여유 시간이 지나면 거절', v.admitted === false && v.result === 'EXPIRED_QR', v.result)
const cur = await myTicket('ft-u-001', t1.id, 'phone-1')
v = await verify(cur.qr)
check('지금 QR 로는 입장', v.admitted === true, v.result)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
