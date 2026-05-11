import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/tree/tree.js', 'utf8'), { filename: 'tree.js' })

const aeditor = window.aeditor

let tree = aeditor.dock({
  name: 'main',
  panels: [
    aeditor.panel({ component: 'editor', title: 'One' }),
    aeditor.panel({ component: 'editor', title: 'Two' }),
  ],
})
assert.equal(tree.panels.length, 2)
assert.equal(tree.activeId, tree.panels[0].id)

const dockId = tree.id
let r = aeditor.addPanel(tree, dockId, { component: 'editor', title: 'Preview A' }, { transient: true })
tree = r.tree
const firstPreview = r.panelId
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)
r = aeditor.addPanel(tree, dockId, { component: 'editor', title: 'Preview B' }, { transient: true })
tree = r.tree
assert.equal(aeditor.findPanel(tree, firstPreview), null)
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)

tree = aeditor.promotePanel(tree, r.panelId)
assert.equal(aeditor.findPanel(tree, r.panelId).panel.transient, false)

const split = aeditor.split('horizontal', [tree, aeditor.dock({ name: 'side' })], [0.7, 0.3])
const sideId = aeditor.findByName(split, 'side').node.id
const movedId = tree.panels[0].id
const movedTree = aeditor.movePanel(split, movedId, sideId)
assert.equal(aeditor.findPanel(movedTree, movedId).dockId, sideId)

const splitTarget = aeditor.dock({
  name: 'split-target',
  toolbar: { direction: 'left', items: [] },
  accept: ['editor'],
})
const splitSource = aeditor.dock({
  name: 'split-source',
  panels: [
    aeditor.panel({ component: 'editor', title: 'Split A' }),
    aeditor.panel({ component: 'editor', title: 'Split B' }),
  ],
})
const splitTree = aeditor.split('horizontal', [splitSource, splitTarget], [0.5, 0.5])
const splitPanelId = splitSource.panels[0].id
const splitMoved = aeditor.movePanelToSplit(splitTree, splitPanelId, splitTarget.id, 'vertical', 'before', 0.25)
const splitMovedPanel = aeditor.findPanel(splitMoved.tree, splitPanelId)
assert.equal(splitMovedPanel.dockId, splitMoved.newDockId)
assert.equal(aeditor.findDock(splitMoved.tree, splitMoved.newDockId).node.toolbar.direction, 'left')
assert.equal(aeditor.findDock(splitMoved.tree, splitSource.id).node.panels.length, 1)

const singleSource = aeditor.dock({ name: 'single-source', panels: [aeditor.panel({ component: 'editor', title: 'Only' })] })
const singleTarget = aeditor.dock({ name: 'single-target' })
const singleTree = aeditor.split('horizontal', [singleSource, singleTarget], [0.5, 0.5])
const singlePanelId = singleSource.panels[0].id
const singleMoved = aeditor.movePanelToSplit(singleTree, singlePanelId, singleTarget.id, 'horizontal', 'after', 0.3)
assert.equal(aeditor.findDock(singleMoved.tree, singleSource.id), null)
assert.equal(aeditor.findPanel(singleMoved.tree, singlePanelId).dockId, singleMoved.newDockId)

const closeSource = aeditor.dock({ name: 'close-source', panels: [aeditor.panel({ component: 'editor', title: 'Only' })] })
const closeTarget = aeditor.dock({ name: 'close-target', panels: [aeditor.panel({ component: 'editor', title: 'Other' })] })
const closeTree = aeditor.split('horizontal', [closeSource, closeTarget], [0.5, 0.5])
const closePanelId = closeSource.panels[0].id
const closedTree = aeditor.removePanel(closeTree, closePanelId)
assert.equal(aeditor.findDock(closedTree, closeSource.id), null)
assert.equal(aeditor.findDock(closedTree, closeTarget.id).node.panels.length, 1)

const closeRoot = aeditor.dock({ name: 'close-root', panels: [aeditor.panel({ component: 'editor', title: 'Root Only' })] })
const closeRootPanelId = closeRoot.panels[0].id
const closedRoot = aeditor.removePanel(closeRoot, closeRootPanelId)
assert.equal(closedRoot.id, closeRoot.id)
assert.equal(closedRoot.panels.length, 0)
assert.equal(closedRoot.activeId, null)

const merge = aeditor.mergeDocks(movedTree, sideId, dockId)
assert.ok(Array.isArray(merge.discardedPanels))
assert.equal(aeditor.findDock(merge.tree, dockId), null)

const focused = aeditor.setFocused(split, dockId, true)
assert.equal(aeditor.findDock(focused, dockId).node.focused, true)
assert.equal(!!aeditor.findDock(focused, sideId).node.focused, false)

console.log('tree tests ok')
