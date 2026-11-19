// IP 검사: 해외·VPN·데이터센터 IP와 브라우저 시간대 불일치
// 시연용 대역은 fairticket-server/src/main/resources/ip-ranges.csv 참고
const FT = 'http://localhost:8080', STAR = 'http://localhost:8081'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(method, url, body, headers = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) })
  const t = await res.text()
  let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { status: res.status, data }
}
let fails = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!cond) fails++ }

const PERF = 'PERF-001'
const event = (uid, ip, clientTimezone) =>
  call('POST', `${FT}/v1/demo/purchase-events`, { vendorId: 'star', uid, performanceCode: PERF, result: 'ATTEMPT', ip, reactionMs: 2500, clientTimezone })
const risk = async (uid) => (await call('GET', `${FT}/v1/demo/risk?uid=${uid}&performanceCode=${PERF}`)).data
const rules = (r) => r.reasons.map((x) => x.rule)

console.log('--- IP 종류 판별 ---')
await event('ip-local', '10.0.0.7', 'Asia/Seoul')
let r = await risk('ip-local')
check('내부망·국내 IP: IP 신호 없음', r.reasons.length === 0, rules(r).join(','))

await event('ip-abroad-fan', '203.0.113.9', 'America/New_York')
r = await risk('ip-abroad-fan')
check('해외 거주 팬 (해외 IP + 해외 시간대): 해외 IP +10만, 정상', rules(r).join() === 'FOREIGN_IP' && r.riskLevel === 'LOW', `${rules(r)} ${r.score}`)

await event('ip-foreign-kst', '203.0.113.10', 'Asia/Seoul')
r = await risk('ip-foreign-kst')
check('해외 IP인데 브라우저는 한국 시간대: 시간대 불일치 추가', rules(r).includes('FOREIGN_IP') && rules(r).includes('TIMEZONE_MISMATCH'), `${rules(r)} ${r.score}`)

await event('ip-vpn', '198.18.3.4', 'Asia/Seoul')
r = await risk('ip-vpn')
check('VPN IP + 한국 시간대: VPN +25, 시간대 +15 → 주의', rules(r).includes('VPN_IP') && rules(r).includes('TIMEZONE_MISMATCH') && r.riskLevel === 'MEDIUM', `${rules(r)} ${r.score} ${r.riskLevel}`)

await event('ip-dc', '192.0.2.8', null)
r = await risk('ip-dc')
check('데이터센터 IP: +25, 시간대 정보 없으면 불일치는 안 셈', rules(r).join() === 'DATACENTER_IP', `${rules(r)} ${r.score}`)

const vpnReason = (await risk('ip-vpn')).reasons.find((x) => x.rule === 'VPN_IP')
check('근거 문구가 사람이 읽을 수 있게 나옴', vpnReason?.detail === 'VPN·프록시 IP에서 접속', vpnReason?.detail)

console.log('--- 예매처에서 실제 구매 (시연용 접속 위치) ---')
const mem = (await call('GET', `${STAR}/api/members`)).data
const id = (uid) => mem.find((m) => m.ftUid === uid).id
const perf = (await call('GET', `${STAR}/api/performances`)).data.find((p) => p.code === PERF)
async function buy(uid, headers, timezone = 'Asia/Seoul') {
  await call('POST', `${STAR}/api/performances/${perf.id}/view`, { memberId: id(uid) })
  await sleep(700)
  return call('POST', `${STAR}/api/performances/${perf.id}/purchase`, { memberId: id(uid), timezone }, headers)
}
r = await buy('ft-u-001', {})
check('국내에서 사람 속도로 구매 → 바로 구매', r.status === 200, `${r.status}`)
r = await buy('ft-u-002', { 'X-Demo-Client-Ip': '198.18.0.50' })
check('VPN으로 접속해 구매 → 보안문자 요구', r.status === 403 && r.data.captchaRequired === true, `${r.status} ${r.data?.level}`)
check('예매처 응답에 VPN 근거 포함', r.data?.risk?.reasons?.some((x) => x.rule === 'VPN_IP'), JSON.stringify(r.data?.risk?.reasons?.map((x) => x.rule)))
r = await buy('ft-u-003', { 'X-Demo-Client-Ip': 'evil.example.com' })
check('IP 형식이 아닌 값은 무시하고 정상 처리', r.status === 200, `${r.status}`)

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`)
process.exit(fails ? 1 : 0)
