import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
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
}, { owner: 'extension:case', layer: 'project' })

aeditor.commands.registerMenu('case.refresh.menu', {
  target: 'dock.panel.context',
  command: 'case.refresh',
  order: 2,
}, { owner: 'extension:case', layer: 'project' })

assert.deepEqual(aeditor.commands.list({ owner: 'extension:case' }), ['case.refresh'])
assert.equal(aeditor.commands.meta('case.refresh').layer, 'project')
assert.equal(aeditor.commands.run('case.refresh', { id: 1 }, { actor: 'user' }), 'ok')
assert.deepEqual(ran.input, { id: 1 })
assert.equal(ran.ctx.command, 'case.refresh')

const menu = aeditor.commands.menuItems('dock.panel.context')
assert.equal(menu.length, 1)
assert.equal(menu[0].label, 'Refresh')
assert.equal(menu[0].icon, 'refresh-cw')

const uiItem = aeditor.commands.menuUiItems('dock.panel.context')[0]
uiItem.onSelect()
assert.deepEqual(ran.input, {})

aeditor.commands.unregisterOwner('extension:case')
assert.deepEqual(aeditor.commands.list({ owner: 'extension:case' }), [])
assert.deepEqual(aeditor.commands.menuItems('dock.panel.context'), [])

console.log('commands tests ok')
