import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function storage() {
  const data = {}
  return {
    data: data,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
    setItem: function (key, value) { data[key] = String(value) },
    removeItem: function (key) { delete data[key] },
  }
}

const memory = storage()
global.window = { aeditor: {}, localStorage: memory }
global.document = {
  createElement: function (tag) {
    return {
      tagName: String(tag || '').toUpperCase(),
      children: [],
      className: '',
      textContent: '',
      style: {},
      dataset: {},
      appendChild: function (child) { this.children.push(child); return child },
      setAttribute: function (name, value) { this[name] = String(value) },
    }
  },
}

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/names.js',
  'src/core/settings.js',
  'src/core/commands.js',
  'src/tree/tree.js',
  'src/core/registry.js',
  'src/ai/name-generator.js',
  'src/ai/permission.js',
  'src/ai/store.js',
  'src/ai/registries.js',
  'src/ai/context.js',
  'src/ai/reference.js',
  'src/extensions/manifest.js',
  'src/extensions/install.js',
  'src/extensions/runtime.js',
  'src/extensions/ai.js',
  'src/ai/request.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aeditor = window.aeditor
const ai = aeditor.ai
assert.equal(ai.tools.get('aeditor.createPanel'), undefined)
assert.equal(ai.operations.get('aeditor.createPanel'), null)
assert.equal(typeof ai.tools.get('aeditor.installExtension').preview, 'function')
assert.equal(typeof ai.tools.get('aeditor.addPanelToDock').preview, 'function')
const extensionAgent = ai.createAgent({ name: 'Extension Agent' })
const extensionRequest = ai.makeRequest(extensionAgent, null, 'run_extension_tools', 'user', 0)
assert.equal(extensionRequest.tools.includes('aeditor.installExtension'), false)
assert.equal(extensionRequest.tools.includes('aeditor.addPanelToDock'), false)
assert.equal(extensionRequest.tools.includes('aeditor.previewOperation'), false)
assert.equal(extensionRequest.tools.includes('aeditor.applyOperation'), false)
assert.throws(function () {
  ai.tools.get('aeditor.previewOperation').run({ op: 'aeditor.installExtension', input: { manifest: {} } }, { actor: 'user', agent: extensionAgent })
}, /not available/)
let tree = aeditor.dock({ name: 'main' })
let panelTextSamples = {}
const layout = {
  tree: function () { return tree },
  addPanel: function (dockName, partial, opts) {
    const found = aeditor.findByName(tree, dockName)
    const dockId = found ? found.node.id : dockName
    const r = aeditor.addPanel(tree, dockId, partial, opts || {})
    tree = r.tree
    return { panelId: r.panelId }
  },
  removePanel: function (panelId) {
    tree = aeditor.removePanel(tree, panelId)
  },
  setTree: function (next) {
    tree = next
  },
  inspectPanel: function (panelId) {
    return { panelId: panelId, status: 'ready', textSample: panelTextSamples[panelId] || '' }
  },
}

aeditor.extensions.registerLayout('default', layout)
aeditor.extensions.configureStorage({ key: 'test.extensions', load: false })
const installTool = ai.tools.get('aeditor.installExtension')
const directInstallPreview = installTool.preview({
  manifest: {
    id: 'direct.tool',
    contributes: {
      components: [{ id: 'panel', title: 'Direct Tool Panel', ui: null }],
      dockPanels: [{ dock: 'main', component: 'panel', title: 'Direct Tool Panel' }],
    },
  },
}, { actor: 'user', agent: { id: 'agent' } })
assert.equal(directInstallPreview.canApply, true)
const directInstalled = installTool.apply(directInstallPreview, { actor: 'user', agent: { id: 'agent' } })
assert.equal(directInstalled.applied, true)
assert.equal(aeditor.componentRegistration('direct.tool.panel').owner, 'extension:direct.tool')
assert.equal(ai.permissionAuditRecords().some(function (item) {
  return item.scope === 'extension.install' && item.target === 'direct.tool' && item.decision === 'allow'
}), true)
aeditor.extensions.uninstall('direct.tool', { save: false })

aeditor.extensions.install({
  id: 'nested',
  contributes: {
    components: [{ id: 'panel', title: 'Nested Panel', ui: null }],
    references: [{ id: 'data', provider: {} }],
    operations: [{ id: 'patch', risk: 'edit' }],
    tools: [{ id: 'read', title: 'Nested Read', run: function () { return 'parent' } }],
    context: [{ id: 'ctx', provider: { capture: function () { return 'parent' } } }],
    commands: [{ id: 'refresh', title: 'Nested Refresh' }],
    menus: [{ target: 'dock.panel.context', command: 'refresh', label: 'Nested Refresh' }],
    settings: [{ section: { id: 'nested', title: 'Nested' }, schema: { key: 'nested.enabled', type: 'boolean' } }],
  },
}, { save: false })
aeditor.extensions.install({
  id: 'nested.child',
  contributes: {
    components: [{ id: 'panel', title: 'Nested Child Panel', ui: null }],
    references: [{ id: 'data', provider: {} }],
    operations: [{ id: 'patch', risk: 'edit' }],
    tools: [{ id: 'read', title: 'Nested Child Read', run: function () { return 'child' } }],
    context: [{ id: 'ctx', provider: { capture: function () { return 'child' } } }],
    commands: [{ id: 'refresh', title: 'Nested Child Refresh' }],
    menus: [{ target: 'dock.panel.context', command: 'refresh', label: 'Nested Child Refresh' }],
    settings: [{ section: { id: 'nested.child', title: 'Nested Child' }, schema: { key: 'nested.child.enabled', type: 'boolean' } }],
  },
}, { save: false })
aeditor.extensions.uninstall('nested', { save: false })
assert.equal(aeditor.componentRegistration('nested.panel'), null)
assert.equal(ai.references.get('nested.data'), null)
assert.equal(ai.operations.get('nested.patch'), null)
assert.equal(ai.tools.get('nested.read'), undefined)
assert.equal(ai.context.get('nested.ctx'), undefined)
assert.equal(aeditor.commands.get('nested.refresh'), null)
assert.equal(aeditor.commands.menuMeta('nested.dock.panel.context:refresh').owner, undefined)
assert.equal(aeditor.settings.schemaMeta('nested.enabled').owner, undefined)
assert.notEqual(aeditor.componentRegistration('nested.child.panel'), null)
assert.notEqual(ai.references.get('nested.child.data'), null)
assert.notEqual(ai.operations.get('nested.child.patch'), null)
assert.notEqual(ai.tools.get('nested.child.read'), undefined)
assert.notEqual(ai.context.get('nested.child.ctx'), null)
assert.notEqual(aeditor.commands.get('nested.child.refresh'), null)
assert.equal(aeditor.commands.menuMeta('nested.child.dock.panel.context:refresh').owner, 'extension:nested.child')
assert.equal(aeditor.settings.schemaMeta('nested.child.enabled').owner, 'extension:nested.child')
assert.equal(ai.context.meta('nested.child.ctx').owner, 'extension:nested.child')
aeditor.extensions.uninstall('nested.child', { save: false })

let applied = null
aeditor.extensions.registerAdapter('case.adapter', {
  preview: function (input) { return { ok: true, next: input.next } },
  apply: function (preview) { applied = preview.next; return { applied: true, value: applied } },
  run: function () { applied = 'command'; return { ok: true } },
  read: function (ref) { return { uri: ref.uri, value: 1 } },
})

const manifest = {
  id: 'case',
  title: 'Case Tools',
  layer: 'user',
  contributes: {
    components: [{
      id: 'roleBag',
      title: 'Role Bag',
      icon: 'briefcase',
      props: { rows: 4 },
      ui: { component: 'roleBagInner', props: { label: 'Bag' } },
    }, {
      id: 'roleBagInner',
      title: 'Role Bag Inner',
      ui: null,
    }],
    dockPanels: [{
      dock: 'main',
      component: 'roleBag',
      title: 'Role Bag',
    }],
    references: [{
      id: 'data',
      adapter: 'case.adapter',
      schema: { type: 'object' },
      capabilities: [{ op: 'case.setValue' }],
    }],
    tools: [{
      id: 'read',
      title: 'Read Case',
      adapter: 'case.adapter',
    }],
    context: [{
      id: 'context',
      adapter: 'case.adapter',
    }],
    operations: [{
      id: 'setValue',
      adapter: 'case.adapter',
      risk: 'edit',
    }],
    commands: [{
      id: 'refresh',
      title: 'Refresh Case',
      adapter: 'case.adapter',
    }],
    menus: [{
      target: 'dock.panel.context',
      command: 'refresh',
      label: 'Refresh Case',
    }],
    settings: [{
      section: { id: 'case', title: 'Case' },
      schema: { key: 'case.enabled', type: 'boolean', default: true },
    }],
  },
}

const preview = aeditor.extensions.preview(manifest)
assert.equal(preview.ok, true)
assert.equal(preview.changes.some(function (item) { return item.id === 'case.roleBag' }), true)
assert.equal(aeditor.extensions.preview({
  id: 'bad.adapter',
  contributes: { operations: [{ id: 'op', adapter: 'missing.adapter' }] },
}).ok, false)
assert.match(aeditor.extensions.preview({
  id: 'bad.ui',
  contributes: {
    components: [{ id: 'panel', ui: { component: 'missingWidget' } }],
  },
}).errors[0].message, /UI component not registered/)
const badUiPreview = ai.operations.preview('aeditor.installExtension', {
  id: 'bad.ui.operation',
  contributes: { components: [{ id: 'panel', ui: { component: 'missingWidget' } }] },
})
assert.equal(badUiPreview.ok, false)
assert.equal(ai.operations.apply(badUiPreview).applied, false)
assert.match(aeditor.extensions.preview({
  id: 'bad.dock',
  contributes: {
    components: [{ id: 'panel', ui: null }],
    dockPanels: [{ dock: 'missing', component: 'panel' }],
  },
}).errors[0].message, /Dock not found/)

aeditor.registerComponent('conflict.panel', { factory: function () { return document.createElement('div') } }, { owner: 'host' })
ai.tools.register('conflict.read', {}, { owner: 'host' })
ai.context.register('conflict.context', {})
ai.references.register('conflict.data', {}, { owner: 'host' })
ai.operations.register('conflict.setValue', {}, { owner: 'host' })
aeditor.commands.register('conflict.refresh', {}, { owner: 'host' })
aeditor.commands.registerMenu('conflict.menu', { target: 'global' }, { owner: 'host' })
const conflictPreview = aeditor.extensions.preview({
  id: 'conflict',
  contributes: {
    components: [{ id: 'panel', ui: null }],
    tools: [{ id: 'read' }],
    context: [{ id: 'context' }],
    references: [{ id: 'data' }],
    operations: [{ id: 'setValue' }],
    commands: [{ id: 'refresh' }],
    menus: [{ id: 'menu', target: 'global' }],
  },
})
assert.equal(conflictPreview.ok, false)
assert.equal(conflictPreview.errors.some(function (item) { return /Component already registered: conflict\.panel/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Tool already registered: conflict\.read/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Context provider already registered: conflict\.context/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Reference provider already registered: conflict\.data/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Operation already registered: conflict\.setValue/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Command already registered: conflict\.refresh/.test(item.message) }), true)
assert.equal(conflictPreview.errors.some(function (item) { return /Menu already registered: conflict\.menu/.test(item.message) }), true)
aeditor.unregisterComponent('conflict.panel', { owner: 'host' })
ai.tools.unregister('conflict.read', { owner: 'host' })
ai.context.unregister('conflict.context')
ai.references.unregister('conflict.data', { owner: 'host' })
ai.operations.unregister('conflict.setValue', { owner: 'host' })
aeditor.commands.unregister('conflict.refresh', { owner: 'host' })
aeditor.commands.unregisterMenu('conflict.menu', { owner: 'host' })

const installed = aeditor.extensions.install(manifest)
assert.equal(installed.ok, true)
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')
assert.equal(aeditor.componentRegistration('case.roleBag').layer, 'user')
assert.equal(aeditor.componentDefaults('case.roleBag').extensionId, 'case')
assert.deepEqual(aeditor.listComponents({ owner: 'extension:case' }).map(function (item) { return item.name }).sort(), ['case.roleBag', 'case.roleBagInner'])
assert.equal(aeditor.findDock(tree, tree.id).node.panels[0].owner, 'extension:case')
assert.equal(aeditor.findDock(tree, tree.id).node.panels[0].component, 'case.roleBag')
assert.equal(ai.tools.get('case.read').title, 'Read Case')
assert.equal(ai.context.get('case.context') != null, true)
assert.equal(ai.references.list({ owner: 'extension:case' })[0], 'case.data')
assert.equal(ai.operations.list({ owner: 'extension:case' })[0], 'case.setValue')
assert.equal(aeditor.commands.list({ owner: 'extension:case' })[0], 'case.refresh')
assert.equal(aeditor.commands.menuItems('dock.panel.context')[0].command, 'case.refresh')
assert.equal(aeditor.settings.schemaMeta('case.enabled').owner, 'extension:case')
assert.deepEqual(ai.references.read({ resolver: 'case.data', uri: 'case.data://row/1' }), { uri: 'case.data://row/1', value: 1 })
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, true)

const opPreview = ai.operations.preview('case.setValue', { next: 9 })
const opApplied = ai.operations.apply(opPreview)
assert.equal(opApplied.value, 9)
assert.equal(applied, 9)
aeditor.commands.run('case.refresh')
assert.equal(applied, 'command')

const external = layout.addPanel('main', { component: 'case.roleBag', title: 'External Bag' }).panelId

const disabled = aeditor.extensions.disable('case')
assert.equal(disabled.disabled, true)
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
assert.equal(aeditor.findPanel(tree, external).panel.component, 'extension-disabled')
assert.equal(aeditor.findDock(tree, tree.id).node.panels.length, 1)
assert.deepEqual(aeditor.commands.list({ owner: 'extension:case' }), [])
assert.equal(ai.tools.get('case.read'), undefined)
assert.equal(ai.context.get('case.context'), undefined)
assert.equal(aeditor.settings.schemaMeta('case.enabled').owner, undefined)
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, false)

const enabled = aeditor.extensions.enable('case')
assert.equal(enabled.enabled, true)
assert.equal(enabled.active, true)
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')
assert.equal(aeditor.findDock(tree, tree.id).node.panels.length, 2)
assert.equal(aeditor.findPanel(tree, external).panel.component, 'case.roleBag')
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, true)

aeditor.extensions.safeMode(true)
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
assert.equal(aeditor.extensions.get('case').enabled, true)
assert.equal(aeditor.extensions.get('case').active, false)
aeditor.extensions.safeMode(false)
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')

const appManifest = {
  id: 'app.case',
  layer: 'app',
  contributes: { components: [{ id: 'panel', ui: null }] },
}
aeditor.extensions.install(appManifest, { save: false })
aeditor.extensions.safeMode(true, { allowApp: true })
assert.equal(aeditor.componentRegistration('app.case.panel').owner, 'extension:app.case')
aeditor.extensions.safeMode(false)
aeditor.extensions.uninstall('app.case', { save: false })

const maxApp = aeditor.extensions.setMaxLayer('app')
assert.equal(maxApp.maxLayer, 'app')
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
assert.equal(aeditor.extensions.get('case').filtered, true)
const maxSession = aeditor.extensions.setMaxLayer('session')
assert.equal(maxSession.maxLayer, 'session')
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')

aeditor.extensions.disableLayer('user')
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
assert.equal(aeditor.extensions.get('case').filtered, true)
aeditor.extensions.enableLayer('user')
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')

const promotedPreview = ai.operations.preview('aeditor.promoteExtensionLayer', { id: 'case', layer: 'session' })
const promoted = ai.operations.apply(promotedPreview)
assert.equal(promoted.installed, true)
assert.equal(aeditor.extensions.get('case').manifest.layer, 'session')

const panelToRemove = aeditor.findDock(tree, tree.id).node.panels.find(function (p) { return p.owner === 'extension:case' }).id
const removePanelPreview = ai.operations.preview('aeditor.removePanelFromDock', { panelId: panelToRemove })
const panelRemoved = ai.operations.apply(removePanelPreview)
assert.deepEqual(panelRemoved.removed, [panelToRemove])
assert.equal(aeditor.findPanel(tree, panelToRemove), null)

assert.throws(function () {
  aeditor.extensions.install({
    id: 'code.bad',
    trust: { code: 'trusted' },
    contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
  })
}, /allowCode/)

const codeReview = aeditor.extensions.review({
  id: 'code.review',
  layer: 'user',
  trust: { code: 'trusted' },
  permissions: ['app.read'],
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
})
assert.equal(codeReview.canApply, false)
assert.equal(codeReview.requiredConsent, 'allowCode')
assert.equal(codeReview.permissions.includes('extensions.code.install'), true)
assert.equal(codeReview.permissions.includes('extensions.layer.user.write'), true)
const reviewOnly = await aeditor.extensions.installWithReview({
  id: 'code.review.only',
  trust: { code: 'trusted' },
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
})
assert.equal(reviewOnly.canApply, false)
assert.equal(aeditor.componentRegistration('code.review.only.panel'), null)

aeditor.extensions.configurePermissions({
  install: function (details) { return details.manifest.id !== 'blocked.extension' },
})
assert.equal(aeditor.extensions.review({ id: 'blocked.extension' }).canInstall, false)
assert.throws(function () {
  aeditor.extensions.install({ id: 'blocked.extension' })
}, /permission denied/)
aeditor.extensions.configurePermissions(null)

const codeInstalled = aeditor.extensions.install({
  id: 'code.ok',
  trust: { code: 'trusted' },
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
}, { allowCode: true, save: false })
assert.equal(codeInstalled.installed, true)
assert.equal(aeditor.componentRegistration('code.ok.panel').owner, 'extension:code.ok')
aeditor.extensions.uninstall('code.ok', { save: false })

assert.throws(function () {
  aeditor.extensions.install({
    id: 'code.hash.bad',
    trust: { code: 'sandbox' },
    contributes: { components: [{ id: 'panel', kind: 'iframe', srcdoc: '<p>x</p>', hash: 'bad' }] },
  }, { allowCode: true, save: false })
}, /hash mismatch/)
const srcdoc = '<p>isolated</p>'
const iframeInstalled = aeditor.extensions.install({
  id: 'code.iframe',
  trust: { code: 'sandbox' },
  contributes: { components: [{ id: 'panel', kind: 'iframe', srcdoc: srcdoc, hash: aeditor.extensions.hashSource(srcdoc) }] },
}, { allowCode: true, save: false })
assert.equal(iframeInstalled.installed, true)
assert.equal(aeditor.componentRegistration('code.iframe.panel').owner, 'extension:code.iframe')
aeditor.extensions.uninstall('code.iframe', { save: false })

aeditor.extensions.uninstall('case', { save: false })
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
const booted = aeditor.extensions.boot()
assert.equal(booted.count, 1)
assert.equal(aeditor.componentRegistration('case.roleBag').owner, 'extension:case')

const removePreview = ai.operations.preview('aeditor.removeExtension', { id: 'case' })
const removed = ai.operations.apply(removePreview)
assert.equal(removed.removed, true)
assert.equal(aeditor.componentRegistration('case.roleBag'), null)
assert.deepEqual(ai.references.list({ owner: 'extension:case' }), [])
assert.deepEqual(ai.operations.list({ owner: 'extension:case' }), [])
assert.equal(ai.tools.get('case.read'), undefined)
assert.equal(ai.context.get('case.context'), undefined)
assert.equal(aeditor.findDock(tree, tree.id).node.panels.length, 0)

const delayedMemory = storage()
global.window.localStorage = delayedMemory
aeditor.extensions.configureStorage({ key: 'delayed.extensions', storage: delayedMemory, load: false })
let delayedTree = aeditor.dock({ name: 'main' })
aeditor.extensions.install({
  id: 'delayed',
  contributes: {
    components: [{ id: 'panel', ui: null }],
    dockPanels: [{ layout: 'delayed', dock: 'main', component: 'panel' }],
  },
}, { deferLayout: true })
assert.equal(aeditor.extensions.get('delayed').active, true)
assert.equal(aeditor.extensions.get('delayed').panels.length, 0)
aeditor.extensions.registerLayout('delayed', {
  tree: function () { return delayedTree },
  addPanel: function (dockName, partial, opts) {
    const found = aeditor.findByName(delayedTree, dockName)
    const r = aeditor.addPanel(delayedTree, found ? found.node.id : dockName, partial, opts || {})
    delayedTree = r.tree
    return { panelId: r.panelId }
  },
  removePanel: function (panelId) { delayedTree = aeditor.removePanel(delayedTree, panelId) },
  setTree: function (next) { delayedTree = next },
})
assert.equal(aeditor.findDock(delayedTree, delayedTree.id).node.panels[0].component, 'delayed.panel')

console.log('extension runtime tests ok')
