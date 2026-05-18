import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = {
  aeditor: {},
  localStorage: {
    getItem: function () { return null },
    setItem: function () {},
  },
}

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/names.js',
  'src/core/runtime.js',
  'src/core/settings.js',
  'src/core/commands.js',
  'src/core/registry.js',
  'src/ai/registries.js',
  'src/ai/reference.js',
  'src/ui/inspector.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor

await aeditor.runtime.loadScript({
  id: 'runtime-loader-case',
  source: [
    "aeditor.registerComponent('case.loadedPanel', { factory: function () { return { tagName: 'DIV' } } })",
    "aeditor.commands.register('case.refresh', { title: 'Refresh' })",
    "aeditor.commands.registerMenu('case.menu.refresh', { target: 'case.menu', command: 'case.refresh' })",
    "aeditor.settings.registerSection('case.settings', { title: 'Case' })",
    "aeditor.settings.registerSchema('case.settings', { key: 'case.enabled', type: 'boolean' })",
    "aeditor.ai.tools.register('case.tool', { run: function () { return 'ok' } })",
    "aeditor.ai.context.register('case.context', { capture: function () { return 'ctx' } })",
    "aeditor.ai.references.register('case.ref', { read: function () { return { ok: true } } })",
    "aeditor.ai.operations.register('case.op', { preview: function () { return { ok: true } }, apply: function () { return { applied: true } } })",
    "aeditor.inspector.registerProvider('case.target', { inspect: function () { return { values: [{ id: 1 }], schema: { id: { type: 'int' } } } } })",
  ].join('\n'),
  owner: 'project:runtime-loader',
  layer: 'project',
})

assert.equal(aeditor.componentRegistration('case.loadedPanel').owner, 'project:runtime-loader')
assert.equal(aeditor.commands.meta('case.refresh').owner, 'project:runtime-loader')
assert.equal(aeditor.commands.menuMeta('case.menu.refresh').owner, 'project:runtime-loader')
assert.equal(aeditor.settings.sectionMeta('case.settings').owner, 'project:runtime-loader')
assert.equal(aeditor.settings.schemaMeta('case.enabled').owner, 'project:runtime-loader')
assert.equal(aeditor.ai.toolMeta('case.tool').owner, 'project:runtime-loader')
assert.equal(aeditor.ai.context.meta('case.context').owner, 'project:runtime-loader')
assert.equal(aeditor.ai.references.meta('case.ref').owner, 'project:runtime-loader')
assert.equal(aeditor.ai.operations.meta('case.op').owner, 'project:runtime-loader')
assert.equal(aeditor.inspector.providerMeta('case.target').owner, 'project:runtime-loader')

await aeditor.runtime.loadScript({
  id: 'runtime-loader-case',
  source: "aeditor.registerComponent('case.loadedPanel', { defaults: function () { return { title: 'Reloaded' } }, factory: function () { return { tagName: 'DIV' } } })",
  owner: 'project:runtime-loader',
  layer: 'project',
  replace: true,
})
assert.equal(aeditor.componentDefaults('case.loadedPanel').title, 'Reloaded')

const removed = aeditor.runtime.unloadOwner('project:runtime-loader')
assert.deepEqual(removed.components, ['case.loadedPanel'])
assert.equal(aeditor.componentRegistration('case.loadedPanel'), null)
assert.equal(aeditor.commands.get('case.refresh'), null)
assert.equal(aeditor.settings.sectionMeta('case.settings').owner, undefined)
assert.equal(aeditor.ai.tools.get('case.tool'), undefined)
assert.equal(aeditor.ai.references.get('case.ref'), null)
assert.equal(aeditor.ai.operations.get('case.op'), null)
assert.equal(aeditor.inspector.providerFor([{ type: 'case.target' }]), null)

console.log('runtime loader tests ok')
