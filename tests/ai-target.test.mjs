import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/target.js', 'utf8'), { filename: 'ai/target.js' })

const ai = window.EF.ai

ai.registerTargetProvider('case', {
  match: function (source) { return source && source.kind === 'case-source' },
  capture: function (source) {
    return {
      uri: 'case://item/' + source.id,
      kind: 'case.item',
      title: source.title,
      meta: { id: source.id },
      tools: ['case.read'],
    }
  },
})

assert.deepEqual(ai.listTargetProviders(), ['case'])

const captured = ai.captureTarget({ kind: 'case-source', id: 'a', title: 'A' })
assert.equal(captured.uri, 'case://item/a')
assert.equal(captured.resolver, 'case')
assert.deepEqual(captured.meta, { id: 'a' })

const resource = ai.addTarget(captured)
const same = ai.addTarget(captured)
assert.equal(resource.id, same.id)
assert.equal(ai.resources().length, 1)

const agent = ai.createAgent({ name: 'Target Agent', path: 'target-agent' })
ai.attachTargetToAgent(agent.id, captured)
ai.attachTargetsToAgent(agent.id, [captured, { uri: 'case://item/b', kind: 'case.item', title: 'B' }])

const after = ai.findAgent(agent.id)
assert.equal(after.contextRefs.length, 2)
assert.equal(ai.resources().length, 2)

let dragPayload = {}
const dragEvent = {
  dataTransfer: {
    effectAllowed: '',
    setData: function (type, value) { dragPayload[type] = value },
    getData: function (type) { return dragPayload[type] || '' },
    types: ['application/x-ef-ai-target-list'],
  },
}
ai.writeTargetDragData(dragEvent, [captured])
assert.equal(JSON.parse(dragPayload['application/x-ef-ai-target']).uri, captured.uri)
assert.equal(ai.readTargetFromDragEvent(dragEvent)[0].uri, captured.uri)

console.log('ai target tests ok')
