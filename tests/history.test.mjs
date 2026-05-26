import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aiditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/history.js', 'utf8'), { filename: 'history.js' })

const aiditor = window.aiditor
let state = { value: 1 }
const applied = []
const history = aiditor.history.create({
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

await history.undo()
assert.equal(state.value, 2)
assert.equal(history.index(), 1)
assert.equal(history.canRedo(), true)

await history.redo()
assert.equal(state.value, 3)
assert.deepEqual(applied, ['undo:2', 'redo:3'])

await history.undo()
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

let asyncState = { value: 1 }
let releaseApply
const asyncHistory = aiditor.history.create({
  capture: () => ({ value: asyncState.value }),
  apply: (snapshot) => new Promise(function (resolve) {
    releaseApply = function () {
      asyncState = { value: snapshot.value }
      resolve()
    }
  }),
})
asyncHistory.reset('Initial')
asyncState.value = 2
asyncHistory.capture('Two')
const pendingUndo = asyncHistory.undo()
assert.equal(asyncHistory.applying(), true)
assert.equal(asyncHistory.index(), 1)
releaseApply()
await pendingUndo
assert.equal(asyncHistory.applying(), false)
assert.equal(asyncHistory.index(), 0)
assert.equal(asyncState.value, 1)

let failingState = { value: 1 }
const failingHistory = aiditor.history.create({
  capture: () => ({ value: failingState.value }),
  apply: () => Promise.reject(new Error('apply failed')),
})
failingHistory.reset('Initial')
failingState.value = 2
failingHistory.capture('Two')
await assert.rejects(function () { return failingHistory.undo() }, /apply failed/)
assert.equal(failingHistory.applying(), false)
assert.equal(failingHistory.index(), 1)
assert.equal(failingState.value, 2)

const unbind = aiditor.history.bind('case', history, { savedIndex: 1 })
assert.equal(aiditor.history.binding('case').history, history)
unbind()
assert.equal(aiditor.history.binding('case'), null)

console.log('history tests ok')
