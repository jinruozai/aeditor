import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function storage() {
  const data = {}
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
    setItem: function (key, value) { data[key] = String(value) },
    removeItem: function (key) { delete data[key] },
    dump: function () { return Object.assign({}, data) },
  }
}

global.window = { EF: {}, localStorage: storage() }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })

let ai = window.EF.ai
ai.configurePersistence({ key: 'test.ai', load: false })
const group = ai.createGroup({ name: 'Saved Group' })
const agent = ai.createAgent({
  name: 'Saved Agent',
  path: 'saved/agent',
  groupId: group.id,
  messages: [{ role: 'user', content: 'hello' }],
})
const res = ai.addResource({ resolver: 'case', uri: 'case://one', title: 'One' })
ai.updateAgent(agent.id, { contextRefs: [res.id] })
ai.save()

const stored = JSON.parse(window.localStorage.getItem('test.ai'))
assert.equal(stored.groups.length, 1)
assert.equal(stored.agents.length, 1)
assert.equal(stored.resources.length, 1)
assert.deepEqual(stored.agents[0].contextRefs, [])

global.window.EF = {}
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js#2' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js#2' })
ai = window.EF.ai
ai.configurePersistence({ key: 'test.ai' })

assert.equal(ai.groups()[0].name, 'Saved Group')
assert.equal(ai.agents()[0].name, 'Saved Agent')
assert.equal(ai.agents()[0].messages[0].content, 'hello')
assert.deepEqual(ai.agents()[0].contextRefs, [])
assert.equal(ai.resources()[0].uri, 'case://one')
assert.equal(ai.activeAgentId(), agent.id)

ai.clearStoredState()
assert.equal(window.localStorage.getItem('test.ai'), null)

console.log('ai persistence tests ok')
