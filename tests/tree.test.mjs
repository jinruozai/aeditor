import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/tree/tree.js', 'utf8'), { filename: 'tree.js' })

const EF = window.EF

let tree = EF.dock({
  name: 'main',
  panels: [
    EF.panel({ component: 'editor', title: 'One' }),
    EF.panel({ component: 'editor', title: 'Two' }),
  ],
})
assert.equal(tree.panels.length, 2)
assert.equal(tree.activeId, tree.panels[0].id)

const dockId = tree.id
let r = EF.addPanel(tree, dockId, { component: 'editor', title: 'Preview A' }, { transient: true })
tree = r.tree
const firstPreview = r.panelId
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)
r = EF.addPanel(tree, dockId, { component: 'editor', title: 'Preview B' }, { transient: true })
tree = r.tree
assert.equal(EF.findPanel(tree, firstPreview), null)
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)

tree = EF.promotePanel(tree, r.panelId)
assert.equal(EF.findPanel(tree, r.panelId).panel.transient, false)

const split = EF.split('horizontal', [tree, EF.dock({ name: 'side' })], [0.7, 0.3])
const sideId = EF.findByName(split, 'side').node.id
const movedId = tree.panels[0].id
const movedTree = EF.movePanel(split, movedId, sideId)
assert.equal(EF.findPanel(movedTree, movedId).dockId, sideId)

const splitTarget = EF.dock({
  name: 'split-target',
  toolbar: { direction: 'left', items: [] },
  accept: ['editor'],
})
const splitSource = EF.dock({
  name: 'split-source',
  panels: [
    EF.panel({ component: 'editor', title: 'Split A' }),
    EF.panel({ component: 'editor', title: 'Split B' }),
  ],
})
const splitTree = EF.split('horizontal', [splitSource, splitTarget], [0.5, 0.5])
const splitPanelId = splitSource.panels[0].id
const splitMoved = EF.movePanelToSplit(splitTree, splitPanelId, splitTarget.id, 'vertical', 'before', 0.25)
const splitMovedPanel = EF.findPanel(splitMoved.tree, splitPanelId)
assert.equal(splitMovedPanel.dockId, splitMoved.newDockId)
assert.equal(EF.findDock(splitMoved.tree, splitMoved.newDockId).node.toolbar.direction, 'left')
assert.equal(EF.findDock(splitMoved.tree, splitSource.id).node.panels.length, 1)

const singleSource = EF.dock({ name: 'single-source', panels: [EF.panel({ component: 'editor', title: 'Only' })] })
const singleTarget = EF.dock({ name: 'single-target' })
const singleTree = EF.split('horizontal', [singleSource, singleTarget], [0.5, 0.5])
const singlePanelId = singleSource.panels[0].id
const singleMoved = EF.movePanelToSplit(singleTree, singlePanelId, singleTarget.id, 'horizontal', 'after', 0.3)
assert.equal(EF.findDock(singleMoved.tree, singleSource.id), null)
assert.equal(EF.findPanel(singleMoved.tree, singlePanelId).dockId, singleMoved.newDockId)

const merge = EF.mergeDocks(movedTree, sideId, dockId)
assert.ok(Array.isArray(merge.discardedPanels))
assert.equal(EF.findDock(merge.tree, dockId), null)

const focused = EF.setFocused(split, dockId, true)
assert.equal(EF.findDock(focused, dockId).node.focused, true)
assert.equal(!!EF.findDock(focused, sideId).node.focused, false)

console.log('tree tests ok')
