import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/log.js', 'utf8'), { filename: 'log.js' })
vm.runInThisContext(readFileSync('src/ai/name-generator.js', 'utf8'), { filename: 'ai/name-generator.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/context.js', 'utf8'), { filename: 'ai/context.js' })
vm.runInThisContext(readFileSync('src/ai/reference.js', 'utf8'), { filename: 'ai/reference.js' })

const ai = window.aeditor.ai
let value = 1
const tx = []

ai.references.register('case', {
  read: function (ref) {
    return { uri: ref.uri, value }
  },
  schema: function () {
    return { type: 'object', properties: { value: { type: 'number' } } }
  },
  capabilities: function () {
    return [{ op: 'case.setValue', risk: 'edit' }]
  },
  search: function (query) {
    return query.kind === 'case.item' ? [{ uri: 'case://item/one', kind: 'case.item', title: 'One' }] : []
  },
  selection: function () {
    return [{ uri: 'case://item/one', kind: 'case.item', title: 'One' }]
  },
})

ai.transactions.configure({
  run(label, fn, meta) {
    tx.push({ label, meta })
    return fn()
  },
})

ai.operations.register('case.setValue', {
  title: 'Set Value',
  schema: { type: 'object', required: ['value'], properties: { value: { type: 'number' } } },
  risk: 'edit',
  preview: function (input) {
    if (typeof input.value !== 'number') return { ok: false, errors: [{ path: 'value', message: 'value must be number' }] }
    return {
      title: 'Set value',
      summary: `${value} -> ${input.value}`,
      changes: [{ ref: 'case://item/one', field: 'value', before: value, after: input.value }],
      next: input.value,
    }
  },
  apply: function (preview) {
    value = preview.next
    return { applied: true, value }
  },
})

const ref = ai.normalizeReference('case://item/one')
assert.equal(ref.resolver, 'case')
assert.deepEqual(ai.readReference(ref), { uri: 'case://item/one', value: 1 })
assert.equal(ai.referenceSchema(ref).properties.value.type, 'number')
assert.deepEqual(ai.referenceCapabilities(ref), [{ op: 'case.setValue', risk: 'edit' }])
assert.equal(ai.references.search({ kind: 'case.item' })[0].uri, 'case://item/one')
assert.equal(ai.references.selection()[0].uri, 'case://item/one')

const invalid = ai.previewOperation('case.setValue', { value: 'bad' })
assert.equal(invalid.ok, false)
assert.equal(value, 1)

const preview = ai.previewOperation('case.setValue', { value: 7 })
assert.equal(preview.ok, true)
assert.equal(preview.risk, 'edit')
assert.equal(preview.changes[0].after, 7)
const applied = ai.applyOperation(preview)
assert.equal(applied.applied, true)
assert.equal(value, 7)
assert.equal(tx[0].label, 'Set value')
assert.equal(tx[0].meta.op, 'case.setValue')

const agent = ai.createAgent({ name: 'Reference Agent' })
const runTool = ai.createToolCall(agent.id, { toolId: 'aeditor.readReference', args: { uri: 'case://item/one' } }, 'user')
ai.approveToolCall(agent.id, runTool.id, 'user')
const run = ai.runToolCall(agent.id, runTool.id, 'user')
await run.promise
assert.equal(ai.findToolCall(agent.id, runTool.id).toolCall.result.value, 7)

const applyTool = ai.createToolCall(agent.id, { toolId: 'aeditor.applyOperation', args: { op: 'case.setValue', input: { value: 9 } } }, 'user')
ai.previewToolCall(agent.id, applyTool.id, 'user')
assert.equal(ai.findToolCall(agent.id, applyTool.id).toolCall.preview.changes[0].after, 9)
ai.approveToolCall(agent.id, applyTool.id, 'user')
ai.applyToolCall(agent.id, applyTool.id, 'user')
assert.equal(value, 9)

console.log('ai reference operation tests ok')
