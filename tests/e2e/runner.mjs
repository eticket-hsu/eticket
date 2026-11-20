// 각 시나리오를 새 인메모리 DB에서 실행한다. 서비스의 업무 로직은 변경하지 않는다.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const scenarios = [
  'quota-resale',
  'resale-selection',
  'risk',
  'idempotency',
  'auth',
  'ip-check',
  'fraud-cancel',
  'dynamic-qr',
  'device-binding',
]
const selected = process.argv.slice(2)
const tests = selected.length ? selected : scenarios
const children = new Set()
const windows = process.platform === 'win32'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let stopping = false

function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options })
  children.add(child)
  child.on('error', (error) => console.error(error.message))
  child.on('exit', () => children.delete(child))
  return child
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return
  const exited = once(child, 'exit')
  if (windows) {
    // PID로 시작한 테스트 프로세스 트리만 종료한다. 다른 개발 서버는 종료하지 않는다.
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    await once(killer, 'exit')
    await exited
  } else {
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await exited
    } finally {
      clearTimeout(timer)
    }
  }
}

async function cleanup() {
  await Promise.all([...children].map(stop))
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) return
    stopping = true
    await cleanup()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
}

function occupied(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (busy) => {
      socket.destroy()
      resolve(busy)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(1000, () => finish(true))
  })
}

async function build(project) {
  console.log(`== ${project} 빌드 ==`)
  const child = start(windows ? 'gradlew.bat' : './gradlew', ['bootJar', '-q'], {
    cwd: join(root, project),
    shell: windows,
  })
  const [code] = await once(child, 'exit')
  if (code !== 0) throw new Error(`${project} 빌드 실패 (${code})`)
}

async function ready(servers) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    for (const { child, url } of servers) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`서버 조기 종료: ${url}`)
    }
    const checks = await Promise.all(
      servers.map(async ({ url }) => {
        try {
          return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
        } catch {
          return false
        }
      }),
    )
    if (checks.every(Boolean)) return
    await delay(500)
  }
  throw new Error('서버 준비 시간 초과 (120초)')
}

async function scenario(name, logs) {
  console.log(`\n== ${name}: 서버 초기화 ==`)
  const specs = [
    ['eticket', 'eticket-server', [], 'http://localhost:8080/v1/resales'],
    ['star', 'vendor-server', ['--spring.profiles.active=star'], 'http://localhost:8081/api/info'],
    ['moon', 'vendor-server', ['--spring.profiles.active=moon'], 'http://localhost:8082/api/info'],
  ]
  const streams = []
  try {
    const servers = specs.map(([id, project, args, url]) => {
      const stream = createWriteStream(join(logs, `${name}-${id}.log`))
      streams.push(stream)
      const child = start(
        'java',
        ['-jar', join(root, project, 'build/libs', `${project}-0.0.1-SNAPSHOT.jar`), ...args],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      child.stdout.pipe(stream, { end: false })
      child.stderr.pipe(stream, { end: false })
      return { child, url }
    })
    await ready(servers)
    const child = start(process.execPath, [join(root, 'tests/e2e', `${name}.mjs`)])
    const timer = setTimeout(() => {
      console.error(`${name}: 테스트 시간 초과 (180초)`)
      void stop(child)
    }, 180_000)
    try {
      const [code] = await once(child, 'exit')
      return code === 0
    } finally {
      clearTimeout(timer)
    }
  } finally {
    await cleanup()
    await Promise.all(streams.map((stream) => new Promise((resolve) => stream.end(resolve))))
  }
}

try {
  for (const name of tests) {
    if (!scenarios.includes(name))
      throw new Error(`알 수 없는 테스트: ${name}. 사용 가능: ${scenarios.join(', ')}`)
  }
  for (const port of [8080, 8081, 8082]) {
    if (await occupied(port))
      throw new Error(`${port} 포트가 사용 중입니다. 실행 중인 데모 서버를 먼저 종료하세요.`)
  }
  await build('eticket-server')
  await build('vendor-server')
  const logs = await mkdtemp(join(tmpdir(), 'eticket-e2e-'))
  console.log(`서버 로그: ${logs}`)
  const results = []
  for (const name of tests) results.push([name, await scenario(name, logs)])
  console.log('\n== 결과 ==')
  for (const [name, passed] of results) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
  process.exitCode = results.every(([, passed]) => passed) ? 0 : 1
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await cleanup()
}
