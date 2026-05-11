import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/history.js', 'utf8'), { filename: 'history.js' })

const aeditor = window.aeditor
let state = { value: 1 }
const applied = []
const history = aeditor.history.create({
  capture: () => ({ value: state.value }),
  apply: (snapshot, ctx) => {
    applied.push(ctx.reason + ':' + snapshot.value)
    state = { value: snapshot.value }
  },
  limit: 3,
})

history.reset('Initial')
state.value = 2
history.capture('Two')
state.value = 3
history.capture('Three')

assert.equal(history.entries().length, 3)
assert.equal(history.index(), 2)
assert.equal(history.canUndo(), true)
assert.equal(history.canRedo(), false)

history.undo()
assert.equal(state.value, 2)
assert.equal(history.index(), 1)
assert.equal(history.canRedo(), true)

history.redo()
assert.equal(state.value, 3)
assert.deepEqual(applied, ['undo:2', 'redo:3'])

history.undo()
state.value = 4
history.capture('Four')
assert.equal(history.canRedo(), false)
assert.deepEqual(history.entries().map((e) => e.label), ['Initial', 'Two', 'Four'])

state.value = 5
history.capture('Five')
assert.deepEqual(history.entries().map((e) => e.label), ['Two', 'Four', 'Five'])
assert.equal(history.index(), 2)

history.pause(() => {
  state.value = 6
  history.capture('Ignored')
})
assert.deepEqual(history.entries().map((e) => e.label), ['Two', 'Four', 'Five'])

history.record('Seven', () => {
  state.value = 7
  state.value = 7
})
assert.equal(history.current().label, 'Seven')

console.log('history tests ok')
