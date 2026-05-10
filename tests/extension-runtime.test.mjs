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
global.window = { EF: {}, localStorage: memory }
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
  'src/core/settings.js',
  'src/core/commands.js',
  'src/tree/tree.js',
  'src/core/registry.js',
  'src/ai/context.js',
  'src/ai/reference.js',
  'src/core/extensions.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const EF = window.EF
const ai = EF.ai
assert.equal(typeof ai.getTool('editor.createPanel').preview, 'function')
assert.equal(typeof ai.getTool('editor.installExtension').preview, 'function')
assert.equal(typeof ai.getTool('editor.addPanelToDock').preview, 'function')
let tree = EF.dock({ name: 'main' })
let panelTextSamples = {}
const layout = {
  tree: function () { return tree },
  addPanel: function (dockName, partial, opts) {
    const found = EF.findByName(tree, dockName)
    const dockId = found ? found.node.id : dockName
    const r = EF.addPanel(tree, dockId, partial, opts || {})
    tree = r.tree
    return { panelId: r.panelId }
  },
  removePanel: function (panelId) {
    tree = EF.removePanel(tree, panelId)
  },
  setTree: function (next) {
    tree = next
  },
  inspectPanel: function (panelId) {
    return { panelId: panelId, status: 'ready', textSample: panelTextSamples[panelId] || '' }
  },
}

EF.extensions.registerLayout('default', layout)
EF.extensions.configureStorage({ key: 'test.extensions', load: false })
const createPanelTool = ai.getTool('editor.createPanel')
const createPanelPreview = createPanelTool.preview({
  id: 'ai.inventory',
  title: 'Inventory',
  dock: 'main',
  source: 'function (propsSig, ctx) { const root = document.createElement("div"); root.textContent = "Inventory"; return root }',
}, { actor: 'user', agent: { id: 'agent' } })
assert.equal(createPanelPreview.ok, true)
assert.equal(createPanelPreview.canApply, true)
assert.equal(createPanelPreview.component, 'ai.inventory/panel')
const createdPanel = createPanelTool.apply(createPanelPreview, { actor: 'user', agent: { id: 'agent' } })
assert.equal(createdPanel.applied, true)
assert.equal(createdPanel.component, 'ai.inventory/panel')
assert.equal(EF.componentRegistration('ai.inventory/panel').owner, 'extension:ai.inventory')
assert.equal(EF.findDock(tree, tree.id).node.panels[0].component, 'ai.inventory/panel')
const factoryEl = EF.resolveComponent('ai.inventory/panel').factory(EF.signal({}), {})
assert.equal(factoryEl.textContent, 'Inventory')
const replacedPanel = createPanelTool.apply(createPanelTool.preview({
  id: 'ai.inventory',
  title: 'Inventory v2',
  dock: 'main',
  source: 'function () { const root = document.createElement("div"); root.textContent = "Inventory v2"; return root }',
}, { actor: 'user', agent: { id: 'agent' } }), { actor: 'user', agent: { id: 'agent' } })
assert.equal(replacedPanel.applied, true)
assert.equal(EF.findDock(tree, tree.id).node.panels.filter(function (p) { return p.extensionId === 'ai.inventory' }).length, 1)
assert.equal(createPanelTool.preview({
  id: 'ai.bad.source',
  title: 'Bad',
  dock: 'main',
  source: 'const root = document.createElement("div")',
}, { actor: 'user', agent: { id: 'agent' } }).ok, false)
const templatePreview = createPanelTool.preview({
  id: 'ai.template',
  title: 'Template',
  dock: 'main',
  source: 'function () { const root = document.createElement("div"); root.textContent = "{{icon}}"; return root }',
}, { actor: 'user', agent: { id: 'agent' } })
const originalInspect = layout.inspectPanel
layout.inspectPanel = function (panelId) { return { panelId: panelId, status: 'ready', textSample: '{{icon}}' } }
const templateApplied = createPanelTool.apply(templatePreview, { actor: 'user', agent: { id: 'agent' } })
assert.equal(templateApplied.applied, false)
assert.equal(templateApplied.rolledBack, true)
assert.equal(EF.componentRegistration('ai.template/panel'), null)
layout.inspectPanel = originalInspect
EF.extensions.uninstall('ai.inventory', { save: false })
assert.equal(EF.componentRegistration('ai.inventory/panel'), null)
const createPanelOpPreview = ai.previewOperation('editor.createPanel', {
  id: 'ai.operation.panel',
  title: 'Operation Panel',
  dock: 'main',
  source: 'function () { const root = document.createElement("div"); root.textContent = "Operation Panel"; return root }',
})
assert.equal(createPanelOpPreview.ok, true)
const createPanelOpApplied = ai.applyOperation(createPanelOpPreview)
assert.equal(createPanelOpApplied.applied, true)
assert.equal(EF.componentRegistration('ai.operation.panel/panel').owner, 'extension:ai.operation.panel')
EF.extensions.uninstall('ai.operation.panel', { save: false })
const installTool = ai.getTool('editor.installExtension')
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
assert.equal(EF.componentRegistration('direct.tool/panel').owner, 'extension:direct.tool')
EF.extensions.uninstall('direct.tool', { save: false })
let applied = null
EF.extensions.registerAdapter('case.adapter', {
  preview: function (input) { return { ok: true, next: input.next } },
  apply: function (preview) { applied = preview.next; return { applied: true, value: applied } },
  run: function () { applied = 'command'; return { ok: true } },
  read: function (ref) { return { uri: ref.uri, value: 1 } },
})

const manifest = {
  id: 'case',
  title: 'Case Tools',
  layer: 'project',
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
      capabilities: [{ op: 'case/setValue' }],
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

const preview = EF.extensions.preview(manifest)
assert.equal(preview.ok, true)
assert.equal(preview.changes.some(function (item) { return item.id === 'case/roleBag' }), true)
assert.equal(EF.extensions.preview({
  id: 'bad.adapter',
  contributes: { operations: [{ id: 'op', adapter: 'missing.adapter' }] },
}).ok, false)
assert.match(EF.extensions.preview({
  id: 'bad.ui',
  contributes: {
    components: [{ id: 'panel', ui: { component: 'missingWidget' } }],
  },
}).errors[0].message, /UI component not registered/)
const badUiPreview = ai.previewOperation('editor.installExtension', {
  id: 'bad.ui.operation',
  contributes: { components: [{ id: 'panel', ui: { component: 'missingWidget' } }] },
})
assert.equal(badUiPreview.ok, false)
assert.equal(ai.applyOperation(badUiPreview).applied, false)
assert.match(EF.extensions.preview({
  id: 'bad.dock',
  contributes: {
    components: [{ id: 'panel', ui: null }],
    dockPanels: [{ dock: 'missing', component: 'panel' }],
  },
}).errors[0].message, /Dock not found/)

const installed = EF.extensions.install(manifest)
assert.equal(installed.ok, true)
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')
assert.equal(EF.componentRegistration('case/roleBag').layer, 'project')
assert.equal(EF.componentDefaults('case/roleBag').extensionId, 'case')
assert.deepEqual(EF.listComponents({ owner: 'extension:case' }).map(function (item) { return item.name }).sort(), ['case/roleBag', 'case/roleBagInner'])
assert.equal(EF.findDock(tree, tree.id).node.panels[0].owner, 'extension:case')
assert.equal(EF.findDock(tree, tree.id).node.panels[0].component, 'case/roleBag')
assert.equal(ai.references.list({ owner: 'extension:case' })[0], 'case/data')
assert.equal(ai.operations.list({ owner: 'extension:case' })[0], 'case/setValue')
assert.equal(EF.commands.list({ owner: 'extension:case' })[0], 'case/refresh')
assert.equal(EF.commands.menuItems('dock.panel.context')[0].command, 'case/refresh')
assert.equal(EF.settings.schemaMeta('case.enabled').owner, 'extension:case')
assert.deepEqual(ai.readReference({ resolver: 'case/data', uri: 'case/data://row/1' }), { uri: 'case/data://row/1', value: 1 })
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, true)

const opPreview = ai.previewOperation('case/setValue', { next: 9 })
const opApplied = ai.applyOperation(opPreview)
assert.equal(opApplied.value, 9)
assert.equal(applied, 9)
EF.commands.run('case/refresh')
assert.equal(applied, 'command')

const external = layout.addPanel('main', { component: 'case/roleBag', title: 'External Bag' }).panelId

const disabled = EF.extensions.disable('case')
assert.equal(disabled.disabled, true)
assert.equal(EF.componentRegistration('case/roleBag'), null)
assert.equal(EF.findPanel(tree, external).panel.component, 'extension-disabled')
assert.equal(EF.findDock(tree, tree.id).node.panels.length, 1)
assert.deepEqual(EF.commands.list({ owner: 'extension:case' }), [])
assert.equal(EF.settings.schemaMeta('case.enabled').owner, undefined)
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, false)

const enabled = EF.extensions.enable('case')
assert.equal(enabled.enabled, true)
assert.equal(enabled.active, true)
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')
assert.equal(EF.findDock(tree, tree.id).node.panels.length, 2)
assert.equal(EF.findPanel(tree, external).panel.component, 'case/roleBag')
assert.equal(JSON.parse(memory.data['test.extensions']).entries[0].enabled, true)

EF.extensions.safeMode(true)
assert.equal(EF.componentRegistration('case/roleBag'), null)
assert.equal(EF.extensions.get('case').enabled, true)
assert.equal(EF.extensions.get('case').active, false)
EF.extensions.safeMode(false)
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')

const appManifest = {
  id: 'case.app',
  layer: 'app',
  contributes: { components: [{ id: 'panel', ui: null }] },
}
EF.extensions.install(appManifest, { save: false })
EF.extensions.safeMode(true, { allowApp: true })
assert.equal(EF.componentRegistration('case.app/panel').owner, 'extension:case.app')
EF.extensions.safeMode(false)
EF.extensions.uninstall('case.app', { save: false })

const maxApp = EF.extensions.setMaxLayer('app')
assert.equal(maxApp.maxLayer, 'app')
assert.equal(EF.componentRegistration('case/roleBag'), null)
assert.equal(EF.extensions.get('case').filtered, true)
const maxSession = EF.extensions.setMaxLayer('session')
assert.equal(maxSession.maxLayer, 'session')
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')

EF.extensions.disableLayer('project')
assert.equal(EF.componentRegistration('case/roleBag'), null)
assert.equal(EF.extensions.get('case').filtered, true)
EF.extensions.enableLayer('project')
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')

const promotedPreview = ai.previewOperation('editor.promoteExtensionLayer', { id: 'case', layer: 'session' })
const promoted = ai.applyOperation(promotedPreview)
assert.equal(promoted.installed, true)
assert.equal(EF.extensions.get('case').manifest.layer, 'session')

const panelToRemove = EF.findDock(tree, tree.id).node.panels.find(function (p) { return p.owner === 'extension:case' }).id
const removePanelPreview = ai.previewOperation('editor.removePanelFromDock', { panelId: panelToRemove })
const panelRemoved = ai.applyOperation(removePanelPreview)
assert.deepEqual(panelRemoved.removed, [panelToRemove])
assert.equal(EF.findPanel(tree, panelToRemove), null)

assert.throws(function () {
  EF.extensions.install({
    id: 'code.bad',
    contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
  })
}, /allowCode/)

const codeReview = EF.extensions.review({
  id: 'code.review',
  layer: 'user',
  permissions: ['project.read'],
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
})
assert.equal(codeReview.canApply, false)
assert.equal(codeReview.requiredConsent, 'allowCode')
assert.equal(codeReview.permissions.includes('extensions.code.install'), true)
assert.equal(codeReview.permissions.includes('extensions.layer.user.write'), true)
const reviewOnly = await EF.extensions.installWithReview({
  id: 'code.review.only',
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
})
assert.equal(reviewOnly.canApply, false)
assert.equal(EF.componentRegistration('code.review.only/panel'), null)

EF.extensions.configurePermissions({
  install: function (details) { return details.manifest.id !== 'blocked.extension' },
})
assert.equal(EF.extensions.review({ id: 'blocked.extension' }).canInstall, false)
assert.throws(function () {
  EF.extensions.install({ id: 'blocked.extension' })
}, /permission denied/)
EF.extensions.configurePermissions(null)

const codeInstalled = EF.extensions.install({
  id: 'code.ok',
  contributes: { components: [{ id: 'panel', kind: 'factory', source: 'function(){ return document.createElement("div") }' }] },
}, { allowCode: true, save: false })
assert.equal(codeInstalled.installed, true)
assert.equal(EF.componentRegistration('code.ok/panel').owner, 'extension:code.ok')
EF.extensions.uninstall('code.ok', { save: false })

assert.throws(function () {
  EF.extensions.install({
    id: 'code.hash.bad',
    contributes: { components: [{ id: 'panel', kind: 'iframe', srcdoc: '<p>x</p>', hash: 'bad' }] },
  }, { allowCode: true, save: false })
}, /hash mismatch/)
const srcdoc = '<p>isolated</p>'
const iframeInstalled = EF.extensions.install({
  id: 'code.iframe',
  contributes: { components: [{ id: 'panel', kind: 'iframe', srcdoc: srcdoc, hash: EF.extensions.hashSource(srcdoc) }] },
}, { allowCode: true, save: false })
assert.equal(iframeInstalled.installed, true)
assert.equal(EF.componentRegistration('code.iframe/panel').owner, 'extension:code.iframe')
EF.extensions.uninstall('code.iframe', { save: false })

EF.extensions.uninstall('case', { save: false })
assert.equal(EF.componentRegistration('case/roleBag'), null)
const booted = EF.extensions.boot()
assert.equal(booted.count, 1)
assert.equal(EF.componentRegistration('case/roleBag').owner, 'extension:case')

const removePreview = ai.previewOperation('editor.removeExtension', { id: 'case' })
const removed = ai.applyOperation(removePreview)
assert.equal(removed.removed, true)
assert.equal(EF.componentRegistration('case/roleBag'), null)
assert.deepEqual(ai.references.list({ owner: 'extension:case' }), [])
assert.deepEqual(ai.operations.list({ owner: 'extension:case' }), [])
assert.equal(EF.findDock(tree, tree.id).node.panels.length, 0)

const delayedMemory = storage()
global.window.localStorage = delayedMemory
EF.extensions.configureStorage({ key: 'delayed.extensions', storage: delayedMemory, load: false })
let delayedTree = EF.dock({ name: 'main' })
EF.extensions.install({
  id: 'delayed',
  contributes: {
    components: [{ id: 'panel', ui: null }],
    dockPanels: [{ layout: 'delayed', dock: 'main', component: 'panel' }],
  },
}, { deferLayout: true })
assert.equal(EF.extensions.get('delayed').active, true)
assert.equal(EF.extensions.get('delayed').panels.length, 0)
EF.extensions.registerLayout('delayed', {
  tree: function () { return delayedTree },
  addPanel: function (dockName, partial, opts) {
    const found = EF.findByName(delayedTree, dockName)
    const r = EF.addPanel(delayedTree, found ? found.node.id : dockName, partial, opts || {})
    delayedTree = r.tree
    return { panelId: r.panelId }
  },
  removePanel: function (panelId) { delayedTree = EF.removePanel(delayedTree, panelId) },
  setTree: function (next) { delayedTree = next },
})
assert.equal(EF.findDock(delayedTree, delayedTree.id).node.panels[0].component, 'delayed/panel')

console.log('extension runtime tests ok')
