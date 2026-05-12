import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/names.js', 'utf8'), { filename: 'names.js' })
vm.runInThisContext(readFileSync('src/core/commands.js', 'utf8'), { filename: 'commands.js' })

const aeditor = window.aeditor
let ran = null

aeditor.commands.register('case.refresh', {
  title: 'Refresh',
  icon: 'refresh-cw',
  run: function (input, ctx) {
    ran = { input, ctx }
    return 'ok'
  },
}, { owner: 'extension:case', layer: 'app' })

aeditor.commands.registerMenu('case.refresh.menu', {
  target: 'dock.panel.context',
  command: 'case.refresh',
  order: 2,
}, { owner: 'extension:case', layer: 'app' })

aeditor.commands.register('case.extra', { run: function () {} })
aeditor.commands.registerMenu('case.extra.menu', { target: 'dock.panel.context', command: 'case.extra' })

assert.deepEqual(aeditor.commands.list({ owner: 'extension:case' }), ['case.refresh'])
assert.equal(aeditor.commands.meta('case.refresh').layer, 'app')
assert.equal(aeditor.commands.run('case.refresh', { id: 1 }, { actor: 'user' }), 'ok')
assert.deepEqual(ran.input, { id: 1 })
assert.equal(ran.ctx.command, 'case.refresh')

const menu = aeditor.commands.menuItems('dock.panel.context')
assert.equal(menu.length, 2)
const refreshMenu = menu.find(function (item) { return item.id === 'case.refresh.menu' })
assert.equal(refreshMenu.label, 'Refresh')
assert.equal(refreshMenu.icon, 'refresh-cw')

const uiItem = aeditor.commands.menuUiItems('dock.panel.context').find(function (item) { return item.id === 'case.refresh.menu' })
uiItem.onSelect()
assert.deepEqual(ran.input, {})

aeditor.commands.unregisterOwner('extension:case')
assert.deepEqual(aeditor.commands.list({ owner: 'extension:case' }), [])
assert.equal(aeditor.commands.menuItems('dock.panel.context').length, 1)

assert.deepEqual(aeditor.commands.unregisterPrefix('case'), ['case.extra', 'case.extra.menu'])
assert.deepEqual(aeditor.commands.menuItems('dock.panel.context'), [])

console.log('commands tests ok')
