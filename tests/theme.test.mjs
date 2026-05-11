import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

class FakeStyle {
  constructor() { this.map = new Map() }
  setProperty(k, v) { this.map.set(k, String(v)) }
  removeProperty(k) { this.map.delete(k) }
  getPropertyValue(k) { return this.map.get(k) || '' }
}

class FakeEl {
  constructor() {
    this.attrs = new Map()
    this.style = new FakeStyle()
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)) }
  removeAttribute(k) { this.attrs.delete(k) }
  getAttribute(k) { return this.attrs.get(k) || null }
}

const root = new FakeEl()
const scoped = new FakeEl()

global.window = { aeditor: {} }
global.document = { documentElement: root }
global.getComputedStyle = function (el) {
  return {
    getPropertyValue: function (name) {
      return el.style.getPropertyValue(name) || (name === '--aeditor-brand' ? '#569eff' : '')
    },
  }
}

vm.runInThisContext(readFileSync('src/core/theme.js', 'utf8'), { filename: 'theme.js' })

const aeditor = window.aeditor

assert.equal(aeditor.theme.get(), 'dark')
aeditor.theme.set('light')
assert.equal(root.getAttribute('data-aeditor-theme'), 'light')
assert.equal(aeditor.theme.get(), 'light')
aeditor.theme.set('dark')
assert.equal(root.getAttribute('data-aeditor-theme'), null)
assert.equal(aeditor.theme.get(), 'dark')

aeditor.theme.set('dark', scoped)
assert.equal(scoped.getAttribute('data-aeditor-theme'), 'dark')
aeditor.theme.set('light', scoped)
assert.equal(scoped.getAttribute('data-aeditor-theme'), 'light')

aeditor.theme.apply({ '--aeditor-brand': '#123456', '--aeditor-surface-panel': '#222222' })
assert.equal(root.style.getPropertyValue('--aeditor-brand'), '#123456')
assert.equal(aeditor.theme.read('--aeditor-brand'), '#123456')
aeditor.theme.reset(null, ['--aeditor-brand'])
assert.equal(root.style.getPropertyValue('--aeditor-brand'), '')
assert.equal(aeditor.theme.read('--aeditor-brand'), '#569eff')

const css = aeditor.theme.exportCss(null, ['--aeditor-brand'])
assert.equal(css, ':root {\n  --aeditor-brand: #569eff;\n}')

console.log('theme tests ok')
