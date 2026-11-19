// D묶음 21번: 멱등키
import { call as scall, AS } from './sign.mjs'
// 회원마다 다른 기기에서 접속하는 것처럼 (본문 memberId 나 주소의 회원 번호로 정함)
const e2eDevice = (url, body) => `e2e-${body?.memberId ?? String(url).match(/members\/(\d+)/)?.[1] ?? 'x'}`
const FT = 'http://localhost:8080', STAR = 'http://localhost:8081'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, url, body, headers = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Device-Id': e2eDevice(url, body), ...headers }, body: body && JSON.stringify(body) })
  const t = await res.text(); let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { status: res.status, data, replayed: res.headers.get('Idempotent-Replayed') === 'true' }
}
let fails = 0
const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!c) fails++ }
const mem = (await call('GET', `${STAR}/api/members`)).data
const id = (uid) => mem.find((m) => m.ftUid === uid).id
const perf = (await call('GET', `${STAR}/api/performances`)).data.find((p) => p.code === 'PERF-002')
async function buy(memberId) {
  await call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId }); await sleep(600)
  let r = await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId })
  if (r.status === 403 && r.data?.captchaRequired) {
    const c = (await call('GET', `${FT}/v1/captcha`)).data
    const a = (await call('GET', `${FT}/v1/demo/captcha/${c.id}`)).data.answer
    r = await call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId, captchaId: c.id, captchaAnswer: a })
  }
  return r.data.ticket
}

console.log('--- 예매처 직접: 키 규칙 ---')
const t1 = await buy(id('ft-u-003'))
let r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/lock`, {}, { signAs: AS.ftToStar })
check('키 없는 상태 변경 요청 거절 400', r.status === 400, JSON.stringify(r.data))
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/lock`, {}, { signAs: AS.ftToStar, idem: 'test-lock-1' })
check('첫 lock 처리', r.status === 200 && r.data.status === 'LOCKED' && !r.replayed)
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/lock`, {}, { signAs: AS.ftToStar, idem: 'test-lock-1' })
check('같은 키 재요청 → 저장된 응답, 다시 처리 안 함', r.status === 200 && r.replayed)
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/reissue`, { newOwnerFtUid: 'ft-u-002', acquiredPrice: 70000 }, { signAs: AS.ftToStar, idem: 'test-re-1' })
const v1 = r.data.issueVersion
check('재발급 1회차 처리', r.status === 200 && !r.replayed, `version ${v1}`)
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/reissue`, { newOwnerFtUid: 'ft-u-002', acquiredPrice: 70000 }, { signAs: AS.ftToStar, idem: 'test-re-1' })
check('재발급 같은 키 재시도 → 같은 결과, 버전 그대로', r.status === 200 && r.replayed && r.data.issueVersion === v1)
const now = (await scall('GET', `${STAR}/ft/tickets/${t1.id}`, undefined, { signAs: AS.ftToStar })).data
check('실제 티켓 버전도 한 번만 올라감', now.issueVersion === v1, `${now.issueVersion}`)
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/reissue`, { newOwnerFtUid: 'ft-u-001', acquiredPrice: 1 }, { signAs: AS.ftToStar, idem: 'test-re-1' })
check('같은 키로 다른 내용 → 422', r.status === 422, JSON.stringify(r.data))
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/reissue`, { newOwnerFtUid: 'ft-u-002', acquiredPrice: 70000 }, { signAs: AS.ftToStar, idem: 'test-re-2' })
check('새 키로 재발급 → 잠기지 않은 티켓이라 409 (원래 규칙대로)', r.status === 409)
r = await scall('POST', `${STAR}/ft/tickets/${t1.id}/reissue`, { newOwnerFtUid: 'ft-u-002', acquiredPrice: 70000 }, { signAs: AS.ftToStar, idem: 'test-re-2' })
check('실패 응답(4xx)도 같은 키면 같은 응답', r.status === 409 && r.replayed)
const conc = await Promise.all([1, 2, 3, 4, 5].map(() => scall('POST', `${STAR}/ft/payouts`, { listingId: 999, amount: 1 }, { signAs: AS.ftToStar, idem: 'test-pay-c' })))
const fresh = conc.filter((x) => x.status === 200 && !x.replayed).length
check('같은 키 동시 5건 → 실제 처리는 1건', fresh === 1, conc.map((x) => x.status + (x.replayed ? 'R' : '')).join(','))

console.log('--- 재판매 흐름: 재발급 응답 유실 ---')
const t2 = await buy(id('ft-u-001'))
r = await call('POST', `${STAR}/api/tickets/${t2.id}/resale`, { memberId: id('ft-u-001'), price: 77000 })
const L = r.data.id
await call('POST', `${FT}/v1/resales/${L}/entries`, { buyerUid: 'ft-u-002' })
await call('POST', `${FT}/v1/resales/${L}/draw`)
await call('POST', `${FT}/v1/demo/lose-reissue-response`, { enabled: true })
r = await call('POST', `${FT}/v1/resales/${L}/pay`, { buyerUid: 'ft-u-002' })
check('응답 유실에도 정산까지 완료 (REISSUE_FAILED 아님)', r.data.status === 'SETTLED', r.data.status)
const tk = (await scall('GET', `${STAR}/ft/tickets/${t2.id}`, undefined, { signAs: AS.ftToStar })).data
check('발급 버전 1번만 증가 (1→2)', tk.issueVersion === 2, `${tk.issueVersion}`)
check('소유자 지수', tk.ownerFtUid === 'ft-u-002' || mem.find((m) => m.id === tk.ownerId)?.ftUid === 'ft-u-002', JSON.stringify({ o: tk.ownerFtUid, id: tk.ownerId }))
const hist = (await call('GET', `${FT}/v1/resales/${L}`)).data
const notes = JSON.stringify(hist)
check('진행 기록에 응답 유실 → 재시도 → 저장된 결과 반환 남음', /응답 유실/.test(notes) && /저장된 결과 반환/.test(notes))
check('유실 스위치는 1회 후 자동 꺼짐', (await call('GET', `${FT}/v1/demo/lose-reissue-response`)).data.enabled === false)
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
