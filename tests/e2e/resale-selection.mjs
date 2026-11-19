// 재판매 구매자 선정 방식 (HYBRID: 공연 24시간 전까지 추첨, 그 뒤 선착순) + 신청 마감 6시간 전
import { call as scall, AS } from './sign.mjs'
import { localDateTime } from './time.mjs'
const FT = 'http://localhost:8080', STAR = 'http://localhost:8081'
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

const mem = (await call('GET', `${STAR}/api/members`)).data
const id = (uid) => mem.find((m) => m.ftUid === uid).id
const perfs = (await call('GET', `${STAR}/api/performances`)).data
const P1 = perfs.find((p) => p.code === 'PERF-001'), P5 = perfs.find((p) => p.code === 'PERF-005')
async function buy(perf, uid) {
  const memberId = id(uid)
  await call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId })
  await sleep(600)
  let r = await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId })
  if (r.status === 403 && r.data?.captchaRequired) {
    const c = (await call('GET', `${FT}/v1/captcha`)).data
    const a = (await call('GET', `${FT}/v1/demo/captcha/${c.id}`)).data.answer
    r = await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId, captchaId: c.id, captchaAnswer: a })
  }
  return r.data.ticket
}
const resell = async (ticket, uid, price) => (await call('POST', `${STAR}/api/tickets/${ticket.id}/resale`, { memberId: id(uid), price })).data
const owner = async (ticketId) => (await scall('GET', `${STAR}/ft/tickets/${ticketId}`, undefined, { signAs: AS.ftToStar })).data.ownerFtUid

console.log('--- 공연 24시간 이내: 처음부터 선착순 ---')
let t = await buy(P5, 'ft-u-003')
let L = await resell(t, 'ft-u-003', 60000)
check('12시간 뒤 공연도 신청 가능 (신청 마감 6시간 전)', L?.status === 'LISTED', JSON.stringify(L).slice(0, 120))
check('추첨 구간이 지나 바로 선착순', L.selectionPhase === 'FIRST_COME' && !!L.lotteryCloseAt)
let r = await call('POST', `${FT}/v1/resales/${L.id}/entries`, { buyerUid: 'ft-u-002' })
check('선착순 구간에서는 응모 불가', r.status === 409 && /선착순/.test(r.data?.error), r.data?.error)
r = await call('POST', `${FT}/v1/resales/${L.id}/buy-now`, { buyerUid: 'ft-u-003' })
check('판매자 본인은 구매 불가', r.status === 409, r.data?.error)
const race = await Promise.all(['ft-u-002', 'ft-u-001'].map((u) => call('POST', `${FT}/v1/resales/${L.id}/buy-now`, { buyerUid: u })))
const won = race.filter((x) => x.status === 200)
check('두 명이 동시에 바로 구매 → 정확히 1명만 성공', won.length === 1 && won[0].data.status === 'SETTLED', race.map((x) => x.status).join(','))
check('진 사람은 "방금 다른 사람이 구매" 안내', race.some((x) => x.status === 409 && /다른 사람/.test(x.data?.error)))
const winner = won[0].data.winnerUid
check('표 주인이 구매자로 바뀜', (await owner(t.id)) === winner, winner)

console.log('--- 공연 24시간 전보다 이전: 추첨 ---')
const t1 = await buy(P1, 'ft-u-001')
L = await resell(t1, 'ft-u-001', 90000)
check('30일 뒤 공연은 추첨 구간', L.selectionPhase === 'LOTTERY')
r = await call('POST', `${FT}/v1/resales/${L.id}/buy-now`, { buyerUid: 'ft-u-002' })
check('추첨 구간에서는 바로 구매 불가', r.status === 409 && /추첨/.test(r.data?.error), r.data?.error)
r = await call('POST', `${FT}/v1/resales/${L.id}/draw`)
check('추첨 마감에 응모자 없음 → 만료 대신 선착순 전환', r.data.status === 'LISTED' && r.data.selectionPhase === 'FIRST_COME', `${r.data.status} ${r.data.selectionPhase}`)
r = await call('POST', `${FT}/v1/resales/${L.id}/buy-now`, { buyerUid: 'ft-u-002' })
check('전환 후 바로 구매 → 정산까지 완료', r.data?.status === 'SETTLED', r.data?.status ?? r.data?.error)

console.log('--- 추첨 당첨자가 결제 안 하면 선착순으로 ---')
const t2 = await buy(P1, 'ft-u-003')
L = await resell(t2, 'ft-u-003', 99000)
await call('POST', `${FT}/v1/resales/${L.id}/entries`, { buyerUid: 'ft-u-001' })
r = await call('POST', `${FT}/v1/resales/${L.id}/draw`)
check('응모자 있으면 추첨 → 당첨', r.data.status === 'DRAWN' && r.data.winnerUid === 'ft-u-001')
r = await call('POST', `${FT}/v1/resales/${L.id}/forfeit`)
check('당첨자 결제 기한 초과, 남은 사람 없음 → 선착순 전환', r.data.status === 'LISTED' && r.data.selectionPhase === 'FIRST_COME' && !r.data.winnerUid, `${r.data.status} ${r.data.selectionPhase}`)
r = await call('POST', `${FT}/v1/resales/${L.id}/entries`, { buyerUid: 'ft-u-bot' })
check('전환 후에는 다시 응모 불가', r.status === 409)

console.log('--- 신청 마감 6시간 전 ---')
const in5h = localDateTime(Date.now() + 5 * 3600e3)
r = await scall('POST', `${FT}/v1/resales`, { vendorId: 'star', vendorTicketId: 9999, performanceCode: 'PERF-001', sellerUid: 'x', price: 1, startsAt: in5h }, { signAs: AS.star })
check('공연 5시간 전 신청 거절', r.status === 409 && /6시간/.test(r.data?.error), r.data?.error)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
