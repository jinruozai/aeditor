import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }

for (const file of [
  'src/core/names.js',
  'src/core/runtime.js',
  'src/ai/registries.js',
  'src/ai/skills.js',
  'src/ai/reference.js',
  'src/ai/skill-reference.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor
const refs = aeditor.ai.references.search({ query: 'skills', limit: 20 })
assert.equal(refs[0].uri, 'aeditor://skills')
assert.ok(refs.some(function (ref) { return ref.uri === 'aeditor://skills/aeditor.runtime-authoring' }))
assert.ok(refs.some(function (ref) { return ref.uri === 'aeditor://skills/aeditor.library-authoring' }))

const index = aeditor.ai.references.read({ uri: 'aeditor://skills' })
assert.ok(index.entries.some(function (entry) { return entry.id === 'aeditor.runtime-authoring' }))
assert.ok(index.entries.some(function (entry) { return /live editor/.test(entry.whenToUse) }))

const runtime = aeditor.ai.references.read({ uri: 'aeditor://skills/aeditor.runtime-authoring' })
assert.equal(runtime.id, 'aeditor.runtime-authoring')
assert.ok(runtime.relatedApis.includes('aeditor.addPanelToDock'))
assert.ok(runtime.rules.some(function (rule) { return /inspect docks/.test(rule) }))

const libraryRefs = aeditor.ai.references.search({ query: 'library authoring repository', limit: 20 })
assert.ok(libraryRefs.some(function (ref) { return ref.uri === 'aeditor://skills/aeditor.library-authoring' }))

const caps = aeditor.ai.references.capabilities({ uri: 'aeditor://skills/aeditor.runtime-authoring' })
assert.deepEqual(caps, ['read'])

console.log('skill reference tests ok')
