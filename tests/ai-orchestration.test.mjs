import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/ai/store.js',
  'src/ai/provider.js',
  'src/ai/context.js',
  'src/ai/orchestration.js',
  'src/ai/runtime.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const ai = window.EF.ai

function byName(items, name) {
  return items.find(function (item) { return item.name === name })
}

async function runCall(agentId, toolId, args, actor) {
  const call = ai.createToolCall(agentId, { toolId: toolId, args: args || {} }, actor || 'user')
  assert.equal(call.status, 'proposed')
  assert.equal(ai.approveToolCall(agentId, call.id, actor || 'user').status, 'approved')
  const run = ai.runToolCall(agentId, call.id, actor || 'user')
  assert.equal(run.toolCall.status, 'running')
  return run.promise
}

function previewApply(agentId, toolId, args, actor) {
  const call = ai.createToolCall(agentId, { toolId: toolId, args: args || {} }, actor || 'user')
  assert.equal(call.status, 'proposed')
  const previewed = ai.previewToolCall(agentId, call.id, actor || 'user')
  assert.equal(previewed.status, 'previewed')
  const applied = ai.applyToolCall(agentId, call.id, actor || 'user')
  assert.equal(applied.status, 'applied')
  return applied.applyResult
}

const builtinTools = ai.listTools()
assert.equal(builtinTools.includes('agent.create'), true)
assert.equal(builtinTools.includes('agent.read'), true)
assert.equal(builtinTools.includes('agent.send'), true)
assert.equal(builtinTools.includes('agent.stop'), true)
assert.equal(builtinTools.includes('agent.delete'), true)
assert.equal(builtinTools.includes('agent.reparent'), true)
assert.equal(builtinTools.includes('group.create'), true)
assert.equal(builtinTools.includes('group.read'), true)
assert.equal(builtinTools.includes('group.delete'), true)
assert.equal(builtinTools.includes('group.reparent'), true)
assert.equal(ai.getSkill('orchestration').tools.includes('agent.send'), true)

const root = ai.createAgent({
  name: 'Root',
  path: 'root',
  toolRefs: builtinTools,
  skillRefs: ['orchestration'],
})

const createdGroup = previewApply(root.id, 'group.create', { name: 'Team' }, 'user')
assert.equal(createdGroup.name, 'Team')
assert.equal(ai.groups().length, 1)

const createdAgent = previewApply(root.id, 'agent.create', {
  name: 'Worker',
  parentAgentId: root.id,
  groupId: createdGroup.id,
  provider: 'mock',
  model: 'fast',
}, root.id)
assert.equal(createdAgent.name, 'Worker')
assert.equal(createdAgent.path, 'root/worker')
assert.equal(createdAgent.groupId, null)

const teamGroup = previewApply(root.id, 'group.create', { name: 'Team 2' }, 'user')
const movedAgent = previewApply(root.id, 'agent.reparent', {
  agentId: createdAgent.id,
  groupId: teamGroup.id,
}, root.id)
assert.equal(movedAgent.groupId, teamGroup.id)

const movedGroup = previewApply(root.id, 'group.reparent', {
  groupId: teamGroup.id,
  parentId: createdGroup.id,
}, root.id)
assert.equal(movedGroup.parentId, createdGroup.id)

const readableAgents = await runCall(root.id, 'agent.read', {}, root.id)
assert.equal(readableAgents.status, 'completed')
assert.equal(byName(readableAgents.result, 'Worker').path, 'root/worker')

const readableGroups = await runCall(root.id, 'group.read', {}, root.id)
assert.equal(readableGroups.status, 'completed')
assert.equal(byName(readableGroups.result, 'Team').id, createdGroup.id)

let sentRequest = null
ai.registerProvider('capture-send', {
  send: function (request) {
    sentRequest = request
    return { role: 'assistant', content: 'done' }
  },
})
ai.updateAgent(createdAgent.id, { provider: 'capture-send' })
const sent = await runCall(root.id, 'agent.send', { agentId: createdAgent.id, content: 'work item' }, root.id)
assert.equal(sent.status, 'completed')
assert.equal(sent.result.message.content, 'work item')
assert.equal(typeof sent.result.runId, 'string')
await new Promise(function (resolve) { setTimeout(resolve, 0) })
assert.equal(sentRequest.agent.id, createdAgent.id)

let releaseRun
const held = new Promise(function (resolve) { releaseRun = resolve })
ai.registerProvider('hold-orchestration', {
  send: function () { return held.then(function () { return 'late' }) },
})
ai.updateAgent(createdAgent.id, { provider: 'hold-orchestration' })
const run = ai.runAgent(createdAgent.id)
assert.equal(ai.findAgent(createdAgent.id).status, 'running')
const stopped = await runCall(root.id, 'agent.stop', { agentId: createdAgent.id }, root.id)
assert.deepEqual(stopped.result, { stopped: true })
releaseRun()
assert.equal(await run.promise, null)

const denied = ai.createAgent({ name: 'Denied', path: 'denied' })
const deniedCall = ai.createToolCall(denied.id, {
  toolId: 'agent.delete',
  args: { agentId: createdAgent.id },
}, denied.id)
assert.equal(ai.previewToolCall(denied.id, deniedCall.id, denied.id).status, 'failed')
assert.equal(ai.findAgent(createdAgent.id) != null, true)

const deletedAgent = previewApply(root.id, 'agent.delete', { agentId: createdAgent.id }, root.id)
assert.equal(deletedAgent.id, createdAgent.id)
assert.equal(ai.findAgent(createdAgent.id), null)

const deletedGroup = previewApply(root.id, 'group.delete', { groupId: createdGroup.id }, 'user')
assert.equal(deletedGroup.id, createdGroup.id)
assert.equal(ai.findGroup(createdGroup.id), null)

console.log('ai orchestration tests ok')
