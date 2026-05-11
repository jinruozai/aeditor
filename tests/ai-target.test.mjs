import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/ai/name-generator.js', 'utf8'), { filename: 'ai/name-generator.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/target.js', 'utf8'), { filename: 'ai/target.js' })

const ai = window.aeditor.ai

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
    types: ['application/x-aeditor-ai-target-list'],
  },
}
ai.writeTargetDragData(dragEvent, [captured])
assert.equal(JSON.parse(dragPayload['application/x-aeditor-ai-target']).uri, captured.uri)
assert.equal(ai.readTargetFromDragEvent(dragEvent)[0].uri, captured.uri)

const textFileTarget = await ai.fileToTarget({
  name: 'note.txt',
  size: 11,
  type: 'text/plain',
  lastModified: 123,
  text: () => Promise.resolve('hello world'),
})
assert.equal(textFileTarget.resolver, 'file')
assert.equal(textFileTarget.kind, 'file.text')
assert.equal(textFileTarget.title, 'note.txt')
assert.equal(textFileTarget.meta.text, 'hello world')

let dropped = null
const dropEl = {
  classList: { add: () => {}, remove: () => {} },
  addEventListener: function (type, fn) { this[type] = fn },
  removeEventListener: function () {},
}
ai.installTargetDrop(dropEl, { onDrop: (targets) => { dropped = targets } })
const fileDropEvent = {
  preventDefault: () => {},
  dataTransfer: {
    dropEffect: '',
    types: ['Files'],
    files: [{ name: 'drop.md', size: 4, type: 'text/markdown', lastModified: 456, text: () => Promise.resolve('test') }],
    getData: () => '',
  },
}
dropEl.dragover(fileDropEvent)
dropEl.drop(fileDropEvent)
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(dropped.length, 1)
assert.equal(dropped[0].uri.startsWith('file://upload/drop.md'), true)
assert.equal(dropped[0].meta.text, 'test')

console.log('ai target tests ok')
