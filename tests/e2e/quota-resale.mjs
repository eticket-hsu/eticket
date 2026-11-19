// Scenario check for confirmed rules A (공통 구매 한도) and B (공식 재판매).
import { call as scall, AS } from './sign.mjs'
import { localDateTime } from './time.mjs'
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

for (const u of [`${FT}/v1/resales`, `${STAR}/api/info`, `${MOON}/api/info`])
  for (let i = 0; i < 60; i++) { try { if ((await fetch(u)).ok) break } catch {} await sleep(1000) }

const mem = {}, perf = {}
for (const v of ['star', 'moon']) {
  mem[v] = (await call('GET', `${V[v]}/api/members`)).data
  perf[v] = (await call('GET', `${V[v]}/api/performances`)).data.find((p) => p.code === 'PERF-001')
}
const id = (v, uid) => mem[v].find((m) => m.ftUid === uid).id
// 실제 사용자처럼: 좌석 화면을 먼저 열고(반응 시간), 보안문자를 요구하면 풀어서 다시 요청
async function buyIn(v, perfId, memberId, seat) {
  await call('POST', `${V[v]}/api/performances/${perfId}/view`, { memberId })
  await sleep(600)
  let r = await call('POST', `${V[v]}/api/performances/${perfId}/purchase`, { memberId, seat })
  if (r.status === 403 && r.data?.captchaRequired) {
    const c = (await call('GET', `${FT}/v1/captcha`)).data
    const a = (await call('GET', `${FT}/v1/demo/captcha/${c.id}`)).data.answer
    r = await call('POST', `${V[v]}/api/performances/${perfId}/purchase`, { memberId, seat, captchaId: c.id, captchaAnswer: a })
  }
  return r
}
const buy = (v, uid, seat) => buyIn(v, perf[v].id, id(v, uid), seat)
const quota = async (uid) => (await call('GET', `${FT}/v1/quota?uid=${uid}&performanceCode=PERF-001`)).data

console.log('--- A. 공통 구매 한도 (PERF-001 1인 2매) ---')
let r = await buy('star', 'ft-u-001')
check('민지 별티켓 1매', r.status === 200)
const minjiStar = r.data.ticket
r = await buy('moon', 'ft-u-001')
check('민지 달티켓 1매 (합산 2/2)', r.status === 200)
r = await buy('star', 'ft-u-001')
check('민지 별티켓 3번째 → 공통 한도 초과', r.status === 409 && r.data.quotaExceeded, `${r.status} ${r.data?.message}`)
r = await buy('moon', 'ft-u-001')
check('민지 달티켓 3번째 → 공통 한도 초과', r.status === 409 && r.data.quotaExceeded)
let q = await quota('ft-u-001')
check('민지 사용량 2/2', q.used === 2 && q.limit === 2, JSON.stringify(q))

const burst = await Promise.all([
  ...[1, 2, 3, 4, 5].map(() => buy('star', 'ft-u-003')),
  ...[1, 2, 3, 4, 5].map(() => buy('moon', 'ft-u-003')),
])
const ok = burst.filter((x) => x.status === 200).length
check('서연 별티켓5+달티켓5 동시 요청 → 정확히 2매만 성공', ok === 2, `성공 ${ok}건`)
q = await quota('ft-u-003')
check('서연 사용량 2/2 (실패한 예약은 반환됨)', q.used === 2, JSON.stringify(q))

console.log('--- B. 공식 재판매 ---')
r = await call('POST', `${STAR}/api/tickets/${minjiStar.id}/resale`, { memberId: id('star', 'ft-u-001'), price: 120000 })
check('정가 초과 가격 (예매처 화면 경로) 거절', r.status === 409, `${r.status}`)
r = await scall('POST', `${FT}/v1/resales`, { vendorId: 'star', vendorTicketId: minjiStar.id, performanceCode: 'PERF-001', sellerUid: 'ft-u-001', price: 500000, startsAt: minjiStar.startsAt }, { signAs: AS.star })
check('정가 초과 가격 (FairTicket API 직접) 거절', r.status === 409, `${r.status} ${r.data?.error}`)
r = await call('POST', `${STAR}/api/tickets/${minjiStar.id}/resale`, { memberId: id('star', 'ft-u-001'), price: 80000 })
check('정가보다 낮은 80,000원 재판매 등록', r.data?.status === 'LISTED' && r.data.price === 80000 && r.data.fee === 0, `${r.data?.status} fee=${r.data?.fee}`)
const L1 = r.data.id
check('발행처 정책 없으면 기본 결제 기한 30분', r.data.paymentMinutes === 30)
r = await call('POST', `${FT}/v1/verify`, { qr: minjiStar.qr })
check('재판매 중 기존 QR 거절', r.data.result === 'RESALE_LOCKED')

r = await call('POST', `${FT}/v1/resales/${L1}/entries`, { buyerUid: 'ft-u-003' })
check('한도 꽉 찬 서연 응모 거절', r.status === 409, r.data?.error)
r = await call('POST', `${FT}/v1/resales/${L1}/entries`, { buyerUid: 'ft-u-001' })
check('판매자 본인 응모 거절', r.status === 409)
r = await call('POST', `${FT}/v1/resales/${L1}/entries`, { buyerUid: 'ft-u-002' })
check('지수 응모', r.status === 200)
r = await call('POST', `${FT}/v1/resales/${L1}/draw`)
check('추첨 → 지수 당첨, 결제 마감 시각 설정', r.data.status === 'DRAWN' && r.data.winnerUid === 'ft-u-002' && !!r.data.paymentDeadline)
r = await call('POST', `${FT}/v1/resales/${L1}/pay`, { buyerUid: 'ft-u-002' })
check('결제 → 재발급 → 정산', r.data.status === 'SETTLED', r.data.status)

const jisooT = (await call('GET', `${STAR}/api/members/${id('star', 'ft-u-002')}/tickets`)).data.find((t) => t.id === minjiStar.id)
check('지수 티켓 취득가 80,000원, 재판매 상한 80,000원', jisooT.acquiredPrice === 80000 && jisooT.resalePriceCap === 80000)
q = await quota('ft-u-002')
check('지수 공통 한도 1매 (재판매 구매 포함)', q.used === 1, JSON.stringify(q))
q = await quota('ft-u-001')
check('민지 재발급 완료로 1매 반환 (2→1)', q.used === 1, JSON.stringify(q))
r = await buy('star', 'ft-u-001')
check('민지 반환된 한도로 다시 1매 구매 가능', r.status === 200)

r = await call('POST', `${STAR}/api/tickets/${jisooT.id}/resale`, { memberId: id('star', 'ft-u-002'), price: 99000 })
check('차익 거래 차단: 80,000원에 산 티켓을 99,000원에 재판매 거절', r.status === 409)
r = await call('POST', `${STAR}/api/tickets/${jisooT.id}/resale`, { memberId: id('star', 'ft-u-002'), price: 80000 })
check('재재판매 허용: 취득가 80,000원 이하로 등록', r.data?.status === 'LISTED')
await call('DELETE', `${FT}/v1/resales/${r.data.id}`)

r = await call('POST', `${FT}/v1/verify`, { qr: jisooT.qr })
check('지수 새 QR 입장 승인', r.data.admitted === true, r.data.result)
r = await call('POST', `${FT}/v1/verify`, { qr: minjiStar.qr })
check('민지 옛 QR 거절', r.data.result === 'OUTDATED_VERSION')

console.log('--- 재발급 실패 시 한도 반환 ---')
const moonT = (await call('GET', `${MOON}/api/members/${id('moon', 'ft-u-001')}/tickets`)).data[0]
r = await call('POST', `${MOON}/api/tickets/${moonT.id}/resale`, { memberId: id('moon', 'ft-u-001') })
const L2 = r.data.id
await call('POST', `${FT}/v1/resales/${L2}/entries`, { buyerUid: 'ft-u-002' })
await call('POST', `${FT}/v1/resales/${L2}/draw`)
await call('POST', `${FT}/v1/demo/fail-reissue`, { enabled: true })
r = await call('POST', `${FT}/v1/resales/${L2}/pay`, { buyerUid: 'ft-u-002' })
await call('POST', `${FT}/v1/demo/fail-reissue`, { enabled: false })
check('재발급 실패 → REISSUE_FAILED', r.data.status === 'REISSUE_FAILED')
q = await quota('ft-u-002')
check('실패 시 지수 한도 반환 (1매 유지)', q.used === 1, JSON.stringify(q))

console.log('--- 기한 ---')
const moonPerf3 = (await call('GET', `${MOON}/api/performances`)).data.find((p) => p.code === 'PERF-003')
r = await buyIn('moon', moonPerf3.id, id('moon', 'ft-u-003'))
r = await call('POST', `${MOON}/api/tickets/${r.data.ticket.id}/resale`, { memberId: id('moon', 'ft-u-003') })
check('발행처가 정한 결제 기한 15분 적용 (달티켓 PERF-003)', r.data?.paymentMinutes === 15, `${r.data?.paymentMinutes}`)
const soon = localDateTime(Date.now() + 2 * 3600e3)
r = await scall('POST', `${FT}/v1/resales`, { vendorId: 'star', vendorTicketId: 1, performanceCode: 'PERF-001', sellerUid: 'x', price: 1, startsAt: soon }, { signAs: AS.star })
check('공연 2시간 전 신청 거절 (기본 신청 마감)', r.status === 409 && /마감/.test(r.data?.error), r.data?.error)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
