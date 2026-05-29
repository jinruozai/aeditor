import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function classList(el) {
  return {
    add: function () {
      for (let i = 0; i < arguments.length; i++) {
        if (!el.classes.includes(arguments[i])) el.classes.push(arguments[i])
      }
      el.className = el.classes.join(' ')
    },
    remove: function () {
      for (let i = 0; i < arguments.length; i++) {
        const at = el.classes.indexOf(arguments[i])
        if (at >= 0) el.classes.splice(at, 1)
      }
      el.className = el.classes.join(' ')
    },
    contains: function (name) { return el.classes.includes(name) },
  }
}

function element(tag, cls) {
  const el = {
    tagName: tag.toUpperCase(),
    className: cls || '',
    classes: cls ? cls.split(/\s+/).filter(Boolean) : [],
    children: [],
    parentElement: null,
    parentNode: null,
    dataset: {},
    style: {},
    attrs: {},
    textContent: '',
    classList: null,
    rect: { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 },
    appendChild: function (child) {
      if (child.parentNode) child.parentNode.removeChild(child)
      this.children.push(child)
      child.parentNode = this
      child.parentElement = this
      return child
    },
    removeChild: function (child) {
      const at = this.children.indexOf(child)
      if (at >= 0) this.children.splice(at, 1)
      child.parentNode = null
      child.parentElement = null
      return child
    },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this) },
    setAttribute: function (name, value) { this.attrs[name] = String(value) },
    getBoundingClientRect: function () { return this.rect },
    closest: function (selector) {
      if (selector !== '.aiditor-dock') return null
      let node = this
      while (node) {
        if (node.classList && node.classList.contains('aiditor-dock')) return node
        node = node.parentElement
      }
      return null
    },
    querySelectorAll: function () { return [] },
  }
  el.classList = classList(el)
  return el
}

const listeners = {}
const body = element('body')
const dockEl = element('div', 'aiditor-dock')
dockEl.rect = { left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300 }
const childEl = element('div')
dockEl.appendChild(childEl)

global.window = {
  aiditor: {
    ui: { readNum: function () { return 0 } },
    reportError: function (_, err) { throw err },
  },
  addEventListener: function (type, fn) {
    if (!listeners[type]) listeners[type] = []
    listeners[type].push(fn)
  },
  removeEventListener: function (type, fn) {
    listeners[type] = (listeners[type] || []).filter(function (item) { return item !== fn })
  },
}
global.document = {
  body: body,
  createElement: function (tag) { return element(tag) },
  createElementNS: function (_, tag) { return element(tag) },
  elementFromPoint: function () { return childEl },
}

for (const file of [
  'src/core/signal.js',
  'src/tree/tree.js',
  'src/dock/panel-drag.js',
]) {
  vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file })
}

const aiditor = window.aiditor
const dock = aiditor.dock({ name: 'main' })
dockEl.dataset.dockId = dock.id

let tree = dock
const added = []
const runtime = {
  treeSig: { peek: function () { return tree } },
  dockRuntimes: new Map([[dock.id, {}]]),
  addPanel: function (dockId, partial) {
    added.push({ dockId: dockId, partial: partial })
    return 'panel-added'
  },
  addPanelToSplit: function () {},
}

aiditor._dock.beginExternalPanelDrag({
  button: 0,
  clientX: 10,
  clientY: 10,
  preventDefault: function () {},
}, { component: 'case.panel', title: 'Case Panel', props: { value: 1 } }, runtime, { label: 'Case Panel' })

listeners.pointermove[0]({ clientX: 150, clientY: 150 })
assert.equal(dockEl.classList.contains('aiditor-drop-target'), true)
listeners.pointerup[0]({})
assert.deepEqual(added, [{
  dockId: dock.id,
  partial: { component: 'case.panel', title: 'Case Panel', props: { value: 1 } },
}])

const addedFromHandle = []
const runtimeFromHandle = {
  treeSig: { peek: function () { return tree } },
  dockRuntimes: new Map([[dock.id, {}]]),
  addPanel: function (dockId, partial) {
    addedFromHandle.push({ dockId: dockId, partial: partial })
    return 'panel-added-from-handle'
  },
  addPanelToSplit: function () {},
}
const handle = { _runtime: runtimeFromHandle }

aiditor._dock.beginExternalPanelDrag({
  button: 0,
  clientX: 10,
  clientY: 10,
  preventDefault: function () {},
}, { component: 'case.other', title: 'Other Panel' }, handle)

listeners.pointermove[listeners.pointermove.length - 1]({ clientX: 150, clientY: 150 })
listeners.pointerup[listeners.pointerup.length - 1]({})
assert.deepEqual(addedFromHandle, [{
  dockId: dock.id,
  partial: { component: 'case.other', title: 'Other Panel' },
}])

console.log('panel drag tests ok')
