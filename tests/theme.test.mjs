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

global.window = { EF: {} }
global.document = { documentElement: root }
global.getComputedStyle = function (el) {
  return {
    getPropertyValue: function (name) {
      return el.style.getPropertyValue(name) || (name === '--ef-brand' ? '#569eff' : '')
    },
  }
}

vm.runInThisContext(readFileSync('src/core/theme.js', 'utf8'), { filename: 'theme.js' })

const EF = window.EF

assert.equal(EF.theme.get(), 'dark')
EF.theme.set('light')
assert.equal(root.getAttribute('data-ef-theme'), 'light')
assert.equal(EF.theme.get(), 'light')
EF.theme.set('dark')
assert.equal(root.getAttribute('data-ef-theme'), null)
assert.equal(EF.theme.get(), 'dark')

EF.theme.set('dark', scoped)
assert.equal(scoped.getAttribute('data-ef-theme'), 'dark')
EF.theme.set('light', scoped)
assert.equal(scoped.getAttribute('data-ef-theme'), 'light')

EF.theme.apply({ '--ef-brand': '#123456', '--ef-surface-panel': '#222222' })
assert.equal(root.style.getPropertyValue('--ef-brand'), '#123456')
assert.equal(EF.theme.read('--ef-brand'), '#123456')
EF.theme.reset(null, ['--ef-brand'])
assert.equal(root.style.getPropertyValue('--ef-brand'), '')
assert.equal(EF.theme.read('--ef-brand'), '#569eff')

const css = EF.theme.exportCss(null, ['--ef-brand'])
assert.equal(css, ':root {\n  --ef-brand: #569eff;\n}')

console.log('theme tests ok')
