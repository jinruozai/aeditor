import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const memory = {}
global.window = {
  aiditor: {},
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null },
    setItem(key, value) { memory[key] = String(value) },
    removeItem(key) { delete memory[key] },
  },
}

vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/names.js', 'utf8'), { filename: 'names.js' })
vm.runInThisContext(readFileSync('src/core/settings.js', 'utf8'), { filename: 'settings.js' })

const aiditor = window.aiditor

aiditor.settings.registerSchema('ai', { key: 'ai.deepseek.apiKey', default: '' })
aiditor.settings.registerSection('demo.tools', { title: 'Tools' })
aiditor.settings.registerSchema('demo.tools', { key: 'demo.tools.enabled', default: true })
aiditor.settings.registerPage('demo.tools.page', { section: 'demo.tools', title: 'Tools' })
assert.equal(aiditor.settings.schemas.peek().some(function (item) { return item.key === 'demo.tools.enabled' }), true)
assert.deepEqual(aiditor.settings.unregisterPrefix('demo.tools').sort(), ['demo.tools', 'demo.tools.enabled', 'demo.tools.page'])
assert.equal(aiditor.settings.schemas.peek().some(function (item) { return item.key === 'demo.tools.enabled' }), false)
assert.equal(aiditor.settings.get('ai.deepseek.apiKey'), '')

aiditor.settings.set('ai.deepseek.apiKey', 'k1')
assert.equal(aiditor.settings.get('ai.deepseek.apiKey'), 'k1')
assert.equal(JSON.parse(memory['aiditor.settings.v1'])['ai.deepseek.apiKey'], 'k1')

aiditor.settings.configurePersistence({ key: 'aiditor.settings.v1' })
assert.equal(aiditor.settings.get('ai.deepseek.apiKey'), 'k1')

aiditor.settings.reset('ai.deepseek.apiKey')
assert.equal(aiditor.settings.get('ai.deepseek.apiKey'), '')
assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(memory['aiditor.settings.v1']), 'ai.deepseek.apiKey'), false)

aiditor.settings.importValues({ 'ai.deepseek.apiKey': 'k2' })
assert.equal(JSON.parse(memory['aiditor.settings.v1'])['ai.deepseek.apiKey'], 'k2')
aiditor.settings.clearStoredValues()
assert.equal(memory['aiditor.settings.v1'], undefined)

console.log('settings tests ok')
