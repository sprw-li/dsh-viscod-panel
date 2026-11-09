/**
 * Viscod DSH 面板 · 宿主半侧
 *
 * 职责：
 *  1. 在 DSH 的 webServer 上开一个同源小接口 /viscod/*（浏览器面板靠它探活、触发启动）；
 *  2. 保证 Viscod 本地服务在 127.0.0.1:7401 上是活的（没启动就替用户拉起来）；
 *  3. 把服务固定打开到本项目（D:\Dev\Project4-Viscod）。
 *
 * 客户端半侧见 client.js：一个 iframe 直接嵌 Viscod 的 Web UI。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** 项目根：可用环境变量 VISCOD_PROJECT_ROOT 覆盖 */
const PROJECT_ROOT = process.env.VISCOD_PROJECT_ROOT || 'D:\\Dev\\Project4-Viscod'
const PORT = Number(process.env.VISCOD_PORT || 7401)
const BASE = `http://127.0.0.1:${PORT}`
const LOG_FILE = path.join(PROJECT_ROOT, 'data', 'viscod-plugin.log')

export const inject = ['webServer']

/** @type {import('node:child_process').ChildProcess | null} */
let child = null
/** 这次拉起的服务是我们自己启的吗（是的话插件卸载时可以收掉） */
let ownsServer = false
/** @type {Promise<{ok:boolean, started?:boolean, error?:string}> | null} */
let starting = null

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, line)
  } catch {
    /* 日志写不了不影响功能 */
  }
}

async function ping(timeoutMs = 800) {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

async function readState() {
  try {
    const res = await fetch(`${BASE}/api/state`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** 找到可用的 node：优先 DSH 自带运行时，其次系统 node，最后退回 Electron 的 RUN_AS_NODE */
function resolveNode() {
  const candidates = [
    process.env.VISCOD_NODE,
    path.join(
      path.dirname(process.execPath),
      'resources',
      'runtime',
      'primary-runtime',
      'dependencies',
      'node',
      'bin',
      'node.exe',
    ),
    'C:\\Program Files\\nodejs\\node.exe',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      /* ignore */
    }
  }
  return process.execPath
}

async function ensureProject() {
  const state = await readState()
  const current = state?.state?.root
  if (current && path.resolve(current).toLowerCase() === path.resolve(PROJECT_ROOT).toLowerCase()) return
  try {
    await fetch(`${BASE}/api/project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root: PROJECT_ROOT }),
      signal: AbortSignal.timeout(60000),
    })
    log(`switched project -> ${PROJECT_ROOT} (was ${current || 'none'})`)
  } catch (error) {
    log(`switch project failed: ${String(error)}`)
  }
}

async function ensureServer() {
  if (await ping()) {
    await ensureProject()
    return { ok: true, started: false }
  }
  if (starting) return starting

  starting = (async () => {
    const node = resolveNode()
    const nodeArgs = ['--import', 'tsx', 'server/index.ts']
    const env = { ...process.env, VISCOD_PORT: String(PORT) }
    if (node === process.execPath) env.ELECTRON_RUN_AS_NODE = '1'
    log(`spawn ${node} ${nodeArgs.join(' ')} (cwd=${PROJECT_ROOT})`)

    try {
      child = spawn(node, nodeArgs, {
        cwd: PROJECT_ROOT,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      ownsServer = true
      child.stdout?.on('data', (chunk) => log(`[server] ${String(chunk).trim()}`))
      child.stderr?.on('data', (chunk) => log(`[server:err] ${String(chunk).trim()}`))
      child.on('exit', (code) => {
        log(`server exited code=${code}`)
        child = null
        ownsServer = false
      })
    } catch (error) {
      log(`spawn failed: ${String(error)}`)
      ownsServer = false
      return { ok: false, error: `启动 Viscod 服务失败：${String(error)}` }
    }

    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      if (await ping(600)) {
        await ensureProject()
        log('server ready')
        return { ok: true, started: true }
      }
    }
    log('server start timeout')
    return { ok: false, error: 'Viscod 服务启动超时（可手动在项目里运行 npm start）' }
  })()

  try {
    return await starting
  } finally {
    starting = null
  }
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const route = url.pathname.replace(/\/+$/, '') || '/'
  try {
    if (route === '/viscod/status') {
      const up = await ping(600)
      const state = up ? await readState() : null
      log(`status hit (up=${up})`)
      return sendJson(res, 200, {
        ok: up,
        url: `${BASE}/`,
        project: PROJECT_ROOT,
        root: state?.state?.root ?? null,
        files: state?.state?.scan?.stats?.files ?? 0,
        dirs: state?.state?.scan?.stats?.dirs ?? 0,
        watching: Boolean(state?.state?.watching),
        generatedAt: Date.now(),
      })
    }

    if (route === '/viscod/ensure') {
      log('ensure hit')
      const result = await ensureServer()
      return sendJson(res, result.ok ? 200 : 503, result)
    }

    if (route === '/viscod/rescan' && req.method === 'POST') {
      const up = await ensureServer()
      if (!up.ok) return sendJson(res, 503, up)
      try {
        await fetch(`${BASE}/api/rescan`, { method: 'POST', signal: AbortSignal.timeout(120000) })
      } catch (error) {
        log(`rescan failed: ${String(error)}`)
      }
      return sendJson(res, 200, { ok: true })
    }

    if (route === '/viscod/client-loaded') {
      log(`client loaded (ua=${String(req.headers['user-agent'] || '').slice(0, 80)})`)
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    log(`handler error: ${String(error)}`)
    return sendJson(res, 500, { error: String(error) })
  }
}

export function apply(ctx) {
  log(`apply (project=${PROJECT_ROOT}, port=${PORT})`)
  ctx.effect(() => {
    const dispose = ctx.webServer.register({ kind: 'prefix', path: '/viscod', handler: handle })
    // 面板打开时就预热，别让用户等
    void ensureServer()
    return () => {
      try {
        if (typeof dispose === 'function') dispose()
      } catch {
        /* ignore */
      }
      if (ownsServer && child) {
        try {
          child.kill()
          log('killed own server')
        } catch {
          /* ignore */
        }
      }
    }
  })
}
