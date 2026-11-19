// 탐지 → 조치: 암표상 구매 → 사후 검토 → 발행처 취소 → 입장 거절
import { call as scall } from './sign.mjs'
const FT = 'http://localhost:8080', STAR = 'http://localhost:8081', MOON = 'http://localhost:8082'
const V = { star: STAR, moon: MOON }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  const t = await res.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { status: res.status, data }
}
let fails = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fails++ }

const mem = {}, perf = {}
for (const v of ['star', 'moon']) {
  mem[v] = (await call('GET', `${V[v]}/api/members`)).data
  perf[v] = (await call('GET', `${V[v]}/api/performances`)).data.find((p) => p.code === 'PERF-001')
}
const id = (v, uid) => mem[v].find((m) => m.ftUid === uid).id

// 암표상: 좌석 화면 없이 바로 구매, 보안문자는 풀이 대행
async function botBuy(v) {
  const url = `${V[v]}/api/performances/${perf[v].id}/purchase`
  let r = await call('POST', url, { memberId: id(v, 'ft-u-bot') })
  if (r.status === 403 && r.data?.captchaRequired) {
    const c = (await call('GET', `${FT}/v1/captcha`)).data
    const a = (await call('GET', `${FT}/v1/demo/captcha/${c.id}`)).data.answer
    r = await call('POST', url, { memberId: id(v, 'ft-u-bot'), captchaId: c.id, captchaAnswer: a })
  }
  return r
}
// 정상 이용자: 좌석 화면을 보고 사람 속도로 구매
async function humanBuy(v, uid) {
  await call('POST', `${V[v]}/api/performances/${perf[v].id}/view`, { memberId: id(v, uid) })
  await sleep(700)
  return call('POST', `${V[v]}/api/performances/${perf[v].id}/purchase`, { memberId: id(v, uid) })
}

console.log('--- 예매 단계: 암표상이 일부 통과 ---')
const bought = []
for (const v of ['star', 'moon', 'star', 'moon', 'star']) {
  const r = await botBuy(v)
  if (r.status === 200) bought.push({ v, ticket: r.data.ticket })
}
check('암표상이 두 예매처에서 표 2장 확보 (예매 단계에서는 다 못 막음)', bought.length === 2, `${bought.length}장`)
const minji = await humanBuy('star', 'ft-u-001')
check('정상 이용자 민지 구매', minji.status === 200)

console.log('--- 사후 검토 ---')
let review = (await call('GET', `${FT}/v1/risk/review?performanceCode=PERF-001`)).data
const bot = review.suspects.find((s) => s.uid === 'ft-u-bot')
check('암표상이 의심 목록에 오름', !!bot, bot?.flags.join(', '))
check('암표상이 가진 표 2장이 함께 보임', bot?.heldTickets.length === 2, JSON.stringify(bot?.heldTickets))
check('정상 이용자는 의심 목록에 없음', !review.suspects.some((s) => s.uid === 'ft-u-001'))

console.log('--- 취소 요청 ---')
let r = await call('POST', `${FT}/v1/risk/review/cancel`, { performanceCode: 'PERF-001', uids: ['ft-u-bot', 'ft-u-001'] })
check('암표상 표 2장만 취소 (의심 목록에 없는 민지는 무시)', r.status === 200 && r.data.length === 2 && r.data.every((x) => x.result === 'CANCELLED' && x.uid === 'ft-u-bot'), JSON.stringify(r.data.map((x) => x.result)))
check('취소 근거가 기록됨', r.data.every((x) => x.reason && x.reason.length > 0), r.data[0]?.reason)

for (const b of bought) {
  const t = (await call('GET', `${V[b.v]}/api/members/${id(b.v, 'ft-u-bot')}/tickets`)).data.find((x) => x.id === b.ticket.id)
  check(`${b.v} 표 상태: 부정 구매로 취소`, t.status === 'FRAUD_CANCELLED' && !!t.cancelReason, t.status)
  const g = await call('POST', `${FT}/v1/verify`, { qr: b.ticket.qr })
  check(`${b.v} 표 입장 거절`, g.data.admitted === false && g.data.result === 'FRAUD_CANCELLED', g.data.result)
}
const q = (await call('GET', `${FT}/v1/quota?uid=ft-u-bot&performanceCode=PERF-001`)).data
check('취소된 표만큼 암표상 구매 한도도 반환', q.used === 0, JSON.stringify(q))

r = await call('POST', `${FT}/v1/risk/review/cancel`, { performanceCode: 'PERF-001', uids: ['ft-u-bot'] })
check('다시 요청해도 이미 취소된 표는 또 취소하지 않음', r.status === 200 && r.data.length === 0, `${r.data.length}건`)
const hist = (await call('GET', `${FT}/v1/risk/review/cancellations?performanceCode=PERF-001`)).data
check('취소 기록 2건', hist.length === 2, `${hist.length}건`)

const g = await call('POST', `${FT}/v1/verify`, { qr: minji.data.ticket.qr })
check('정상 이용자 표는 그대로 입장 승인', g.data.admitted === true, g.data.result)

console.log('--- 보안 ---')
r = await scall('POST', `${STAR}/ft/tickets/${minji.data.ticket.id}/fraud-cancel`, { reason: '공격' }, { idem: 'atk-fraud' })
check('서명 없이 예매처에 직접 취소 요청 → 거절', r.status === 401, `${r.status}`)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
