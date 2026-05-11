import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/bus.js',
  'src/core/settings.js',
  'src/core/commands.js',
  'src/core/workspace.js',
  'src/core/registry.js',
  'src/ai/context.js',
  'src/ai/reference.js',
  'src/core/project.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor
let cleaned = false
window.CaseProject = {
  setup: function (ctx) {
    assert.equal(ctx.projectId, 'case')
    assert.equal(ctx.owner, 'project:case')
    ctx.component('case.panel', {
      factory: function () { return { tagName: 'DIV' } },
    })
    ctx.tool('case.ping', {
      run: function () { return 'pong' },
    })
    ctx.reference('case.ref', {
      read: function () { return { ok: true } },
    })
    ctx.operation('case.op', {
      preview: function () { return { ok: true } },
      apply: function () { return { applied: true } },
    })
    ctx.onCleanup(function () { cleaned = true })
  },
  mount: function () {
    return {
      destroyed: false,
      inspectPanel: function (panelId) { return { panelId: panelId, status: 'ready' } },
      destroy: function () { this.destroyed = true },
    }
  },
}

const ws = aeditor.workspace.memory({
  'aeditor.project.json': JSON.stringify({
    type: 'aeditor-project',
    schemaVersion: 1,
    id: 'case',
    title: 'Case Project',
    kind: 'app',
    entry: { type: 'script', symbol: 'CaseProject' },
    permissions: {
      'workspace.read': true,
      'workspace.write': true,
      'workspace.delete': true,
      'project.code.load': true,
      'project.reload': true,
      'ai.tools.register': true,
      'ai.operations.apply': true,
    },
  }),
  'src/panel.js': 'function panel() {\n  return 1\n}\n',
  'src/large.js': Array.from({ length: 900 }, (_, i) => 'line ' + i).join('\n'),
  'layout.json': JSON.stringify({ root: { type: 'dock', id: 'dock-1', name: 'main', panels: [], activeId: null } }),
})

const project = await aeditor.project.open(ws, { mount: {} })
assert.equal(project.id, 'case')
assert.equal(aeditor.project.current().id, 'case')
assert.equal(aeditor.componentRegistration('case.panel').owner, 'project:case')
assert.equal(aeditor.ai.toolMeta('case.ping').owner, 'project:case')
assert.deepEqual(aeditor.ai.readReference({ uri: 'case.ref://x', resolver: 'case.ref' }), { ok: true })

const file = await aeditor.ai.getTool('project.readFile').run({ path: 'src/panel.js' })
assert.equal(file.path, 'src/panel.js')
const ranged = await aeditor.ai.getTool('project.readFileRange').run({ path: 'src/panel.js', startLine: 2, endLine: 2 })
assert.equal(ranged.text.trim(), 'return 1')
const events = await aeditor.ai.getTool('project.readSource').run({ path: 'src/panel.js', projection: 'summary' })
assert.equal(events.lines, 4)
assert.equal(events.id, 'case')
const large = await aeditor.ai.getTool('project.readFile').run({ path: 'src/large.js', maxChars: 120, maxLines: 5 })
assert.equal(large.truncated, true)
assert.equal(Object.hasOwn(large, 'text'), false)
await aeditor.ai.getTool('project.patchFile').run({
  path: 'src/panel.js',
  baseHash: file.hash,
  patches: [{ startLine: 2, endLine: 2, replacement: '  return 2' }],
})
assert.equal((await ws.read('src/panel.js')).text.includes('return 2'), true)

assert.deepEqual(aeditor.ai.getTool('project.inspectPanel').run({ panelId: 'p1' }), { panelId: 'p1', status: 'ready' })

await aeditor.project.promotePanel({
  id: 'inventory',
  title: 'Inventory',
  dock: 'main',
  layoutPath: 'layout.json',
  source: 'function (propsSig, ctx) { var el = document.createElement("div"); el.textContent = "Inventory"; return el }',
})
assert.equal((await ws.read('src/panels/inventory.panel.js')).text.includes('case.inventory'), true)
assert.equal((await ws.read('layout.json')).text.includes('case.inventory'), true)

const descriptor = await ws.read('aeditor.project.json')
await ws.write('aeditor.project.json', '{ broken')
await assert.rejects(() => aeditor.project.reload('case'), /JSON/)
assert.equal(aeditor.project.current().id, 'case')
assert.equal(aeditor.componentRegistration('case.panel').owner, 'project:case')
await ws.write('aeditor.project.json', descriptor.text)

assert.equal(aeditor.project.close('case'), true)
assert.equal(cleaned, true)
assert.equal(aeditor.componentRegistration('case.panel'), null)
assert.equal(aeditor.ai.getTool('case.ping'), undefined)
assert.equal(aeditor.ai.references.get('case.ref'), null)
assert.equal(aeditor.ai.operations.get('case.op'), null)

window.NoApplyProject = {
  setup: function (ctx) {
    ctx.operation('noapply.op', {
      preview: function () { return { ok: true } },
      apply: function () { return { applied: true } },
    })
  },
}
const noApplyWs = aeditor.workspace.memory({
  'aeditor.project.json': JSON.stringify({
    type: 'aeditor-project',
    id: 'noapply',
    entry: { type: 'script', symbol: 'NoApplyProject' },
    permissions: {
      'workspace.read': true,
      'project.code.load': true,
    },
  }),
})
await aeditor.project.open(noApplyWs)
const preview = aeditor.ai.operations.preview('noapply.op', {})
assert.throws(() => aeditor.ai.operations.apply(preview), /ai\.operations\.apply/)
aeditor.project.close('noapply')

console.log('project runtime tests ok')
