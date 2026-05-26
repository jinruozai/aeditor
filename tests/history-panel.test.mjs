import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function node(tag, cls, attrs) {
  return {
    tagName: tag,
    className: cls || '',
    children: [],
    disabled: false,
    hidden: false,
    textContent: attrs && attrs.text || '',
    events: {},
    appendChild(child) { this.children.push(child); return child },
    addEventListener(type, fn) { this.events[type] = fn },
    click() { if (this.events.click) this.events.click({}) },
    setAttribute() {},
    removeAttribute() {},
  }
}

global.window = {
  aiditor: {
    ui: {
      h: node,
      iconButton: function () { return node('button') },
      view: function (opts) { return node('div', opts && opts.className || '') },
      disposeChildren: function (el) { el.children = [] },
    },
  },
}

for (const file of [
  'src/core/signal.js',
  'src/core/log.js',
  'src/core/names.js',
  'src/core/registry.js',
  'src/core/history.js',
  'src/ui/panel/history.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aiditor = window.aiditor
const panel = aiditor.resolveComponent('history')
assert.equal(panel.label, 'History')

let value = 1
let release
const history = aiditor.history.create({
  capture: () => ({ value }),
  apply: (snapshot) => new Promise(function (resolve) {
    release = function () {
      value = snapshot.value
      resolve()
    }
  }),
})
history.reset('Initial')
value = 2
history.capture('Second')

let errorSeen = null
aiditor.history.bind('case', history, {
  savedIndex: 0,
  onError: function (err) { errorSeen = err },
})

const propsSig = aiditor.signal({ historyId: 'case' })
const cleanup = []
const root = panel.factory(propsSig, { onCleanup: function (fn) { cleanup.push(fn) } })
const bar = root.children[0]
const undoButton = bar.children[0]
const status = bar.children[2]
assert.equal(status.textContent, '2 / 2 · modified')

undoButton.click()
assert.equal(history.applying(), true)
assert.equal(history.index(), 1)
release()
await Promise.resolve()
await Promise.resolve()
assert.equal(history.applying(), false)
assert.equal(history.index(), 0)
assert.equal(value, 1)
assert.equal(status.textContent, '1 / 2 · saved')

const failing = aiditor.history.create({
  capture: () => ({ value }),
  apply: () => Promise.reject(new Error('panel failure')),
})
failing.reset('Initial')
value = 3
failing.capture('Third')
assert.equal(failing.index(), 1)
aiditor.history.bind('case', failing, { onError: function (err) { errorSeen = err } })
undoButton.click()
assert.equal(failing.applying(), true)
await Promise.resolve()
await Promise.resolve()
await Promise.resolve()
await Promise.resolve()
await new Promise(function (resolve) { setTimeout(resolve, 0) })
assert.equal(errorSeen.message, 'panel failure')
assert.equal(failing.index(), 1)

cleanup.forEach(function (fn) { fn() })
console.log('history panel tests ok')
