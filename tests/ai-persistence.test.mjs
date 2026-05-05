import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function storage() {
  const data = {}
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
    setItem: function (key, value) { data[key] = String(value) },
    removeItem: function (key) { delete data[key] },
  }
}

global.window = { EF: {}, localStorage: storage() }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })

let ai = window.EF.ai
ai.configurePersistence({ key: 'test.ai', load: false })
const parent = ai.createAgent({ name: 'Saved Parent' })
const agent = ai.createAgent({
  name: 'Saved Agent',
  parentAgentId: parent.id,
  messages: [{ role: 'user', content: 'hello' }],
})
const res = ai.addResource({ resolver: 'case', uri: 'case://one', title: 'One' })
ai.updateAgent(agent.id, { contextRefs: [res.id] })
ai.updateAgent(agent.id, {
  status: 'running',
  statusText: 'doing work',
  activeMessageId: agent.messages[0].id,
  queue: [{ messageId: agent.messages[0].id }],
  messages: agent.messages.concat([{ role: 'user', content: 'in flight', status: 'running' }]),
  quests: [{ id: 'q1', requestMessageId: 'q1', status: 'running' }],
})
ai.save()

const stored = JSON.parse(window.localStorage.getItem('test.ai'))
assert.equal(stored.version, 2)
assert.equal(stored.agents.length, 2)
assert.equal(stored.resources.length, 1)
assert.equal('groups' in stored, false)
assert.equal('path' in stored.agents[1], false)
assert.equal('groupId' in stored.agents[1], false)
assert.deepEqual(stored.agents[1].contextRefs, [])

global.window.EF = {}
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js#2' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js#2' })
ai = window.EF.ai
ai.configurePersistence({ key: 'test.ai' })

const restored = ai.agents().find(function (item) { return item.id === agent.id })
assert.equal(restored.name, 'Saved Agent')
assert.equal(restored.parentAgentId, parent.id)
assert.equal(restored.messages[0].content, 'hello')
assert.equal(restored.status, 'idle')
assert.equal(restored.statusText, '')
assert.equal(restored.activeMessageId, null)
assert.equal(restored.queue.length, 0)
assert.equal(restored.messages[1].status, 'stopped')
assert.equal(restored.quests[0].status, 'stopped')
assert.deepEqual(restored.contextRefs, [])
assert.equal(ai.resources()[0].uri, 'case://one')
assert.equal(ai.activeAgentId(), agent.id)

ai.clearStoredState()
assert.equal(window.localStorage.getItem('test.ai'), null)

console.log('ai persistence tests ok')
