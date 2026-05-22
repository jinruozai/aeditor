import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aiditor: {} }
vm.runInThisContext(readFileSync('src/tree/tree.js', 'utf8'), { filename: 'tree.js' })

const aiditor = window.aiditor

let tree = aiditor.dock({
  name: 'main',
  panels: [
    aiditor.panel({ component: 'editor', title: 'One' }),
    aiditor.panel({ component: 'editor', title: 'Two' }),
  ],
})
assert.equal(tree.panels.length, 2)
assert.equal(tree.activeId, tree.panels[0].id)

const dockId = tree.id
let r = aiditor.addPanel(tree, dockId, { component: 'editor', title: 'Preview A' }, { transient: true })
tree = r.tree
const firstPreview = r.panelId
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)
r = aiditor.addPanel(tree, dockId, { component: 'editor', title: 'Preview B' }, { transient: true })
tree = r.tree
assert.equal(aiditor.findPanel(tree, firstPreview), null)
assert.equal(tree.panels.filter(function (p) { return p.transient }).length, 1)

tree = aiditor.promotePanel(tree, r.panelId)
assert.equal(aiditor.findPanel(tree, r.panelId).panel.transient, false)

const split = aiditor.split('horizontal', [tree, aiditor.dock({ name: 'side' })], [0.7, 0.3])
const sideId = aiditor.findByName(split, 'side').node.id
const movedId = tree.panels[0].id
const movedTree = aiditor.movePanel(split, movedId, sideId)
assert.equal(aiditor.findPanel(movedTree, movedId).dockId, sideId)

const splitTarget = aiditor.dock({
  name: 'split-target',
  toolbar: { direction: 'left', items: [] },
  accept: ['editor'],
})
const splitSource = aiditor.dock({
  name: 'split-source',
  panels: [
    aiditor.panel({ component: 'editor', title: 'Split A' }),
    aiditor.panel({ component: 'editor', title: 'Split B' }),
  ],
})
const splitTree = aiditor.split('horizontal', [splitSource, splitTarget], [0.5, 0.5])
const splitPanelId = splitSource.panels[0].id
const splitMoved = aiditor.movePanelToSplit(splitTree, splitPanelId, splitTarget.id, 'vertical', 'before', 0.25)
const splitMovedPanel = aiditor.findPanel(splitMoved.tree, splitPanelId)
assert.equal(splitMovedPanel.dockId, splitMoved.newDockId)
assert.equal(aiditor.findDock(splitMoved.tree, splitMoved.newDockId).node.toolbar.direction, 'left')
assert.equal(aiditor.findDock(splitMoved.tree, splitSource.id).node.panels.length, 1)

const singleSource = aiditor.dock({ name: 'single-source', panels: [aiditor.panel({ component: 'editor', title: 'Only' })] })
const singleTarget = aiditor.dock({ name: 'single-target' })
const singleTree = aiditor.split('horizontal', [singleSource, singleTarget], [0.5, 0.5])
const singlePanelId = singleSource.panels[0].id
const singleMoved = aiditor.movePanelToSplit(singleTree, singlePanelId, singleTarget.id, 'horizontal', 'after', 0.3)
assert.equal(aiditor.findDock(singleMoved.tree, singleSource.id), null)
assert.equal(aiditor.findPanel(singleMoved.tree, singlePanelId).dockId, singleMoved.newDockId)

const keepMoveSource = aiditor.dock({
  name: 'keep-move-source',
  removeWhenEmpty: false,
  panels: [aiditor.panel({ component: 'editor', title: 'Only' })],
})
const keepMoveTarget = aiditor.dock({ name: 'keep-move-target' })
const keepMoveTree = aiditor.split('horizontal', [keepMoveSource, keepMoveTarget], [0.5, 0.5])
const keepMovePanelId = keepMoveSource.panels[0].id
const keptAfterMove = aiditor.movePanel(keepMoveTree, keepMovePanelId, keepMoveTarget.id)
const keptMoveSourceDock = aiditor.findDock(keptAfterMove, keepMoveSource.id).node
assert.equal(keptMoveSourceDock.panels.length, 0)
assert.equal(keptMoveSourceDock.activeId, null)
assert.equal(aiditor.findPanel(keptAfterMove, keepMovePanelId).dockId, keepMoveTarget.id)

const keepSplitSource = aiditor.dock({
  name: 'keep-split-source',
  removeWhenEmpty: false,
  panels: [aiditor.panel({ component: 'editor', title: 'Only' })],
})
const keepSplitTarget = aiditor.dock({ name: 'keep-split-target' })
const keepSplitTree = aiditor.split('horizontal', [keepSplitSource, keepSplitTarget], [0.5, 0.5])
const keepSplitPanelId = keepSplitSource.panels[0].id
const keptSplit = aiditor.movePanelToSplit(keepSplitTree, keepSplitPanelId, keepSplitTarget.id, 'horizontal', 'after', 0.3)
const keptSplitSourceDock = aiditor.findDock(keptSplit.tree, keepSplitSource.id).node
assert.equal(keptSplitSourceDock.panels.length, 0)
assert.equal(keptSplitSourceDock.activeId, null)
assert.equal(aiditor.findPanel(keptSplit.tree, keepSplitPanelId).dockId, keptSplit.newDockId)

const closeSource = aiditor.dock({ name: 'close-source', panels: [aiditor.panel({ component: 'editor', title: 'Only' })] })
const closeTarget = aiditor.dock({ name: 'close-target', panels: [aiditor.panel({ component: 'editor', title: 'Other' })] })
const closeTree = aiditor.split('horizontal', [closeSource, closeTarget], [0.5, 0.5])
const closePanelId = closeSource.panels[0].id
const closedTree = aiditor.removePanel(closeTree, closePanelId)
assert.equal(aiditor.findDock(closedTree, closeSource.id), null)
assert.equal(aiditor.findDock(closedTree, closeTarget.id).node.panels.length, 1)

const keepCloseSource = aiditor.dock({
  name: 'keep-close-source',
  removeWhenEmpty: false,
  panels: [aiditor.panel({ component: 'editor', title: 'Only' })],
})
const keepCloseTarget = aiditor.dock({ name: 'keep-close-target', panels: [aiditor.panel({ component: 'editor', title: 'Other' })] })
const keepCloseTree = aiditor.split('horizontal', [keepCloseSource, keepCloseTarget], [0.5, 0.5])
const keepClosePanelId = keepCloseSource.panels[0].id
const keptClosedTree = aiditor.removePanel(keepCloseTree, keepClosePanelId)
const keptCloseSourceDock = aiditor.findDock(keptClosedTree, keepCloseSource.id).node
assert.equal(keptCloseSourceDock.removeWhenEmpty, false)
assert.equal(keptCloseSourceDock.panels.length, 0)
assert.equal(keptCloseSourceDock.activeId, null)

const closeRoot = aiditor.dock({ name: 'close-root', panels: [aiditor.panel({ component: 'editor', title: 'Root Only' })] })
const closeRootPanelId = closeRoot.panels[0].id
const closedRoot = aiditor.removePanel(closeRoot, closeRootPanelId)
assert.equal(closedRoot.id, closeRoot.id)
assert.equal(closedRoot.panels.length, 0)
assert.equal(closedRoot.activeId, null)

const replaceRoot = aiditor.dock({
  panels: [
    aiditor.panel({ component: 'old.panel', title: 'Old' }),
    aiditor.panel({ component: 'side.panel', title: 'Side' }),
  ],
})
const oldId = replaceRoot.panels[0].id
const replaced = aiditor.replacePanel(replaceRoot, oldId, { component: 'new.panel', title: 'New' })
assert.notEqual(replaced.panelId, oldId)
assert.equal(aiditor.findPanel(replaced.tree, oldId), null)
assert.equal(aiditor.findPanel(replaced.tree, replaced.panelId).panel.component, 'new.panel')
assert.equal(aiditor.findPanel(replaced.tree, replaced.panelId).dockId, replaceRoot.id)
assert.equal(replaced.tree.activeId, replaced.panelId)

const merge = aiditor.mergeDocks(movedTree, sideId, dockId)
assert.ok(Array.isArray(merge.discardedPanels))
assert.equal(aiditor.findDock(merge.tree, dockId), null)

const focused = aiditor.setFocused(split, dockId, true)
assert.equal(aiditor.findDock(focused, dockId).node.focused, true)
assert.equal(!!aiditor.findDock(focused, sideId).node.focused, false)

console.log('tree tests ok')
