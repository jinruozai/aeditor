import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })

const EF = window.EF

const a = EF.signal(1)
let runs = 0
let cleanups = 0
const stop = EF.effect(function () {
  runs++
  a()
  EF.onCleanup(function () { cleanups++ })
})
assert.equal(runs, 1)
a.set(2)
assert.equal(runs, 2)
assert.equal(cleanups, 1)
stop()
assert.equal(cleanups, 2)
a.set(3)
assert.equal(runs, 2)

const b = EF.signal(2)
const c = EF.derived(function () { return a() + b() })
assert.equal(c(), 5)
b.set(5)
assert.equal(c(), 8)
c.dispose()

let batched = 0
const x = EF.signal(0)
EF.effect(function () { x(); batched++ })
EF.batch(function () {
  x.set(1)
  x.set(2)
})
assert.equal(batched, 2)

console.log('signal tests ok')
