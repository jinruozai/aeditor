import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }

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

const EF = window.EF
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

const ws = EF.workspace.memory({
  'editorframe.project.json': JSON.stringify({
    type: 'editorframe-project',
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

const project = await EF.project.open(ws, { mount: {} })
assert.equal(project.id, 'case')
assert.equal(EF.project.current().id, 'case')
assert.equal(EF.componentRegistration('case.panel').owner, 'project:case')
assert.equal(EF.ai.toolMeta('case.ping').owner, 'project:case')
assert.deepEqual(EF.ai.readReference({ uri: 'case.ref://x', resolver: 'case.ref' }), { ok: true })

const file = await EF.ai.getTool('project.readFile').run({ path: 'src/panel.js' })
assert.equal(file.path, 'src/panel.js')
const ranged = await EF.ai.getTool('project.readFileRange').run({ path: 'src/panel.js', startLine: 2, endLine: 2 })
assert.equal(ranged.text.trim(), 'return 1')
const events = await EF.ai.getTool('project.readSource').run({ path: 'src/panel.js', projection: 'summary' })
assert.equal(events.lines, 4)
assert.equal(events.id, 'case')
const large = await EF.ai.getTool('project.readFile').run({ path: 'src/large.js', maxChars: 120, maxLines: 5 })
assert.equal(large.truncated, true)
assert.equal(Object.hasOwn(large, 'text'), false)
await EF.ai.getTool('project.patchFile').run({
  path: 'src/panel.js',
  baseHash: file.hash,
  patches: [{ startLine: 2, endLine: 2, replacement: '  return 2' }],
})
assert.equal((await ws.read('src/panel.js')).text.includes('return 2'), true)

assert.deepEqual(EF.ai.getTool('project.inspectPanel').run({ panelId: 'p1' }), { panelId: 'p1', status: 'ready' })

await EF.project.promotePanel({
  id: 'inventory',
  title: 'Inventory',
  dock: 'main',
  layoutPath: 'layout.json',
  source: 'function (propsSig, ctx) { var el = document.createElement("div"); el.textContent = "Inventory"; return el }',
})
assert.equal((await ws.read('src/panels/inventory.panel.js')).text.includes('case.inventory'), true)
assert.equal((await ws.read('layout.json')).text.includes('case.inventory'), true)

const descriptor = await ws.read('editorframe.project.json')
await ws.write('editorframe.project.json', '{ broken')
await assert.rejects(() => EF.project.reload('case'), /JSON/)
assert.equal(EF.project.current().id, 'case')
assert.equal(EF.componentRegistration('case.panel').owner, 'project:case')
await ws.write('editorframe.project.json', descriptor.text)

assert.equal(EF.project.close('case'), true)
assert.equal(cleaned, true)
assert.equal(EF.componentRegistration('case.panel'), null)
assert.equal(EF.ai.getTool('case.ping'), undefined)
assert.equal(EF.ai.references.get('case.ref'), null)
assert.equal(EF.ai.operations.get('case.op'), null)

window.NoApplyProject = {
  setup: function (ctx) {
    ctx.operation('noapply.op', {
      preview: function () { return { ok: true } },
      apply: function () { return { applied: true } },
    })
  },
}
const noApplyWs = EF.workspace.memory({
  'editorframe.project.json': JSON.stringify({
    type: 'editorframe-project',
    id: 'noapply',
    entry: { type: 'script', symbol: 'NoApplyProject' },
    permissions: {
      'workspace.read': true,
      'project.code.load': true,
    },
  }),
})
await EF.project.open(noApplyWs)
const preview = EF.ai.operations.preview('noapply.op', {})
assert.throws(() => EF.ai.operations.apply(preview), /ai\.operations\.apply/)
EF.project.close('noapply')

console.log('project runtime tests ok')
