import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
global.aeditor = global.window.aeditor

for (const file of [
  'src/core/signal.js',
  'src/ai/change-set.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const cs = aeditor.changeSet.create({
  title: 'Edit price',
  resources: [{
    uri: 'gde://entity/data%2Fitems/100',
    kind: 'gde.entity',
    title: 'Iron Sword',
    changes: [{ kind: 'gde.field', path: 'price', before: 10, after: 12 }],
  }],
  apply: { mode: 'atomic', adapter: 'test.patch', payload: { value: 12 } },
})

assert.equal(cs.type, 'aeditor.changeSet')
assert.equal(cs.summary.changeCount, 1)
assert.equal(cs.summary.updates, 1)
assert.equal(aeditor.changeSet.find(cs.id).id, cs.id)

let appliedPayload = null
aeditor.changeSet.registerAdapter('test.patch', {
  apply: function (set, scope) {
    appliedPayload = set.apply.payload
    assert.deepEqual(scope, { type: 'all' })
    return Promise.resolve({ applied: true, payload: set.apply.payload })
  },
})

const applied = await aeditor.changeSet.apply(cs.id, { type: 'all' }, 'user')
assert.equal(applied.status, 'applied')
assert.deepEqual(appliedPayload, { value: 12 })
assert.equal(applied.resources[0].changes[0].status, 'applied')

const failed = aeditor.changeSet.create({
  title: 'Bad edit',
  resources: [{ uri: 'x', changes: [{ before: 1, after: 2 }] }],
  apply: { mode: 'atomic', adapter: 'bad.patch', payload: {} },
})
aeditor.changeSet.registerAdapter('bad.patch', {
  apply: function () {
    return { ok: false, validation: { errors: [{ path: 'ops[0]', message: 'bad' }] } }
  },
})
const failedResult = await aeditor.changeSet.apply(failed, { type: 'all' }, 'user')
assert.equal(failedResult.status, 'failed')
assert.match(failedResult.meta.error, /bad/)

const rejected = await aeditor.changeSet.reject(failed.id, { type: 'all' }, 'user')
assert.equal(rejected.status, 'rejected')

console.log('change set tests ok')
