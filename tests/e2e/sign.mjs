// 테스트용 서버 간 서명 (RequestSigning 과 같은 규칙)
import crypto from 'node:crypto'
export const KEYS = {
  fairticket: { star: 'dev-ft-to-star-change-me', moon: 'dev-ft-to-moon-change-me' },
  star: 'dev-star-to-ft-change-me',
  moon: 'dev-moon-to-ft-change-me',
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
export function signHeaders({ client, secret, method, url, body = '', idem = '', ts, nonce }) {
  const u = new URL(url)
  ts = ts ?? String(Math.floor(Date.now() / 1000))
  nonce = nonce ?? crypto.randomBytes(16).toString('hex')
  const canon = [method.toUpperCase(), u.pathname + u.search, ts, nonce, idem, sha(Buffer.from(body))].join('\n')
  const sig = crypto.createHmac('sha256', secret).update(canon).digest('hex')
  return { 'X-FT-Client': client, 'X-FT-Timestamp': ts, 'X-FT-Nonce': nonce, 'X-FT-Signature': sig, ...(idem ? { 'Idempotency-Key': idem } : {}) }
}
/** signAs: {client, secret} 또는 생략. extra: 서명 후 덮어쓸 값(변조 테스트) */
export async function call(method, url, body, { signAs, idem, headers = {}, tamperBody, ts, nonce } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body)
  let h = { 'Content-Type': 'application/json', 'X-Device-Id': `e2e-${body?.memberId ?? String(url).match(/members\/(\d+)/)?.[1] ?? 'x'}`, ...headers }
  if (idem && !signAs) h['Idempotency-Key'] = idem
  if (signAs) h = { ...h, ...signHeaders({ ...signAs, method, url, body: raw, idem, ts, nonce }) }
  const sent = tamperBody !== undefined ? JSON.stringify(tamperBody) : raw
  const res = await fetch(url, { method, headers: h, body: method === 'GET' ? undefined : sent || undefined })
  const t = await res.text(); let data = null
  try { data = t ? JSON.parse(t) : null } catch { data = t }
  return { status: res.status, data, replayed: res.headers.get('Idempotent-Replayed') === 'true', headers: h }
}
export const AS = {
  ftToStar: { client: 'fairticket', secret: KEYS.fairticket.star },
  ftToMoon: { client: 'fairticket', secret: KEYS.fairticket.moon },
  star: { client: 'star', secret: KEYS.star },
  moon: { client: 'moon', secret: KEYS.moon },
}
