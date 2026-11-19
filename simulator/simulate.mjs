// 트래픽 시뮬레이터: 정상 사용자와 매크로 사용자의 구매 패턴을 만든다.
// 실행: node simulator/simulate.mjs   (서버 3개가 켜져 있어야 함)
//
// 매크로봇(ft-u-bot)은 별티켓·달티켓에 동시에, 일정한 간격으로, 여러 계정과 같은 IP로 요청한다.
// → FairTicket 위험 분석이 HIGH 와 근거를 내고, 예매처가 구매를 보류하는 것을 보여준다.

const FT = process.env.FT_URL ?? 'http://localhost:8080'
const VENDOR = { star: 'http://localhost:8081', moon: 'http://localhost:8082' }
const PERF = 'PERF-001'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function event(vendorId, uid, result, ip, reactionMs) {
  const res = await fetch(`${FT}/v1/demo/purchase-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendorId, uid, performanceCode: PERF, action: 'PURCHASE', result, ip, reactionMs }),
  })
  if (!res.ok) throw new Error(`이벤트 전송 실패: ${res.status}`)
}

async function risk(uid) {
  const res = await fetch(`${FT}/v1/demo/risk?uid=${uid}&performanceCode=${PERF}`)
  return res.json()
}

async function normalUsers() {
  console.log('▶ 정상 사용자: 서연이 별티켓에서 몇 초 간격으로 2번 시도')
  await event('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3')
  await sleep(1500)
  await event('star', 'ft-u-003', 'ATTEMPT', '10.0.0.3')
}

async function macroBot() {
  console.log('▶ 매크로봇: 30회, 20ms 간격, 별티켓·달티켓 번갈아, 같은 IP 에서 가짜 계정 5개 섞기')
  for (let i = 0; i < 30; i++) {
    const vendor = i % 2 === 0 ? 'star' : 'moon'
    await event(vendor, 'ft-u-bot', 'ATTEMPT', '203.0.113.7', 120)
    if (i % 5 === 0) await event(vendor, 'ft-u-bot', 'FAIL', '203.0.113.7')
    if (i % 6 === 0) await event(vendor, 'ft-u-bot', 'QUOTA', '203.0.113.7')
    if (i < 5) await event(vendor, `ft-u-sock-${i}`, 'ATTEMPT', '203.0.113.7')
    await sleep(20)
  }
}

async function botTriesToBuy() {
  // 별티켓 회원 목록에서 매크로봇의 회원 번호를 찾아 실제 구매를 시도한다
  const members = await (await fetch(`${VENDOR.star}/api/members`)).json()
  const bot = members.find((m) => m.ftUid === 'ft-u-bot')
  const perf = (await (await fetch(`${VENDOR.star}/api/performances`)).json())[0]
  const res = await fetch(`${VENDOR.star}/api/performances/${perf.id}/purchase`, {
    method: 'POST',
    // 기기 정보가 없으면 예매처가 바로 거절하므로, 위험 등급에 따른 보류를 보려고 기기 ID 를 붙인다
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'sim-bot-device' },
    body: JSON.stringify({ memberId: bot.id }),
  })
  console.log(`▶ 매크로봇 별티켓 구매 시도 → HTTP ${res.status}`, (await res.json()).message ?? '')
}

await normalUsers()
await macroBot()
for (const uid of ['ft-u-003', 'ft-u-bot']) {
  const r = await risk(uid)
  console.log(`\n[${uid}] ${r.riskLevel} (${r.score}점)`)
  for (const reason of r.reasons) console.log(`  +${reason.points} ${reason.rule}: ${reason.detail}`)
}
await botTriesToBuy()
