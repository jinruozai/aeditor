import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aiditor: {} }

for (const file of [
  'src/core/signal.js',
  'src/ui/_internal/_signal.js',
  'src/ui/_internal/_scope.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aiditor = window.aiditor
const ui = aiditor.ui

const root = { parentNode: null }
const child = { parentNode: root }
const active = aiditor.signal(true)
const scope = ui.scope(root, { active: active })

assert.equal(ui.scopeOf(child), scope)

const closed = []
const unregister = ui.registerScopedOverlay(child, function () { closed.push('tip') })
active.set(false)
assert.deepEqual(closed, ['tip'])
unregister()
assert.deepEqual(closed, ['tip'])

active.set(true)
const popover = { parentNode: null, __aiditorUiScope: ui.scopeOf(child) }
const subAnchor = { parentNode: popover }
ui.registerScopedOverlay(subAnchor, function () { closed.push('sub') })
ui.closeScope(root)
assert.deepEqual(closed, ['tip', 'sub'])

ui.registerScopedOverlay(child, function () { closed.push('dispose') })
ui.dispose(root)
assert.deepEqual(closed, ['tip', 'sub', 'dispose'])

console.log('ui scope tests ok')
