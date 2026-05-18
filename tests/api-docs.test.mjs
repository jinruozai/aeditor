import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }

for (const file of [
  'src/core/names.js',
  'src/core/runtime.js',
  'src/ai/registries.js',
  'src/ai/reference.js',
  'src/ai/api-docs.generated.js',
  'src/ai/api-reference.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor
const payload = JSON.parse(readFileSync('dist/aeditor-api.json', 'utf8'))
assert.equal(payload.version, 1)
assert.ok(payload.entries.some((entry) => entry.id === 'aeditor.inspector.registerProvider'))
assert.ok(payload.entries.some((entry) => entry.id === 'aeditor.addPanelToDock'))
assert.ok(payload.entries.some((entry) => entry.id === 'aeditor.reloadPanel'))

const refs = aeditor.ai.references.search({ query: 'inspector registerProvider', limit: 5 })
assert.ok(refs.some((ref) => ref.uri === 'aeditor://api/aeditor.inspector.registerProvider'))

const allRefs = aeditor.ai.references.search({ query: '', limit: 50 })
assert.equal(allRefs[0].uri, 'aeditor://api')
assert.ok(allRefs.some((ref) => ref.uri === 'aeditor://api/aeditor.addPanelToDock'))
assert.ok(allRefs.some((ref) => ref.uri === 'aeditor://api/aeditor.reloadPanel'))

const indexDoc = aeditor.ai.references.read({ uri: 'aeditor://api' })
assert.ok(indexDoc.entries.some((entry) => entry.id === 'aeditor.inspector.registerProvider'))

const doc = aeditor.ai.references.read({ uri: 'aeditor://api/aeditor.inspector.registerProvider' })
assert.equal(doc.id, 'aeditor.inspector.registerProvider')
assert.match(doc.signature, /registerProvider/)

const caps = aeditor.ai.references.capabilities({ uri: 'aeditor://api/aeditor.inspector.registerProvider' })
assert.deepEqual(caps, ['read'])

console.log('api docs tests ok')
