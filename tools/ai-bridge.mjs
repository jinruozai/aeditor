#!/usr/bin/env node
import http from 'node:http'
import { spawn } from 'node:child_process'

const HOST = process.env.EF_AI_BRIDGE_HOST || '127.0.0.1'
const PORT = Number(process.env.EF_AI_BRIDGE_PORT || 8787)
const CODEX_COMMAND = process.env.EF_CODEX_COMMAND || 'codex'
const CODEX_ARGS = (process.env.EF_CODEX_ARGS || 'app-server --listen stdio://').split(/\s+/).filter(Boolean)
const CODEX_CHAT_COMMAND = process.env.EF_CODEX_CHAT_COMMAND || ''
const CODEX_CHAT_ARGS = (process.env.EF_CODEX_CHAT_ARGS || '').split(/\s+/).filter(Boolean)

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

function textOfMessageContent(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (content.type === 'rich-prompt') return content.renderedText || content.text || ''
  if (Array.isArray(content)) {
    return content.map(function (item) {
      return typeof item === 'string' ? item : (item.text || item.content || '')
    }).join('')
  }
  return String(content)
}

function lastUserText(request) {
  const messages = request.messages || []
  for (let i = messages.length - 1; i >= 0; i--) {
    if ((messages[i].role || 'user') === 'user') return textOfMessageContent(messages[i].content)
  }
  return textOfMessageContent(request.content)
}

function userInputItems(request) {
  const items = []
  const text = lastUserText(request)
  if (text) items.push({ type: 'text', text })
  const refs = request.resourceRefs || []
  const payloads = request.resources || request.resolvedResources || []
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i] || {}
    const payload = payloads[i] || {}
    if (payload.path && String(ref.kind || payload.kind || '').indexOf('image') >= 0) {
      items.push({ type: 'localImage', path: payload.path })
    } else if (payload.url || (payload.dataUrl && /^https?:/.test(payload.dataUrl))) {
      items.push({ type: 'image', url: payload.url || payload.dataUrl })
    }
  }
  return items.length ? items : [{ type: 'text', text: '' }]
}

function runJsonCommand(command, args, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
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
  }

  start() {
    if (this.child) return
    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', chunk => this.onData(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', chunk => {
      if (process.env.EF_AI_BRIDGE_DEBUG) process.stderr.write(chunk)
    })
    this.child.on('exit', () => {
      this.child = null
      for (const item of this.pending.values()) item.reject(new Error('Codex app-server exited'))
      this.pending.clear()
      this.initialized = null
    })
  }

  async ensureReady() {
    this.start()
    if (this.initialized) return this.initialized
    this.initialized = this.request('initialize', {
      clientInfo: {
        name: 'editorframe_ai_bridge',
        title: 'EditorFrame AI Bridge',
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
      this.child.stdin.write(JSON.stringify(msg) + '\n')
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
  const result = await codex.request('account/read', { refreshToken: false })
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
  const chunks = []
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
    if (delta) chunks.push(delta)
  })
  const offCompleted = codex.on('turn/completed', params => {
    if (!params || params.threadId && params.threadId !== threadId) return
    const turn = params.turn || {}
    usage = turn.usage || turn.tokenUsage || null
    if (turn.status === 'failed') doneReject(new Error(turn.error && turn.error.message || 'Codex turn failed'))
    else doneResolve(turn)
  })
  await codex.request('turn/start', {
    threadId,
    input: userInputItems(request),
    model: request.model || undefined,
    summary: 'concise',
  })
  try {
    const turn = await done
    let content = chunks.join('')
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
  if (url.pathname === '/health' || url.pathname === '/healthz') return json(res, 200, { ok: true, id: 'editorframe-ai-bridge' })
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
    hint: 'Make sure Codex CLI is installed, accessible, and authenticated. Override command with EF_CODEX_COMMAND / EF_CODEX_ARGS if needed.',
  }))
})

server.listen(PORT, HOST, () => {
  console.log('EditorFrame AI Bridge listening on http://' + HOST + ':' + PORT)
  console.log('Codex app-server command: ' + [CODEX_COMMAND].concat(CODEX_ARGS).join(' '))
  if (CODEX_CHAT_COMMAND) console.log('Codex chat command override: ' + [CODEX_CHAT_COMMAND].concat(CODEX_CHAT_ARGS).join(' '))
})

process.on('SIGINT', () => {
  if (codex.child) codex.child.kill()
  server.close(() => process.exit(0))
})
