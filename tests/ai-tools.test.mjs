import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, relative } from 'node:path'
import vm from 'node:vm'

global.window = { EF: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/ai/store.js',
  'src/ai/connection.js',
  'src/ai/adapter.js',
  'src/ai/provider.js',
  'src/ai/provider-auth.js',
  'src/ai/provider-transports.js',
  'src/ai/provider-connections.js',
  'src/ai/context.js',
  'src/ai/request.js',
  'src/ai/runtime.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const ai = window.EF.ai

function latestCall(agentId) {
  const agent = ai.findAgent(agentId)
  const message = agent.messages[agent.messages.length - 1]
  return message.toolCalls[message.toolCalls.length - 1]
}

const agent = ai.createAgent({
  name: 'Tool Runner',
  path: 'tools/root',
  connection: 'mock',
  toolRefs: ['edit-record'],
})

let previewCtx = null
let runCtx = null
let applyCtx = null
ai.registerTool('edit-record', {
  title: 'Edit Record',
  description: 'Preview, run, and apply a record edit.',
  schema: { type: 'object', required: ['id'] },
  permissions: ['tool.call', 'tool.apply'],
  preview: function (args, ctx) {
    previewCtx = ctx
    return { kind: 'diff', before: args.before, after: args.after }
  },
  run: function (args, ctx) {
    runCtx = ctx
    return { ok: true, id: args.id, after: args.after }
  },
  apply: function (result, ctx) {
    applyCtx = ctx
    return { applied: true, id: result.id, after: result.after }
  },
})

const defaultToolAgent = ai.createAgent({
  name: 'Default Tool Agent',
  path: 'tools/default',
  connection: 'mock',
})
const defaultToolRequest = ai.makeRequest(defaultToolAgent, null, 'run_default_tools', 'user', 0)
assert.deepEqual(defaultToolRequest.tools, ['edit-record'])
assert.equal(defaultToolRequest.toolSpecs.length, 1)
assert.equal(defaultToolRequest.toolSpecs[0].id, 'edit-record')

const proposed = ai.createToolCall(agent.id, {
  toolId: 'edit-record',
  args: { id: 'sword', before: 10, after: 12 },
}, 'user')
assert.equal(proposed.status, 'proposed')
assert.equal(proposed.actor, 'user')
assert.equal(proposed.toolId, 'edit-record')
assert.equal(ai.findAgent(agent.id).messages.length, 1)

const previewed = ai.previewToolCall(agent.id, proposed.id, 'user')
assert.equal(previewed.status, 'previewed')
assert.deepEqual(previewed.preview, { kind: 'diff', before: 10, after: 12 })
assert.equal(previewCtx.canRead('agent.full'), true)
assert.equal(previewCtx.canApply(), true)

const approved = ai.approveToolCall(agent.id, proposed.id, 'user')
assert.equal(approved.status, 'approved')

const running = ai.runToolCall(agent.id, proposed.id, 'user')
assert.equal(running.toolCall.status, 'running')
const completed = await running.promise
assert.equal(completed.status, 'completed')
assert.deepEqual(completed.result, { ok: true, id: 'sword', after: 12 })
assert.equal(runCtx.toolCall.id, proposed.id)

const applied = ai.applyToolCall(agent.id, proposed.id, 'user')
assert.equal(applied.status, 'applied')
assert.deepEqual(applied.applyResult, { applied: true, id: 'sword', after: 12 })
assert.equal(applyCtx.toolCall.id, proposed.id)

ai.registerTool('semantic-fail', {
  run: function () { return { patch: { type: 'gde.patch' } } },
  apply: function () {
    return {
      ok: false,
      validation: { errors: [{ path: 'ops[0]', message: 'invalid patch' }] },
    }
  },
})
const semanticFail = ai.createToolCall(agent.id, { toolId: 'semantic-fail' }, 'user')
assert.equal(ai.approveToolCall(agent.id, semanticFail.id, 'user').status, 'approved')
const semanticRun = ai.runToolCall(agent.id, semanticFail.id, 'user')
await semanticRun.promise
const semanticApplied = ai.applyToolCall(agent.id, semanticFail.id, 'user')
assert.equal(semanticApplied.status, 'failed')
assert.match(semanticApplied.error, /invalid patch/)

ai.registerTool('async-apply', {
  run: function () { return { id: 'async' } },
  apply: function (result) {
    return Promise.resolve({ applied: true, id: result.id })
  },
})
const asyncCall = ai.createToolCall(agent.id, { toolId: 'async-apply' }, 'user')
assert.equal(ai.approveToolCall(agent.id, asyncCall.id, 'user').status, 'approved')
const asyncRun = ai.runToolCall(agent.id, asyncCall.id, 'user')
await asyncRun.promise
const asyncApply = ai.applyToolCall(agent.id, asyncCall.id, 'user')
assert.equal(asyncApply.toolCall.status, 'applying')
const asyncDone = await asyncApply.promise
assert.equal(asyncDone.status, 'applied')
assert.deepEqual(asyncDone.applyResult, { applied: true, id: 'async' })

ai.registerTool('async-apply-fail', {
  run: function () { return { id: 'async-fail' } },
  apply: function () {
    return Promise.reject(new Error('async apply failed'))
  },
})
const asyncFailCall = ai.createToolCall(agent.id, { toolId: 'async-apply-fail' }, 'user')
assert.equal(ai.approveToolCall(agent.id, asyncFailCall.id, 'user').status, 'approved')
const asyncFailRun = ai.runToolCall(agent.id, asyncFailCall.id, 'user')
await asyncFailRun.promise
const asyncFailApply = ai.applyToolCall(agent.id, asyncFailCall.id, 'user')
const asyncFailed = await asyncFailApply.promise
assert.equal(asyncFailed.status, 'failed')
assert.equal(asyncFailed.error, 'async apply failed')

ai.registerTransport('generated-tool-calls', {
  send: function () {
    return {
      role: 'assistant',
      content: '',
      toolCalls: [
        { toolId: 'edit-record', args: { id: 'first' } },
        { toolId: 'edit-record', args: { id: 'second' } },
      ],
    }
  },
})
ai.registerConnection('generated-tool-calls', { auth: { type: 'none' }, transport: { type: 'generated-tool-calls' }, configDefaults: {} })
const generatedCallAgent = ai.createAgent({
  name: 'Generated Calls',
  path: 'tools/generated',
  connection: 'generated-tool-calls',
})
const normalizedRun = ai.message.send(generatedCallAgent.id, 'make calls', 'user')
await normalizedRun.promise
const generatedMessage = ai.findAgent(generatedCallAgent.id).messages.find(function (message) {
  return message.role === 'assistant'
})
assert.notEqual(generatedMessage.toolCalls[0].id, generatedMessage.toolCalls[1].id)

const decodedTextTool = ai.decodeTextToolResponse('Before\n```json\n{"ef_tool_calls":[{"toolId":"read-number","args":{"id":"answer"}}]}\n```\nAfter')
assert.equal(decodedTextTool.content, 'Before\n\nAfter')
assert.equal(decodedTextTool.toolCalls.length, 1)
assert.equal(decodedTextTool.toolCalls[0].toolId, 'read-number')

const rejected = ai.createToolCall(agent.id, {
  toolId: 'edit-record',
  args: { id: 'shield', before: 4, after: 5 },
}, 'user')
assert.equal(ai.rejectToolCall(agent.id, rejected.id, 'not needed').status, 'rejected')
assert.equal(latestCall(agent.id).error, 'not needed')

ai.registerTool('explode', {
  run: function () { throw new Error('boom') },
})
const failing = ai.createToolCall(agent.id, { toolId: 'explode' }, 'user')
assert.equal(ai.approveToolCall(agent.id, failing.id, 'user').status, 'approved')
const failedRun = ai.runToolCall(agent.id, failing.id, 'user')
const failed = await failedRun.promise
assert.equal(failed.status, 'failed')
assert.equal(failed.error, 'boom')

const calls = []
ai.setPermissionResolver(function (ctx, next) {
  calls.push({ actor: ctx.actor, scope: ctx.scope, toolId: ctx.toolId, phase: ctx.phase })
  if (ctx.actor === 'blocked') return false
  if (ctx.scope === 'tool.apply') return false
  return next(ctx)
})

assert.equal(ai.canUseTool('user', agent.id, 'edit-record', 'call'), true)
assert.equal(ai.canUseTool('user', agent.id, 'edit-record', 'apply'), false)
assert.equal(ai.createToolCall(agent.id, { toolId: 'edit-record' }, 'blocked'), null)
assert.equal(ai.applyToolCall(agent.id, proposed.id, 'user'), null)
assert.deepEqual(calls.some(function (call) {
  return call.scope === 'tool.apply' && call.toolId === 'edit-record' && call.phase === 'apply'
}), true)
ai.setPermissionResolver(null)

let loopRequests = []
ai.registerTool('read-number', {
  title: 'Read Number',
  schema: { id: 'string' },
  run: function (args) {
    return { id: args.id, value: 42 }
  },
})
ai.registerTransport('tool-loop', {
  send: function (connection, request) {
    loopRequests.push(request)
    if (loopRequests.length === 1) {
      return {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call_1', toolId: 'read-number', args: { id: 'answer' } }],
      }
    }
    const last = request.messages[request.messages.length - 1]
    assert.equal(last.role, 'tool')
    assert.equal(last.toolCallId || (last.meta && last.meta.toolCallId), 'call_1')
    return { role: 'assistant', content: 'Tool says ' + JSON.parse(last.content).value }
  },
})
ai.registerConnection('tool-loop', { auth: { type: 'none' }, transport: { type: 'tool-loop' }, configDefaults: {} })
const loopAgent = ai.createAgent({
  name: 'Loop Agent',
  connection: 'tool-loop',
  toolRefs: ['read-number'],
})
const loopRun = ai.message.send(loopAgent.id, 'start', 'user')
const loopReply = await loopRun.promise
assert.equal(loopReply.content, 'Tool says 42')
assert.equal(loopRequests.length, 2)
assert.equal(ai.findAgent(loopAgent.id).messages.some(function (message) { return message.role === 'tool' }), true)

const gdeFiles = []
function walkGde(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) }
  catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walkGde(path)
    else if (entry.isFile() && path.endsWith('.js')) gdeFiles.push(path)
  }
}

walkGde(join(process.cwd(), 'temp', 'GameDataEditor', 'src'))
assert.equal(gdeFiles.length > 0, true)
for (const file of gdeFiles) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, relative(process.cwd(), file) + '\n' + (syntax.stderr || syntax.stdout || ''))
  const source = readFileSync(file, 'utf8')
  assert.equal(/\.innerHTML\b|\binnerHTML\s*=/.test(source), false, 'banned innerHTML use: ' + relative(process.cwd(), file))
}

console.log('ai tools tests ok')
