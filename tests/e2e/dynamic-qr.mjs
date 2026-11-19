// 계속 바뀌는 QR + 기기 묶기 + 기기 옮김 신호 + 의심 표 신분증 확인
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

const PHONE_A = 'phone-a', PHONE_B = 'phone-b', PHONE_C = 'phone-c'
const mem = (await call('GET', `${STAR}/api/members`)).data
const id = (uid) => mem.find((m) => m.ftUid === uid).id
const perf = (await call('GET', `${STAR}/api/performances`)).data.find((p) => p.code === 'PERF-002')
const verify = async (qr) => (await call('POST', `${FT}/v1/verify`, { qr, gate: 'T' })).data
const myTicket = async (uid, ticketId, device) =>
  (await call('GET', `${STAR}/api/members/${id(uid)}/tickets`, undefined, device)).data.find((t) => t.id === ticketId)
async function buy(uid, device) {
  await call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId: id(uid) }, device)
  await sleep(700)
  return (await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId: id(uid) }, device)).data.ticket
}

console.log('--- 계속 바뀌는 QR ---')
const t1 = await buy('ft-u-001', PHONE_A)
check('산 기기(폰 A)에서는 QR 이 보임', !!t1.qr && !t1.deviceLocked)
check('QR 에 시간칸이 들어 있음 (FT:발행처:티켓:버전:시간칸)', t1.qr.split('.')[0].split(':').length === 5, t1.qr.split('.')[0])
check('다음 QR 로 바뀌는 시각과 만료 시각을 알려 줌', t1.qrRefreshAt > Date.now() && t1.qrExpiresAt > t1.qrRefreshAt)
const old = (await call('GET', `${STAR}/api/demo/tickets/${t1.id}/old-qr?secondsAgo=120`)).data.qr
let v = await verify(old)
check('2분 전에 캡처한 QR → 거절', v.admitted === false && v.result === 'EXPIRED_QR', v.result)
const forged = t1.qr.replace(/:(\d+)\./, (m, w) => `:${Number(w) + 100}.`)
v = await verify(forged)
check('시간칸을 고쳐 쓴 QR → 위조로 거절', v.admitted === false && v.result === 'INVALID_SIGNATURE', v.result)

console.log('--- 기기 묶기 ---')
let other = await myTicket('ft-u-001', t1.id, PHONE_B)
check('다른 기기(폰 B)에서는 QR 이 안 보임', other.deviceLocked === true && !other.qr)
other = await myTicket('ft-u-001', t1.id, null)
check('기기 정보 없이 요청해도 QR 이 안 보임', other.deviceLocked === true && !other.qr)
let r = await call('POST', `${STAR}/api/tickets/${t1.id}/device`, { memberId: id('ft-u-001'), code: '000000' }, PHONE_B)
check('본인인증 번호가 틀리면 못 옮김', r.status === 403, `${r.status}`)
r = await call('POST', `${STAR}/api/tickets/${t1.id}/device`, { memberId: id('ft-u-002'), code: '123456' }, PHONE_B)
check('주인이 아닌 사람은 인증해도 못 옮김', r.status === 409, `${r.status}`)
r = await call('POST', `${STAR}/api/tickets/${t1.id}/device`, { memberId: id('ft-u-001'), code: '123456' }, PHONE_B)
check('주인이 본인인증하면 폰 B 로 옮겨짐', r.status === 200 && !!r.data.qr, `${r.status}`)
other = await myTicket('ft-u-001', t1.id, PHONE_A)
check('옮긴 뒤 원래 폰 A 에서는 QR 이 안 보임', other.deviceLocked === true)
const nowB = await myTicket('ft-u-001', t1.id, PHONE_B)
v = await verify(nowB.qr)
check('폰 B 의 지금 QR 로 입장 승인', v.admitted === true, v.result)
check('정상 이용자는 신분증 확인 없음', !v.idCheck)

console.log('--- 계정 양도 의심: 기기를 자주 옮기면 사후 검토 신호 ---')
const t2 = await buy('ft-u-003', PHONE_A)
for (const d of [PHONE_B, PHONE_C]) {
  await call('POST', `${STAR}/api/tickets/${t2.id}/device`, { memberId: id('ft-u-003'), code: '123456' }, d)
}
// 기기 옮김 + 다른 이상 행동(좌석 화면 없이 바로 예매)이 겹치면 의심 목록
await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId: id('ft-u-003') }, PHONE_C)
const review = (await call('GET', `${FT}/v1/risk/review?performanceCode=PERF-002`)).data
const s = review.suspects.find((x) => x.uid === 'ft-u-003')
check('기기를 2번 옮긴 계정에 "다른 기기로 옮김" 신호', s?.flags.some((f) => f.includes('다른 기기로 2회')), JSON.stringify(s?.flags))

console.log('--- 의심 표는 입장 때 신분증 확인 ---')
const c = await myTicket('ft-u-003', t2.id, PHONE_C)
v = await verify(c.qr)
check('의심 계정 표: 입장은 승인되지만 신분증 확인 요청', v.admitted === true && v.idCheck?.required === true, JSON.stringify(v.idCheck))
check('예매자 이름은 가운데를 가려서 보여 줌', v.idCheck?.ownerName === '서*', v.idCheck?.ownerName)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
