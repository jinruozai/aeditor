#!/usr/bin/env node
import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join, relative, resolve, sep } from 'node:path'

const HOST = process.env.AIDITOR_AI_BRIDGE_HOST || '127.0.0.1'
const PORT = Number(process.env.AIDITOR_AI_BRIDGE_PORT || 8787)
const WINDOWS_SHELL = process.platform === 'win32'
const CODEX_COMMAND = process.env.AIDITOR_CODEX_COMMAND || resolveCodexCommand()
const CODEX_ARGS = (process.env.AIDITOR_CODEX_ARGS || 'app-server --listen stdio://').split(/\s+/).filter(Boolean)
const CODEX_CHAT_COMMAND = process.env.AIDITOR_CODEX_CHAT_COMMAND || ''
const CODEX_CHAT_ARGS = (process.env.AIDITOR_CODEX_CHAT_ARGS || '').split(/\s+/).filter(Boolean)
const VERIFY_CWD = resolve(process.env.AIDITOR_VERIFY_CWD || process.cwd())
const VERIFY_ROOTS = (process.env.AIDITOR_VERIFY_ROOTS || VERIFY_CWD)
  .split(delimiter)
  .filter(Boolean)
  .map(item => resolve(item))
const VERIFY_TIMEOUT_MS = Number(process.env.AIDITOR_VERIFY_TIMEOUT_MS || 120000)
const VERIFY_MAX_OUTPUT = Number(process.env.AIDITOR_VERIFY_MAX_OUTPUT || 24000)
let lastDebugRequest = null
let lastVerifyResult = null

function resolveCodexCommand() {
  if (!WINDOWS_SHELL) return 'codex'
  const appData = process.env.APPDATA || ''
  const npmCodex = appData ? join(appData, 'npm', 'codex.cmd') : ''
  return npmCodex && existsSync(npmCodex) ? npmCodex : 'codex'
}

function json(res, status, data) {
  const body = JSON.stringify(data == null ? {} : data)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(body)
}

function userInputItems(request) {
  return Array.isArray(request.inputItems) && request.inputItems.length
    ? request.inputItems
    : [{ type: 'text', text: '' }]
}

function runJsonCommand(command, args, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: WINDOWS_SHELL,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || ('Bridge chat command exited with code ' + code)))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (_) {
        resolve({ role: 'assistant', content: stdout.trim() })
      }
    })
    child.stdin.end(JSON.stringify(payload || {}) + '\n')
  })
}

function clip(text, maxChars) {
  const value = String(text == null ? '' : text)
  const max = Number(maxChars || VERIFY_MAX_OUTPUT)
  return max > 0 && value.length > max
    ? value.slice(0, max) + '\n...[truncated]'
    : value
}

function isInside(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.includes('..' + sep))
}

function verifyCwd(input) {
  const cwd = resolve(input || VERIFY_CWD)
  for (const root of VERIFY_ROOTS) if (isInside(root, cwd)) return cwd
  throw new Error('Verify cwd is outside allowed roots: ' + cwd)
}

function npmCommand() {
  return WINDOWS_SHELL ? 'npm.cmd' : 'npm'
}

function configuredVerifyChecks(cwd) {
  if (!process.env.AIDITOR_VERIFY_CHECKS) return null
  const raw = JSON.parse(process.env.AIDITOR_VERIFY_CHECKS)
  const list = Array.isArray(raw) ? raw : Object.keys(raw || {}).map(id => Object.assign({ id }, raw[id]))
  return list.map(item => normalizeVerifyCheck(item, cwd))
}

function normalizeVerifyCheck(item, cwd) {
  const id = String(item.id || item.name || item.script || '').trim()
  if (!id) throw new Error('Verify check requires id')
  const command = item.command || (item.script ? npmCommand() : null)
  const args = item.args || (item.script ? ['run', item.script] : [])
  if (!command) throw new Error('Verify check requires command or script: ' + id)
  return {
    id,
    title: item.title || id,
    description: item.description || '',
    command,
    args,
    cwd: verifyCwd(item.cwd || cwd),
    timeoutMs: item.timeoutMs || VERIFY_TIMEOUT_MS,
  }
}

function packageVerifyChecks(cwd) {
  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return []
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const scripts = pkg.scripts || {}
  const preferred = ['check', 'check:dist', 'test', 'lint', 'typecheck']
  const out = []
  for (const name of preferred) {
    if (!scripts[name]) continue
    out.push(normalizeVerifyCheck({
      id: name,
      title: 'npm run ' + name,
      script: name,
    }, cwd))
  }
  return out
}

function verifyChecks(inputCwd) {
  const cwd = verifyCwd(inputCwd)
  return configuredVerifyChecks(cwd) || packageVerifyChecks(cwd)
}

function publicVerifyCheck(check) {
  return {
    id: check.id,
    title: check.title,
    description: check.description,
    cwd: check.cwd,
    command: check.command,
    args: check.args,
    timeoutMs: check.timeoutMs,
  }
}

function runProcess(command, args, opts) {
  const cwd = verifyCwd(opts && opts.cwd)
  const timeoutMs = Number(opts && opts.timeoutMs || VERIFY_TIMEOUT_MS)
  return new Promise((resolveDone, reject) => {
    const started = Date.now()
    const child = spawn(command, args || [], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('exit', code => {
      clearTimeout(timer)
      resolveDone({
        cwd,
        exitCode: timedOut ? null : code,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr,
      })
    })
  })
}

function extractDiagnostics(output, maxItems = 100) {
  const lines = String(output || '').split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (out.length >= maxItems) break
    let m = line.match(/^(.+?):(\d+):(\d+)[:\s]+(.+)$/)
    if (m) {
      out.push({ path: m[1], line: Number(m[2]), column: Number(m[3]), message: m[4] })
      continue
    }
    m = line.match(/^(.+?)\((\d+),(\d+)\):\s*(.+)$/)
    if (m) {
      out.push({ path: m[1], line: Number(m[2]), column: Number(m[3]), message: m[4] })
      continue
    }
    if (/\b(error|failed|exception)\b/i.test(line)) out.push({ message: line })
  }
  return out
}

async function verifyList(args = {}) {
  return verifyChecks(args.cwd).map(publicVerifyCheck)
}

async function verifyRun(args = {}) {
  const checks = verifyChecks(args.cwd)
  const id = args.check || args.id || (Array.isArray(args.checks) && args.checks[0]) || (checks[0] && checks[0].id)
  const check = checks.find(item => item.id === id)
  if (!check) throw new Error('Unknown verify check: ' + id)
  const result = await runProcess(check.command, check.args, {
    cwd: args.cwd || check.cwd,
    timeoutMs: args.timeoutMs || check.timeoutMs,
  })
  const output = result.stdout + (result.stderr ? (result.stdout ? '\n' : '') + result.stderr : '')
  lastVerifyResult = {
    ok: result.exitCode === 0 && !result.timedOut,
    check: check.id,
    title: check.title,
    cwd: result.cwd,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: clip(result.stdout, args.maxChars),
    stderr: clip(result.stderr, args.maxChars),
    output: clip(output, args.maxChars),
    diagnostics: extractDiagnostics(output, args.maxItems),
  }
  return lastVerifyResult
}

async function verifyDiagnostics(args = {}) {
  const last = lastVerifyResult || null
  if (!last) return []
  return (last.diagnostics || []).slice(0, args.maxItems || 100)
}

class JsonRpcProcess {
  constructor(command, args) {
    this.command = command
    this.args = args
    this.child = null
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.buffer = ''
    this.initialized = null
    this.lastError = null
  }

  start() {
    if (this.child) return
    this.lastError = null
    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: WINDOWS_SHELL,
    })
    this.child.on('error', err => {
      this.lastError = err
      this.child = null
      this.rejectPending(err)
      this.initialized = null
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', chunk => this.onData(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => {
      if (process.env.AIDITOR_AI_BRIDGE_DEBUG) process.stderr.write(chunk)
    })
    this.child.on('exit', () => {
      this.child = null
      this.rejectPending(new Error('Codex app-server exited'))
      this.initialized = null
    })
  }

  rejectPending(err) {
    for (const item of this.pending.values()) item.reject(err)
    this.pending.clear()
  }

  async ensureReady() {
    this.start()
    if (this.lastError) throw this.lastError
    if (this.initialized) return this.initialized
    this.initialized = this.request('initialize', {
      clientInfo: {
        name: 'aiditor_ai_bridge',
        title: 'Aiditor AI Bridge',
        version: '0.1.0',
      },
      capabilities: {
        optOutNotificationMethods: [
          'thread/started',
          'item/started',
          'item/completed',
          'thread/status/changed',
          'thread/tokenUsage/updated',
        ],
      },
    }).then(result => {
      this.notify('initialized', {})
      return result
    }, err => {
      this.initialized = null
      throw err
    })
    return this.initialized
  }

  on(method, fn) {
    const list = this.listeners.get(method) || []
    list.push(fn)
    this.listeners.set(method, list)
    return () => {
      const next = (this.listeners.get(method) || []).filter(item => item !== fn)
      this.listeners.set(method, next)
    }
  }

  emit(method, params) {
    const list = this.listeners.get(method) || []
    for (const fn of list) fn(params || {})
  }

  request(method, params) {
    this.start()
    const id = this.nextId++
    const msg = { id, method, params: params || {} }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.child.stdin.write(JSON.stringify(msg) + '\n')
      } catch (err) {
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  notify(method, params) {
    this.start()
    this.child.stdin.write(JSON.stringify({ method, params: params || {} }) + '\n')
  }

  onData(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.trim()) continue
      let msg = null
      try { msg = JSON.parse(line) } catch (_) { continue }
      if (msg.id != null) {
        const pending = this.pending.get(msg.id)
        if (!pending) continue
        this.pending.delete(msg.id)
        if (msg.error) pending.reject(new Error(msg.error.message || String(msg.error)))
        else pending.resolve(msg.result)
      } else if (msg.method) {
        this.emit(msg.method, msg.params || {})
      }
    }
  }
}

const codex = new JsonRpcProcess(CODEX_COMMAND, CODEX_ARGS)

async function codexStatus() {
  await codex.ensureReady()
  const result = await codex.request('account/read', { refreshToken: true })
  const account = result && result.account
  return {
    state: account ? 'signed_in' : 'signed_out',
    method: account && account.type || 'chatgpt',
    account: account || null,
    plan: account && account.planType || null,
    requiresOpenaiAuth: !!(result && result.requiresOpenaiAuth),
  }
}

async function codexLogin() {
  await codex.ensureReady()
  const result = await codex.request('account/login/start', { type: 'chatgptDeviceCode' })
  return {
    state: 'pending',
    method: 'chatgptDeviceCode',
    loginId: result.loginId,
    verificationUrl: result.verificationUrl,
    userCode: result.userCode,
  }
}

async function codexLogout() {
  await codex.ensureReady()
  await codex.request('account/logout', {})
  return { state: 'signed_out' }
}

async function codexModels() {
  return {
    models: [
      { id: 'gpt-5.5', label: 'gpt-5.5' },
      { id: 'gpt-5.5-pro', label: 'gpt-5.5-pro' },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' },
      { id: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
      { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex' },
      { id: 'gpt-5.1-codex', label: 'gpt-5.1-codex' },
    ],
  }
}

async function codexChat(request) {
  if (CODEX_CHAT_COMMAND) {
    const result = await runJsonCommand(CODEX_CHAT_COMMAND, CODEX_CHAT_ARGS, request)
    return result.message || result.result || result
  }
  await codex.ensureReady()
  const started = await codex.request('thread/start', {
    ephemeral: true,
    sessionStartSource: 'startup',
  })
  const thread = started.thread || started
  const threadId = thread.id || started.threadId
  let content = ''
  let usage = null
  let doneResolve
  let doneReject
  const done = new Promise((resolve, reject) => {
    doneResolve = resolve
    doneReject = reject
  })
  const offDelta = codex.on('item/agentMessage/delta', params => {
    if (!params || params.threadId && params.threadId !== threadId) return
    const delta = params.delta || params.text || ''
    if (!delta) return
    const text = String(delta)
    content = text.indexOf(content) === 0 ? text : content + text
  })
  const offCompleted = codex.on('turn/completed', params => {
    if (!params || params.threadId && params.threadId !== threadId) return
    const turn = params.turn || {}
    usage = turn.usage || turn.tokenUsage || null
    if (turn.status === 'failed') doneReject(new Error(turn.error && turn.error.message || 'Codex turn failed'))
    else doneResolve(turn)
  })
  const input = userInputItems(request)
  lastDebugRequest = {
    time: new Date().toISOString(),
    model: request.model || '',
    messages: (request.messages || []).length,
    inputPreview: input.map(item => Object.assign({}, item, {
      text: item.text ? item.text.slice(0, 4000) : item.text,
    })),
  }
  if (process.env.AIDITOR_AI_BRIDGE_DEBUG_PROMPT) {
    console.log('[prompt]', JSON.stringify(input).slice(0, 4000))
  }
  await codex.request('turn/start', {
    threadId,
    input: input,
    model: request.model || undefined,
    summary: 'concise',
  })
  try {
    const turn = await done
    if (!content && turn && turn.items) {
      content = turn.items.map(item => item.text || item.content || '').join('')
    }
    return {
      role: 'assistant',
      content,
      usage,
      meta: { threadId, turnId: turn && turn.id },
    }
  } finally {
    offDelta()
    offCompleted()
  }
}

async function readBody(req) {
  let text = ''
  for await (const chunk of req) text += chunk
  return text ? JSON.parse(text) : {}
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/health' || url.pathname === '/healthz') return json(res, 200, { ok: true, id: 'aiditor-ai-bridge' })
  if (url.pathname === '/debug/last-request' && req.method === 'GET') return json(res, 200, lastDebugRequest || {})
  if (url.pathname === '/verify/list' && req.method === 'GET') return json(res, 200, { checks: await verifyList({ cwd: url.searchParams.get('cwd') || '' }) })
  if (url.pathname === '/verify/list' && req.method === 'POST') return json(res, 200, { checks: await verifyList(await readBody(req)) })
  if (url.pathname === '/verify/run' && req.method === 'POST') return json(res, 200, await verifyRun(await readBody(req)))
  if (url.pathname === '/verify/diagnostics' && req.method === 'GET') return json(res, 200, { diagnostics: await verifyDiagnostics({ maxItems: Number(url.searchParams.get('maxItems') || 100) }) })
  if (url.pathname === '/verify/diagnostics' && req.method === 'POST') return json(res, 200, { diagnostics: await verifyDiagnostics(await readBody(req)) })
  if (url.pathname === '/connections') {
    return json(res, 200, {
      data: [
        { id: 'openai-codex', label: 'OpenAI Codex', auth: 'chatgptDeviceCode' },
      ],
    })
  }
  if (url.pathname === '/models' && req.method === 'GET') return json(res, 200, await codexModels())
  if (url.pathname === '/chat' && req.method === 'POST') return json(res, 200, { message: await codexChat(await readBody(req)) })
  const match = /^\/connections\/([^/]+)\/([^/]+)$/.exec(url.pathname)
  if (!match) return json(res, 404, { error: 'Not found' })
  const [, id, action] = match
  if (id !== 'openai-codex') return json(res, 404, { error: 'Unknown bridge connection: ' + id })
  if (action === 'status' && req.method === 'GET') return json(res, 200, await codexStatus())
  if (action === 'login' && req.method === 'POST') return json(res, 200, await codexLogin())
  if (action === 'logout' && req.method === 'POST') return json(res, 200, await codexLogout())
  if (action === 'models' && req.method === 'GET') return json(res, 200, await codexModels())
  if (action === 'chat' && req.method === 'POST') return json(res, 200, { message: await codexChat(await readBody(req)) })
  return json(res, 405, { error: 'Unsupported method' })
}

const server = http.createServer((req, res) => {
  route(req, res).catch(err => json(res, 500, {
    error: err && err.message || String(err),
    hint: 'Make sure Codex CLI is installed, accessible, and authenticated. Override command with AIDITOR_CODEX_COMMAND / AIDITOR_CODEX_ARGS if needed.',
  }))
})

server.listen(PORT, HOST, () => {
  console.log('Aiditor AI Bridge listening on http://' + HOST + ':' + PORT)
  console.log('Codex app-server command: ' + [CODEX_COMMAND].concat(CODEX_ARGS).join(' '))
  if (CODEX_CHAT_COMMAND) console.log('Codex chat command override: ' + [CODEX_CHAT_COMMAND].concat(CODEX_CHAT_ARGS).join(' '))
})

process.on('SIGINT', () => {
  if (codex.child) codex.child.kill()
  server.close(() => process.exit(0))
})
