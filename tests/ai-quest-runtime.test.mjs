import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  'src/ai/orchestration.js',
  'src/ai/request.js',
  'src/ai/runtime.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const ai = window.EF.ai
const replies = []
const requests = []

async function flush(count = 1) {
  for (let i = 0; i < count; i++) await new Promise(function (resolve) { setTimeout(resolve, 0) })
}

ai.registerTransport('quest-capture', {
  send: function (connection, request) {
    requests.push(request)
    return { role: 'assistant', content: replies.shift() || 'done' }
  },
})
ai.registerConnection('quest-capture', { auth: { type: 'none' }, transport: { type: 'quest-capture' }, configDefaults: {} })

const parent = ai.createAgent({ name: 'Parent', connection: 'quest-capture' })
const child = ai.createAgent({ name: 'Child', parentAgentId: parent.id, connection: 'quest-capture' })

replies.push('first result')
const quest = ai.agent.send(child.id, {
  fromAgentId: parent.id,
  content: 'first task',
})
assert.equal(quest.agentId, child.id)
assert.equal(quest.questId, quest.messageId)
assert.equal(ai.message.read(child.id, quest.messageId, parent.id).content, 'first task')

await flush()

const completed = ai.quest.read(child.id, quest.questId, parent.id)
assert.equal(completed.status, 'completed')
const result = ai.message.read(child.id, completed.resultId, parent.id)
assert.equal(result.content, 'first result')
assert.equal(ai.quest.result(child.id, quest.questId, parent.id).content, 'first result')
assert.equal(result.resultForQuestId, quest.questId)
assert.equal(ai.agent.messages(child.id, { limit: 1 }, parent.id)[0].id, result.id)
assert.equal(ai.agent.messages(child.id, { includeToolMessages: true }, parent.id).length >= 2, true)
const sibling = ai.createAgent({ name: 'Sibling', connection: 'quest-capture' })
assert.equal(ai.quest.read(child.id, quest.questId, sibling.id), null)
assert.equal(ai.message.read(child.id, completed.resultId, sibling.id), null)
assert.equal(ai.agent.messages(child.id, {}, sibling.id).length, 0)

replies.push('second result')
const second = ai.agent.send(child.id, {
  fromAgentId: parent.id,
  content: 'second task',
})
await flush()

assert.equal(ai.quest.read(child.id, quest.questId, parent.id).resultId, completed.resultId)
assert.equal(ai.message.read(child.id, ai.quest.read(child.id, second.questId, parent.id).resultId, parent.id).content, 'second result')
assert.equal(ai.findAgent(parent.id).inbox.some(function (event) {
  return event.type === 'quest.completed' && event.questId === quest.questId
}), true)

let release
const held = new Promise(function (resolve) { release = resolve })
ai.registerTransport('quest-hold', {
  send: function () { return held.then(function () { return { role: 'assistant', content: 'released' } }) },
})
ai.registerConnection('quest-hold', { auth: { type: 'none' }, transport: { type: 'quest-hold' }, configDefaults: {} })
const queued = ai.createAgent({ name: 'Queued', parentAgentId: parent.id, connection: 'quest-hold' })
const firstQueued = ai.message.send(queued.id, { content: 'hold' })
assert.equal(ai.findAgent(queued.id).status, 'running')
const secondQueued = ai.message.send(queued.id, { content: 'after' })
assert.equal(ai.message.read(queued.id, secondQueued.messageId, 'user').status, 'queued')
assert.equal(ai.findAgent(queued.id).queue.length, 1)
const guidedQueued = ai.message.send(queued.id, { content: 'guided after', guidance: 'Prefer this after the held task.' })
assert.equal(ai.findAgent(queued.id).queue.length, 2)
const guidedRequest = ai.makeRequest(ai.findAgent(queued.id), ai.message.read(queued.id, firstQueued.messageId, 'user'), 'run_guided_queue', queued.id, 1)
assert.equal(guidedRequest.messages.some(function (message) {
  return message.role === 'system' && message.content.includes('Queued user messages') && message.content.includes('guided after') && message.content.includes('Prefer this after the held task.')
}), true)
release()
await firstQueued.promise
await flush()
assert.equal(ai.findAgent(queued.id).messages.some(function (message) {
  return message.content === 'after' && message.status === 'done'
}), true)
assert.equal(ai.findAgent(queued.id).queue.length, 0)

ai.registerTransport('delegate-parent', {
  send: function (connection, request) {
    if (request.messages.some(function (message) { return message.role === 'tool' })) {
      return { role: 'assistant', content: 'delegated' }
    }
    return {
      role: 'assistant',
      content: '',
      toolCalls: [{ toolId: 'agent.send', args: { agentId: child.id, content: 'delegated task' } }],
    }
  },
})
ai.registerConnection('delegate-parent', { auth: { type: 'none' }, transport: { type: 'delegate-parent' }, configDefaults: {} })
ai.updateAgent(parent.id, { connection: 'delegate-parent', toolRefs: ['agent.send'] })
const delegated = ai.message.send(parent.id, { content: 'delegate to child' })
await delegated.promise
assert.equal(ai.findAgent(child.id).quests.some(function (item) {
  return item.fromAgentId === parent.id && item.requestMessageId === item.id
}), true)
const parentAfterDelegate = ai.findAgent(parent.id)
assert.notEqual(parentAfterDelegate.status, 'waiting_quest')
await flush()

let approvalRequests = 0
ai.registerTool('approval-edit', {
  preview: function (args) { return { before: args.before, after: args.after } },
  apply: function (preview) { return { applied: true, preview: preview } },
})
ai.registerTransport('approval-flow', {
  send: function () {
    approvalRequests += 1
    if (approvalRequests === 1) {
      return {
        role: 'assistant',
        content: '',
        toolCalls: [{ toolId: 'approval-edit', args: { before: 1, after: 2 } }],
      }
    }
    return { role: 'assistant', content: 'applied and continued' }
  },
})
ai.registerConnection('approval-flow', { auth: { type: 'none' }, transport: { type: 'approval-flow' }, configDefaults: {} })
const approvalAgent = ai.createAgent({ name: 'Approval', parentAgentId: parent.id, connection: 'approval-flow', toolRefs: ['approval-edit'] })
const approvalRun = ai.message.send(approvalAgent.id, { content: 'needs approval' })
await approvalRun.promise
assert.equal(ai.findAgent(approvalAgent.id).status, 'waiting_approval')
const approvalMessage = ai.findAgent(approvalAgent.id).messages.find(function (message) {
  return message.toolCalls && message.toolCalls.length
})
const approvalCall = approvalMessage.toolCalls[0]
assert.equal(ai.applyToolCall(approvalAgent.id, approvalCall.id, 'user').status, 'applied')
const resumed = ai.resumeAgent(approvalAgent.id)
await resumed.promise
assert.equal(ai.findAgent(approvalAgent.id).status, 'idle')
assert.equal(ai.findAgent(approvalAgent.id).messages.some(function (message) {
  return message.content === 'applied and continued'
}), true)

let releaseInterrupt
const interruptedHold = new Promise(function (resolve) { releaseInterrupt = resolve })
ai.registerTransport('interrupt-hold', {
  send: function (connection, request, ctx) {
    const last = request.messages[request.messages.length - 1]
    if (last.content === 'slow') {
      return interruptedHold.then(function () { return { role: 'assistant', content: ctx.signal.aborted ? 'aborted slow' : 'slow done' } })
    }
    return { role: 'assistant', content: 'urgent done' }
  },
})
ai.registerConnection('interrupt-hold', { auth: { type: 'none' }, transport: { type: 'interrupt-hold' }, configDefaults: {} })
const interruptAgent = ai.createAgent({ name: 'Interrupt', parentAgentId: parent.id, connection: 'interrupt-hold' })
const slow = ai.message.send(interruptAgent.id, { content: 'slow' })
const urgent = ai.message.send(interruptAgent.id, { content: 'urgent', interrupt: true })
await urgent.promise
releaseInterrupt()
await slow.promise
const interruptMessages = ai.findAgent(interruptAgent.id).messages
assert.equal(interruptMessages.some(function (message) { return message.content === 'urgent done' }), true)
assert.equal(interruptMessages.some(function (message) { return message.content === 'slow' && message.status === 'stopped' }), true)

const budgetAgent = ai.createAgent({ name: 'Budget', parentAgentId: parent.id, connection: 'quest-capture', model: 'tiny', contextBudgetTokens: 160 })
for (let i = 0; i < 40; i++) {
  ai.appendMessage(budgetAgent.id, { role: 'user', content: 'old message ' + i + ' ' + 'x'.repeat(80) })
}
const budgetInput = ai.appendMessage(budgetAgent.id, { role: 'user', content: 'current message' })
const budgetRequest = ai.makeRequest(ai.findAgent(budgetAgent.id), budgetInput, 'run_budget', budgetAgent.id, 0)
assert.equal(budgetRequest.messages.some(function (message) { return message.id === budgetInput.id }), true)
assert.equal(budgetRequest.messages.length < 42, true)
assert.equal(budgetRequest.messages[0].role, 'system')
assert.equal(budgetRequest.messages[0].content.includes('Do not stop after a partial setup step'), true)
assert.equal(budgetRequest.messages[0].content.includes('prefer agent.delegate'), true)
assert.equal(budgetRequest.messages[0].content.includes('quest.result'), true)

let releaseLimitedA
let releaseLimitedB
const limitedA = new Promise(function (resolve) { releaseLimitedA = resolve })
const limitedB = new Promise(function (resolve) { releaseLimitedB = resolve })
let limitedRunning = 0
let limitedPeak = 0
ai.registerTransport('limited-concurrency', {
  send: function (connection, request) {
    limitedRunning++
    limitedPeak = Math.max(limitedPeak, limitedRunning)
    const text = request.messages[request.messages.length - 1].content
    const wait = text === 'a' ? limitedA : limitedB
    return wait.then(function () {
      limitedRunning--
      return { role: 'assistant', content: text + ' done' }
    })
  },
})
ai.registerConnection('limited-concurrency', { auth: { type: 'none' }, transport: { type: 'limited-concurrency' }, configDefaults: {} })
ai.configureRuntime({ maxConcurrentAgents: 1 })
const limitedOne = ai.createAgent({ name: 'Limited A', parentAgentId: parent.id, connection: 'limited-concurrency' })
const limitedTwo = ai.createAgent({ name: 'Limited B', parentAgentId: parent.id, connection: 'limited-concurrency' })
const limitedRunA = ai.message.send(limitedOne.id, { content: 'a' })
const limitedRunB = ai.message.send(limitedTwo.id, { content: 'b' })
assert.equal(ai.findAgent(limitedTwo.id).status, 'queued')
releaseLimitedA()
await limitedRunA.promise
await flush()
assert.equal(ai.findAgent(limitedTwo.id).status, 'running')
releaseLimitedB()
await limitedRunB.promise
assert.equal(limitedPeak, 1)
ai.configureRuntime({ maxConcurrentAgents: 8 })

let releaseBatchA
let releaseBatchB
const batchA = new Promise(function (resolve) { releaseBatchA = resolve })
const batchB = new Promise(function (resolve) { releaseBatchB = resolve })
const batchRequests = []
ai.registerTransport('batch-child', {
  send: function (connection, request) {
    return (request.agent.name === 'Batch A' ? batchA : batchB).then(function (text) {
      return { role: 'assistant', content: text }
    })
  },
})
ai.registerConnection('batch-child', { auth: { type: 'none' }, transport: { type: 'batch-child' }, configDefaults: {} })
ai.registerTransport('batch-parent', {
  send: function (connection, request) {
    batchRequests.push(request)
    const event = request.input && request.input.meta && request.input.meta.runtimeEvent
    if (event === 'post-delegation.continuation') return { role: 'assistant', content: 'local title' }
    if (event === 'inbox.continuation') return { role: 'assistant', content: 'handled ' + request.input.meta.events.length }
    return {
      role: 'assistant',
      content: 'premature local title',
      toolCalls: [
        { toolId: 'agent.delegate', args: { agentId: batchChildA.id, content: 'task a' } },
        { toolId: 'agent.delegate', args: { agentId: batchChildB.id, content: 'task b' } },
      ],
    }
  },
})
ai.registerConnection('batch-parent', { auth: { type: 'none' }, transport: { type: 'batch-parent' }, configDefaults: {} })
const batchParent = ai.createAgent({ name: 'Batch Parent', parentAgentId: parent.id, connection: 'batch-parent', toolRefs: ['agent.delegate', 'quest.result'] })
const batchChildA = ai.createAgent({ name: 'Batch A', parentAgentId: batchParent.id, connection: 'batch-child' })
const batchChildB = ai.createAgent({ name: 'Batch B', parentAgentId: batchParent.id, connection: 'batch-child' })
const batchRun = ai.message.send(batchParent.id, { content: 'delegate two and do local work' })
await batchRun.promise
await flush(3)
const batchParentMessages = ai.findAgent(batchParent.id).messages
const actionMessage = batchParentMessages.find(function (message) {
  return message.toolCalls && message.toolCalls.length === 2
})
assert.equal(actionMessage.content, '')
assert.equal(actionMessage.meta.actionNote, 'premature local title')
assert.equal(batchParentMessages.some(function (message) { return message.content === 'local title' }), true)
const postDelegationRequest = batchRequests.find(function (request) {
  return request.input && request.input.meta && request.input.meta.runtimeEvent === 'post-delegation.continuation'
})
assert.equal(postDelegationRequest.input.meta.delegated.length, 2)
assert.equal(postDelegationRequest.input.meta.delegated[0].agentId, batchChildA.id)
assert.equal(postDelegationRequest.input.meta.delegated[0].questId != null, true)
assert.equal(postDelegationRequest.input.meta.delegated[0].messageId != null, true)
releaseBatchA('result a')
await flush(5)
const firstInbox = batchRequests.find(function (request) {
  return request.input && request.input.meta && request.input.meta.runtimeEvent === 'inbox.continuation'
})
assert.equal(firstInbox.input.meta.events.length, 1)
assert.equal(firstInbox.input.meta.pendingQuests.length, 1)
assert.equal(ai.findAgent(batchParent.id).messages.some(function (message) { return message.content === 'handled 1' }), true)
releaseBatchB('result b')
await flush(5)
const inboxRequests = batchRequests.filter(function (request) {
  return request.input && request.input.meta && request.input.meta.runtimeEvent === 'inbox.continuation'
})
assert.equal(inboxRequests.length, 2)
assert.equal(inboxRequests[1].input.meta.events.length, 1)
assert.equal(inboxRequests[1].input.meta.pendingQuests.length, 0)

assert.equal(requests.length >= 2, true)
console.log('ai quest runtime tests ok')
