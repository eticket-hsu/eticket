// 비교 실험: "예매처마다 따로 볼 때" vs "FairTicket 이 합쳐 볼 때"
//
// 가짜 사용자 110명(정상 90 + 매크로 20)의 예매 기록을 별티켓·달티켓 이름으로 FairTicket 에 보내고,
// 똑같은 위험 규칙으로 두 번 판단한다.
//   - 따로: 그 예매처 기록만 보고 판단 (/v1/demo/risk?vendorId=...)  → 한 곳이라도 잡으면 잡은 것으로 침
//   - 합쳐: 두 예매처 기록을 합쳐 판단 (/v1/demo/risk)
// 예매처가 실제로 하듯 예매 요청마다 위험 등급을 묻고, 끝나면 사후 검토도 두 방식으로 돌린다.
//
// 실행 (FairTicket 서버만 켜져 있으면 됨, 실험마다 서버를 새로 띄우는 것을 권장):
//   node simulator/experiment.mjs --seed 1        # 실험 1회 (약 1분), 결과는 simulator/out/ 에 저장
//   node simulator/experiment.mjs --report        # 저장된 실험들을 모아 표로 출력
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FT = process.env.FT_URL ?? 'http://localhost:8080'
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out')
const VENDORS = ['star', 'moon']
const LEVEL = { LOW: 0, MEDIUM: 1, HIGH: 2 }
const args = process.argv.slice(2)
const argOf = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}

// ---------------------------------------------------------------- 사용자 집단
// 정상 90명: 일반 55(그중 10명은 두 사이트 모두 시도) · PC방 15 · 손 빠른 사람 10 · VPN·해외 10
// 매크로 20명: 단순 매크로 6 · 분산 매크로 8 · 작업장 6
export const GROUPS = [
  { id: 'normal-one', kind: 'normal', label: '일반 (한 사이트)', count: 45 },
  { id: 'normal-both', kind: 'normal', label: '일반 (두 사이트 모두 시도)', count: 10 },
  { id: 'pcbang', kind: 'normal', label: 'PC방 손님', count: 15 },
  { id: 'fast', kind: 'normal', label: '손 빠른 사람', count: 10 },
  { id: 'vpn-abroad', kind: 'normal', label: 'VPN 사용자·해외 거주자', count: 10 },
  { id: 'macro-simple', kind: 'macro', label: '단순 매크로 (한 사이트, 기계적)', count: 6 },
  { id: 'macro-split', kind: 'macro', label: '분산 매크로 (두 사이트에 나눠 기준 회피)', count: 8 },
  { id: 'macro-farm', kind: 'macro', label: '작업장 (한 PC로 여러 계정, 사람처럼 천천히)', count: 6 },
]

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 사용자마다 예매 요청 계획을 만든다. step = { vendor, gapMs(이전 요청부터), reactionMs, outcome } */
function buildUsers(seed) {
  const r = rng(seed)
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1))
  const pick = (xs) => xs[Math.floor(r() * xs.length)]
  const users = []
  let n = 0
  const add = (group, u) => users.push({ uid: `exp${seed}-${group.id}-${String(++n).padStart(3, '0')}`, group: group.id, kind: group.kind, tz: 'Asia/Seoul', ...u })
  const homeIp = () => `10.${int(1, 250)}.${int(1, 250)}.${int(1, 250)}`
  // 사람: 이전 결과를 보고 다시 누르므로 간격이 들쭉날쭉, 마지막에 성공
  const humanSteps = (vendors, attempts, gap, reaction) =>
    Array.from({ length: attempts }, (_, i) => ({
      vendor: vendors[i % vendors.length],
      gapMs: i === 0 ? 0 : int(...gap),
      reactionMs: int(...reaction),
      outcome: i === attempts - 1 ? 'SUCCESS' : 'FAIL',
    }))

  for (const g of GROUPS) {
    for (let i = 0; i < g.count; i++) {
      const v = pick(VENDORS)
      if (g.id === 'normal-one') {
        add(g, { ip: homeIp(), device: `d${n}`, steps: humanSteps([v], int(1, 3), [2000, 6000], [1500, 12000]) })
      } else if (g.id === 'normal-both') {
        // 표를 꼭 구하려고 별티켓·달티켓 둘 다 들어가 보는 팬
        add(g, { ip: homeIp(), device: `d${n}`, steps: humanSteps([v, v === 'star' ? 'moon' : 'star'], int(2, 3), [2000, 6000], [1500, 12000]) })
      } else if (g.id === 'pcbang') {
        // PC방 3곳에 5명씩: 같은 IP, 다른 PC
        add(g, { ip: `10.200.200.${Math.floor(i / 5) + 1}`, device: `d${n}`, steps: humanSteps([v], int(1, 3), [2000, 6000], [1000, 6000]) })
      } else if (g.id === 'fast') {
        // 손이 빨라 0.5초 안에 누르기도 함. 3명은 두 사이트 모두 시도
        const vs = i < 3 ? [v, v === 'star' ? 'moon' : 'star'] : [v]
        add(g, { ip: homeIp(), device: `d${n}`, steps: humanSteps(vs, int(3, 5), [800, 2500], [380, 900]) })
      } else if (g.id === 'vpn-abroad') {
        // 5명: 한국에서 VPN 을 켜 둔 사람 (시계는 한국) / 5명: 해외 거주자 (시계도 해외)
        const vpn = i < 5
        add(g, {
          ip: vpn ? `198.18.${int(1, 250)}.${int(1, 250)}` : `203.0.113.${int(1, 250)}`,
          tz: vpn ? 'Asia/Seoul' : 'America/Los_Angeles',
          device: `d${n}`,
          steps: humanSteps([v], int(1, 3), [2000, 6000], [1500, 12000]),
        })
      } else if (g.id === 'macro-simple') {
        // 한 사이트에서 250ms 마다 기계적으로 25번. 절반은 클라우드 서버에서, 절반은 좌석 화면도 안 거침
        let wins = 0
        const steps = Array.from({ length: 25 }, (_, k) => {
          const won = wins < 2 && r() < 0.15
          if (won) wins++
          return {
            vendor: v,
            gapMs: k === 0 ? 0 : 250 + int(-4, 4),
            reactionMs: i % 2 === 0 ? -1 : int(60, 200),
            outcome: won ? 'SUCCESS' : wins >= 2 ? 'QUOTA' : 'FAIL',
          }
        })
        add(g, { ip: i < 3 ? `192.0.2.${int(1, 250)}` : homeIp(), device: `d${n}`, steps })
      } else if (g.id === 'macro-split') {
        // 사이트마다의 기준을 피하도록 설계: 반응 0.55초 이상, 간격 불규칙, 한 사이트에서 실패 4회·한도 2회까지만
        const order = ['FAIL', 'FAIL', 'SUCCESS', 'FAIL', 'SUCCESS', 'FAIL', 'QUOTA', 'QUOTA']
        const other = v === 'star' ? 'moon' : 'star'
        const steps = []
        for (let k = 0; k < 16; k++) {
          steps.push({ vendor: k % 2 === 0 ? v : other, gapMs: k === 0 ? 0 : int(1200, 3200), reactionMs: int(550, 850), outcome: order[Math.floor(k / 2)] })
        }
        add(g, { ip: homeIp(), device: `d${n}`, steps })
      } else if (g.id === 'macro-farm') {
        // 한 PC(같은 IP·같은 브라우저)로 계정 6개: 3개는 별티켓, 3개는 달티켓. 각 계정은 사람처럼 천천히
        const site = i < 3 ? 'star' : 'moon'
        const order = ['FAIL', 'FAIL', 'SUCCESS', 'FAIL', 'SUCCESS', 'QUOTA']
        const steps = order.map((o, k) => ({ vendor: site, gapMs: k === 0 ? 0 : int(1000, 3000), reactionMs: int(600, 1200), outcome: o }))
        add(g, { ip: '10.250.250.1', device: 'farm-pc', steps })
      }
    }
  }
  // 시작 시각을 0~20초 사이로 흩뜨림 (모두 같은 10분 창 안에 들어감)
  for (const u of users) u.startMs = int(0, 20000)
  return users
}

// ---------------------------------------------------------------- 실행
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

async function post(body) {
  const res = await fetch(`${FT}/v1/demo/purchase-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`이벤트 전송 실패 ${res.status}: ${await res.text()}`)
}

async function getJson(path) {
  const res = await fetch(`${FT}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

const riskOf = (uid, perf, vendorId) =>
  getJson(`/v1/demo/risk?uid=${encodeURIComponent(uid)}&performanceCode=${perf}${vendorId ? `&vendorId=${vendorId}` : ''}`)

async function runUser(u, perf, t0) {
  // 판정 기록: 예매 요청마다 예매처가 묻는 위험 등급 (따로 = 그 요청을 받은 예매처 기록만)
  u.checks = []
  const pending = []
  let at = t0 + u.startMs
  for (let k = 0; k < u.steps.length; k++) {
    const s = u.steps[k]
    at += s.gapMs
    const wait = at - Date.now()
    if (wait > 0) await sleep(wait)
    const base = { vendorId: s.vendor, uid: u.uid, performanceCode: perf, action: 'PURCHASE', ip: u.ip, clientTimezone: u.tz, deviceHash: u.device }
    await post({ ...base, result: 'ATTEMPT', reactionMs: s.reactionMs })
    const sentAt = Date.now()
    // 다음 요청 시각을 밀지 않도록 조회와 결과 전송은 기다리지 않고 진행
    pending.push(
      Promise.all([riskOf(u.uid, perf), riskOf(u.uid, perf, s.vendor)]).then(([all, own]) => {
        u.checks.push({ k: k + 1, sec: (sentAt - (t0 + u.startMs)) / 1000, merged: all.riskLevel, mergedScore: all.score, mergedRules: all.reasons.map((x) => x.rule), alone: own.riskLevel, aloneScore: own.score, aloneRules: own.reasons.map((x) => x.rule) })
      }),
      post({ ...base, result: s.outcome }),
    )
  }
  await Promise.all(pending)
  u.checks.sort((a, b) => a.k - b.k)
}

async function experiment(seed) {
  const perf = `EXP-${seed}`
  const users = buildUsers(seed)
  console.log(`실험 ${seed}: 사용자 ${users.length}명, 공연 ${perf} — 약 1분 걸립니다`)
  const t0 = Date.now() + 500
  await Promise.all(users.map((u) => runUser(u, perf, t0)))

  // 사후 검토: 합쳐서 / 예매처마다 따로 (한 곳이라도 의심 목록에 올리면 잡은 것)
  const merged = await getJson(`/v1/demo/review?performanceCode=${perf}`)
  const alone = await Promise.all(VENDORS.map((v) => getJson(`/v1/demo/review?performanceCode=${perf}&vendorId=${v}`)))
  const mergedSuspects = new Set(merged.suspects.map((s) => s.uid))
  const aloneSuspects = new Set(alone.flatMap((rv) => rv.suspects.map((s) => s.uid)))
  const mergedClustered = new Set(merged.clusters.flatMap((c) => c.uids))
  const aloneClustered = new Set(alone.flatMap((rv) => rv.clusters.flatMap((c) => c.uids)))

  const rows = users.map((u) => {
    const first = (field, min) => u.checks.find((c) => LEVEL[c[field]] >= min)
    const peak = (field) => Math.max(...u.checks.map((c) => LEVEL[c[field]]))
    const fm = first('merged', 1), fa = first('alone', 1)
    return {
      uid: u.uid, group: u.group, kind: u.kind, attempts: u.steps.length,
      merged: { peak: peak('merged'), peakScore: Math.max(...u.checks.map((c) => c.mergedScore)), firstK: fm?.k ?? null, firstSec: fm?.sec ?? null, review: mergedSuspects.has(u.uid) || mergedClustered.has(u.uid), rules: [...new Set(u.checks.flatMap((c) => c.mergedRules))] },
      alone: { peak: peak('alone'), peakScore: Math.max(...u.checks.map((c) => c.aloneScore)), firstK: fa?.k ?? null, firstSec: fa?.sec ?? null, review: aloneSuspects.has(u.uid) || aloneClustered.has(u.uid), rules: [...new Set(u.checks.flatMap((c) => c.aloneRules))] },
    }
  })
  mkdirSync(OUT, { recursive: true })
  const file = join(OUT, `experiment-seed${seed}.json`)
  writeFileSync(file, JSON.stringify({ seed, perf, ranAt: new Date().toISOString(), rows }, null, 2))
  console.log(`저장: ${file}`)
  return rows
}

// ---------------------------------------------------------------- 집계
const pct = (a, b) => (b === 0 ? '-' : `${Math.round((a / b) * 1000) / 10}%`)
const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function summarize(rows, runs) {
  const lines = []
  const macros = rows.filter((r) => r.kind === 'macro'), normals = rows.filter((r) => r.kind === 'normal')
  const count = (xs, mode, test) => xs.filter((r) => test(r[mode])).length
  lines.push(`실험 ${runs}회, 사용자 ${rows.length / runs}명 × ${runs} (정상 ${normals.length / runs}, 매크로 ${macros.length / runs})`, '')
  lines.push('| 지표 | 예매처마다 따로 | FairTicket 합쳐서 |', '| --- | --- | --- |')
  const row = (name, f) => lines.push(`| ${name} | ${f('alone')} | ${f('merged')} |`)
  row('매크로 탐지율 (보안문자 이상)', (m) => pct(count(macros, m, (x) => x.peak >= 1), macros.length))
  row('매크로 고위험 판정 (본인인증까지)', (m) => pct(count(macros, m, (x) => x.peak >= 2), macros.length))
  row('정상인 오탐률 (보안문자가 뜬 비율)', (m) => pct(count(normals, m, (x) => x.peak >= 1), normals.length))
  row('정상인 고위험 오탐 (본인인증까지)', (m) => pct(count(normals, m, (x) => x.peak >= 2), normals.length))
  // 속도는 두 방식 모두 잡은 매크로끼리만 비교한다 (한쪽만 잡은 매크로가 섞이면 비교가 틀어짐)
  const both = macros.filter((r) => r.alone.firstK != null && r.merged.firstK != null)
  row(`잡힐 때까지 예매 요청 수 (둘 다 잡은 ${both.length / runs}명, 중앙값)`, (m) => { const v = median(both.map((r) => r[m].firstK)); return v == null ? '-' : `${v}번째` })
  row(`잡힐 때까지 걸린 시간 (둘 다 잡은 ${both.length / runs}명, 중앙값)`, (m) => { const v = median(both.map((r) => r[m].firstSec)); return v == null ? '-' : `${v.toFixed(1)}초` })
  row('사후 검토로 찾은 매크로', (m) => pct(count(macros, m, (x) => x.review), macros.length))
  row('사후 검토에 잘못 오른 정상인', (m) => pct(count(normals, m, (x) => x.review), normals.length))
  row('실시간 + 사후 검토 합친 매크로 탐지율', (m) => pct(count(macros, m, (x) => x.peak >= 1 || x.review), macros.length))
  lines.push('', '**집단별** (실시간 보안문자 이상 / 사후 검토, 따로 → 합쳐서)', '', '| 집단 | 인원 | 실시간 따로 | 실시간 합쳐서 | 사후 검토 따로 | 사후 검토 합쳐서 |', '| --- | --- | --- | --- | --- | --- |')
  for (const g of GROUPS) {
    const xs = rows.filter((r) => r.group === g.id)
    if (!xs.length) continue
    lines.push(`| ${g.label} | ${xs.length / runs} | ${pct(count(xs, 'alone', (x) => x.peak >= 1), xs.length)} | ${pct(count(xs, 'merged', (x) => x.peak >= 1), xs.length)} | ${pct(count(xs, 'alone', (x) => x.review), xs.length)} | ${pct(count(xs, 'merged', (x) => x.review), xs.length)} |`)
  }
  lines.push('', '**매크로가 처음 잡힌 때** (보안문자 이상, 중앙값: 따로 → 합쳐서)', '', '| 집단 | 따로 | 합쳐서 |', '| --- | --- | --- |')
  const when = (xs, m) => { const ks = xs.map((r) => r[m]).filter((x) => x.firstK != null); return ks.length ? `${median(ks.map((x) => x.firstK))}번째 요청 (${median(ks.map((x) => x.firstSec)).toFixed(1)}초)` : '못 잡음' }
  for (const g of GROUPS.filter((g) => g.kind === 'macro')) {
    const xs = rows.filter((r) => r.group === g.id)
    if (xs.length) lines.push(`| ${g.label} | ${when(xs, 'alone')} | ${when(xs, 'merged')} |`)
  }
  // 보안문자 기준 점수를 바꾸면? (각 사용자가 받은 가장 높은 점수로 다시 계산)
  if (rows[0].merged.peakScore !== undefined) {
    lines.push('', '**보안문자 기준 점수를 바꾸면** (합쳐서 볼 때, 매크로 탐지율 / 정상인 오탐률)', '', '| 기준 | 매크로 탐지율 | 정상인 오탐률 | 따로 볼 때 매크로 탐지율 |', '| --- | --- | --- | --- |')
    for (const t of [25, 30, 35, 40, 45, 50, 60]) {
      lines.push(`| ${t}점${t === 40 ? ' (지금)' : ''} | ${pct(macros.filter((r) => r.merged.peakScore >= t).length, macros.length)} | ${pct(normals.filter((r) => r.merged.peakScore >= t).length, normals.length)} | ${pct(macros.filter((r) => r.alone.peakScore >= t).length, macros.length)} |`)
    }
  }
  lines.push('', '**집단별로 걸린 규칙** (합쳐서 볼 때)', '')
  for (const g of GROUPS) {
    const xs = rows.filter((r) => r.group === g.id)
    const tally = {}
    for (const r of xs) for (const rule of r.merged.rules) tally[rule] = (tally[rule] ?? 0) + 1
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, xs.length)}`).join(', ')
    lines.push(`- ${g.label}: ${top || '없음'}`)
  }
  return lines.join('\n')
}

if (args.includes('--report')) {
  const files = readdirSync(OUT).filter((f) => f.startsWith('experiment-seed') && f.endsWith('.json'))
  const runs = files.map((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')))
  console.log(summarize(runs.flatMap((x) => x.rows), runs.length))
} else {
  const seed = Number(argOf('--seed', '1'))
  const rows = await experiment(seed)
  console.log('\n' + summarize(rows, 1))
}
