import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
const bridgeCalls = []
global.fetch = function (url, opts) {
  bridgeCalls.push({ url: String(url), opts: opts || {} })
  if (String(url).endsWith('/verify/list')) {
    return Promise.resolve({
      ok: true,
      text: function () { return Promise.resolve(JSON.stringify({ checks: [{ id: 'check', title: 'npm run check' }] })) },
    })
  }
  if (String(url).endsWith('/verify/run')) {
    const body = JSON.parse(opts && opts.body || '{}')
    return Promise.resolve({
      ok: true,
      text: function () { return Promise.resolve(JSON.stringify({ ok: true, check: body.check, output: 'checked' })) },
    })
  }
  if (String(url).endsWith('/verify/diagnostics')) {
    return Promise.resolve({
      ok: true,
      text: function () { return Promise.resolve(JSON.stringify({ diagnostics: [{ source: 'bridge', message: 'ok' }] })) },
    })
  }
  return Promise.resolve({
    ok: false,
    statusText: 'Not Found',
    text: function () { return Promise.resolve(JSON.stringify({ error: 'not found' })) },
  })
}

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/bus.js',
  'src/core/names.js',
  'src/core/settings.js',
  'src/core/commands.js',
  'src/core/workspace.js',
  'src/core/registry.js',
  'src/ai/name-generator.js',
  'src/ai/store.js',
  'src/ai/context.js',
  'src/ai/workdir.js',
  'src/ai/verify.js',
  'src/ai/reference.js',
  'src/ai/request.js',
  'demo/project.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor

const closedProjectAgent = aeditor.ai.createAgent({ name: 'Closed Project Agent' })
const closedProjectRequest = aeditor.ai.makeRequest(closedProjectAgent, null, 'run_closed_project', 'user', 0)
assert.equal(closedProjectRequest.tools.some(function (tool) { return tool.indexOf('demo.project.') === 0 }), false)
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
      inspectPanels: function () { return [{ panelId: 'p1', status: 'ready' }] },
      destroy: function () { this.destroyed = true },
    }
  },
  check: function () {
    return { ok: true, checked: true, diagnostics: [] }
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
    layout: 'layout.json',
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

aeditor.ai.setWorkspace(ws, { id: 'memory:case', label: 'Case Folder', kind: 'memory' })
const workspaceProjectRequest = aeditor.ai.makeRequest(closedProjectAgent, null, 'run_workspace_project', 'user', 0)
assert.equal(workspaceProjectRequest.tools.includes('demo.project.openWorkspace'), false)
assert.equal(workspaceProjectRequest.tools.includes('demo.project.mountPanel'), true)
const openedFromWorkspace = await aeditor.ai.tools.get('demo.project.openWorkspace').run({})
assert.equal(openedFromWorkspace.id, 'case')
assert.equal(window.Demo.project.current().id, 'case')

const project = await window.Demo.project.open(ws, { mount: {} })
assert.equal(project.id, 'case')
assert.equal(window.Demo.project.current().id, 'case')
assert.equal(aeditor.ai.currentWorkspace(), ws)
assert.deepEqual(aeditor.ai.workspaceMeta(), { id: 'demo.project:case', label: 'Case Project', kind: 'demo-project' })
const openProjectRequest = aeditor.ai.makeRequest(closedProjectAgent, null, 'run_open_project', 'user', 0)
assert.equal(openProjectRequest.tools.includes('demo.project.readDescriptor'), true)
assert.equal(openProjectRequest.tools.includes('demo.project.writeFile'), false)
assert.equal(openProjectRequest.tools.includes('demo.project.createFile'), false)
assert.equal(openProjectRequest.tools.includes('demo.project.patchFile'), false)
assert.equal(openProjectRequest.tools.includes('workspace.writeFile'), true)
assert.equal(openProjectRequest.tools.includes('workspace.patchFile'), true)
assert.equal(aeditor.componentRegistration('case.panel').owner.startsWith('project:case'), true)
assert.equal(aeditor.ai.toolMeta('case.ping').owner.startsWith('project:case'), true)
assert.deepEqual(aeditor.ai.references.read({ uri: 'case.ref://x', resolver: 'case.ref' }), { ok: true })

const file = await aeditor.ai.tools.get('demo.project.readFile').run({ path: 'src/panel.js' })
assert.equal(file.path, 'src/panel.js')
const ranged = await aeditor.ai.tools.get('demo.project.readFileRange').run({ path: 'src/panel.js', startLine: 2, endLine: 2 })
assert.equal(ranged.text.trim(), 'return 1')
const events = await aeditor.ai.tools.get('demo.project.readSource').run({ path: 'src/panel.js', projection: 'summary' })
assert.equal(events.lines, 4)
assert.equal(events.id, 'case')
const large = await aeditor.ai.tools.get('demo.project.readFile').run({ path: 'src/large.js', maxChars: 120, maxLines: 5 })
assert.equal(large.truncated, true)
assert.equal(Object.hasOwn(large, 'text'), false)
await aeditor.ai.tools.get('demo.project.patchFile').run({
  path: 'src/panel.js',
  baseHash: file.hash,
  patches: [{ startLine: 2, endLine: 2, replacement: '  return 2' }],
})
assert.equal((await ws.read('src/panel.js')).text.includes('return 2'), true)

assert.deepEqual(aeditor.ai.tools.get('demo.project.inspectPanel').run({ panelId: 'p1' }), { panelId: 'p1', status: 'ready' })
const verifyChecks = await aeditor.ai.tools.get('verify.list').run({})
assert.deepEqual(verifyChecks, [{
  id: 'demo.project.check',
  title: 'Project Check',
  projectId: 'case',
  projectTitle: 'Case Project',
}, { source: 'bridge', id: 'check', title: 'npm run check' }])
assert.equal((await aeditor.ai.tools.get('verify.run').run({ check: 'demo.project.check' })).ok, true)
assert.equal((await aeditor.ai.tools.get('verify.run').run({ check: 'check' })).output, 'checked')
assert.deepEqual(await aeditor.ai.tools.get('verify.diagnostics').run({}), [{ source: 'bridge', message: 'ok' }])
assert.ok(bridgeCalls.some(function (call) { return call.url.endsWith('/verify/run') }))
assert.equal(aeditor.ai.tools.get('demo.project.promotePanel'), undefined)
assert.equal(window.Demo.project.promotePanel, undefined)

await ws.write('src/panels/equipment.panel.js', [
  ';(function (aeditor, Demo) {',
  "  'use strict'",
  "  Demo.project.component('case.equipment', {",
  "    defaults: function () { return { title: 'Equipment', icon: 'sword', props: {} } },",
  '    factory: function () { return { tagName: "DIV" } },',
  '  })',
  '})(window.aeditor = window.aeditor || {}, window.Demo = window.Demo || {})',
  '',
].join('\n'))
const addPanelResult = await aeditor.ai.tools.get('demo.project.addPanel').run({
  component: 'case.equipment',
  dock: 'main',
  title: 'Equipment',
  icon: 'sword',
  entryPath: 'src/panels/equipment.panel.js',
})
assert.equal(addPanelResult.component, 'case.equipment')
assert.equal((await ws.read('layout.json')).text.includes('case.equipment'), true)
assert.equal((await ws.read('aeditor.project.json')).text.includes('src/panels/equipment.panel.js'), true)
assert.equal(aeditor.componentRegistration('case.equipment').owner.startsWith('project:case'), true)

const stableDescriptor = await ws.read('aeditor.project.json')
const stableLayout = await ws.read('layout.json')
await ws.write('src/panels/broken.panel.js', 'throw new Error("broken panel file")\n')
await assert.rejects(() => aeditor.ai.tools.get('demo.project.addPanel').run({
  component: 'case.broken',
  dock: 'main',
  title: 'Broken',
  entryPath: 'src/panels/broken.panel.js',
}), /broken panel file/)
assert.equal(window.Demo.project.current().id, 'case')
assert.equal(aeditor.componentRegistration('case.panel').owner.startsWith('project:case'), true)
assert.equal((await ws.read('aeditor.project.json')).text, stableDescriptor.text)
assert.equal((await ws.read('layout.json')).text, stableLayout.text)
await ws.write('layout.json', JSON.stringify({
  root: {
    type: 'dock',
    id: 'dock-1',
    name: 'main',
    panels: [{ id: 'panel-inventory', component: 'case.inventory', title: 'Inventory', icon: '', props: {}, owner: 'project:case' }],
    activeId: 'panel-inventory',
  },
}, null, 2), { baseHash: (await ws.read('layout.json')).hash })

const descriptor = await ws.read('aeditor.project.json')
await ws.write('aeditor.project.json', '{ broken')
await assert.rejects(() => window.Demo.project.reload('case'), /JSON/)
assert.equal(window.Demo.project.current().id, 'case')
assert.equal(aeditor.componentRegistration('case.panel').owner.startsWith('project:case'), true)
await ws.write('aeditor.project.json', descriptor.text)

assert.equal(window.Demo.project.close('case'), true)
assert.equal(aeditor.ai.currentWorkspace(), null)
assert.equal(cleaned, true)
assert.equal(aeditor.componentRegistration('case.panel'), null)
assert.equal(aeditor.ai.tools.get('case.ping'), undefined)
assert.equal(aeditor.ai.references.get('case.ref'), null)
assert.equal(aeditor.ai.operations.get('case.op'), null)

window.NoWorkspaceReadProject = {
  setup: function (ctx) {
    ctx.component('noread.panel', {
      factory: function () { return { tagName: 'DIV' } },
    })
  },
}
const noWorkspaceReadWs = aeditor.workspace.memory({
  'aeditor.project.json': JSON.stringify({
    type: 'aeditor-project',
    id: 'noread',
    entry: { type: 'script', symbol: 'NoWorkspaceReadProject' },
    layout: 'layout.json',
    permissions: {
      'project.code.load': true,
    },
  }),
  'layout.json': JSON.stringify({ root: { type: 'dock', id: 'dock-1', name: 'main', panels: [], activeId: null } }),
})
const noWorkspaceReadProject = await window.Demo.project.open(noWorkspaceReadWs)
assert.equal(noWorkspaceReadProject.id, 'noread')
assert.equal((await aeditor.ai.tools.get('demo.project.readFile').run({ projectId: 'noread', path: 'layout.json' })).path, 'layout.json')
assert.throws(() => noWorkspaceReadProject.ctx.workspace.read('layout.json'), /workspace\.read/)
window.Demo.project.close('noread')

const componentOnlyWs = aeditor.workspace.memory({
  'aeditor.project.json': JSON.stringify({
    type: 'aeditor-project',
    id: 'componentonly',
    title: 'Component Only',
    entries: [{ type: 'script', src: 'inventory.panel.js' }],
    layout: 'aeditor.layout.json',
    permissions: {
      'project.code.load': true,
    },
  }),
  'aeditor.layout.json': JSON.stringify({ root: { type: 'dock', id: 'dock-main', name: 'main', panels: [], activeId: null } }),
  'inventory.panel.js': [
    ';(function (aeditor, Demo) {',
    "  'use strict'",
    "  Demo.project.component('componentonly.inventory', {",
    "    defaults: function () { return { title: 'Inventory', icon: 'box', props: {} } },",
    '    factory: function () { return { tagName: "DIV" } }',
    '  })',
    '})(window.aeditor = window.aeditor || {}, window.Demo = window.Demo || {})',
    '',
  ].join('\n'),
})
await window.Demo.project.open(componentOnlyWs)
assert.equal(window.Demo.project.current().id, 'componentonly')
assert.equal(aeditor.componentRegistration('componentonly.inventory').owner.startsWith('project:componentonly'), true)
const componentOnlyMount = await aeditor.ai.tools.get('demo.project.mountPanel').run({
  component: 'componentonly.inventory',
  entryPath: 'inventory.panel.js',
  dock: 'main',
  title: 'Inventory',
})
assert.equal(componentOnlyMount.mounted, true)
assert.equal((await componentOnlyWs.read('aeditor.layout.json')).text.includes('componentonly.inventory'), true)
window.Demo.project.close('componentonly')

const bootstrapWs = aeditor.workspace.memory({
  'aeditor.project.json': JSON.stringify({ id: 'bootstrap-demo', name: 'Bootstrap Demo' }),
  'panel.js': [
    ';(function (aeditor, Demo) {',
    "  'use strict'",
    "  Demo.project.component('bootstrap.panel', {",
    "    defaults: function () { return { title: 'Bootstrap', props: {} } },",
    '    factory: function () { return { tagName: "DIV" } }',
    '  })',
    '})(window.aeditor = window.aeditor || {}, window.Demo = window.Demo || {})',
    '',
  ].join('\n'),
})
aeditor.ai.setWorkspace(bootstrapWs, { id: 'memory:bootstrap', label: 'Bootstrap', kind: 'memory' })
const bootstrapped = await aeditor.ai.tools.get('demo.project.mountPanel').run({
  component: 'bootstrap.panel',
  entryPath: 'panel.js',
  dock: 'main',
  title: 'Bootstrap',
})
assert.equal(bootstrapped.mounted, true)
assert.equal(JSON.parse((await bootstrapWs.read('aeditor.project.json')).text).type, 'aeditor-project')
assert.equal((await bootstrapWs.read('aeditor.layout.json')).text.includes('bootstrap.panel'), true)
window.Demo.project.close('bootstrap-demo')

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
await window.Demo.project.open(noApplyWs)
const preview = aeditor.ai.operations.preview('noapply.op', {})
assert.throws(() => aeditor.ai.operations.apply(preview), /ai\.operations\.apply/)
window.Demo.project.close('noapply')

console.log('project runtime tests ok')
