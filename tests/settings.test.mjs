import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const memory = {}
global.window = {
  aeditor: {},
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null },
    setItem(key, value) { memory[key] = String(value) },
    removeItem(key) { delete memory[key] },
  },
}

vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/names.js', 'utf8'), { filename: 'names.js' })
vm.runInThisContext(readFileSync('src/core/settings.js', 'utf8'), { filename: 'settings.js' })

const aeditor = window.aeditor

aeditor.settings.registerSchema('ai', { key: 'ai.deepseek.apiKey', default: '' })
aeditor.settings.registerSection('demo.tools', { title: 'Tools' })
aeditor.settings.registerSchema('demo.tools', { key: 'demo.tools.enabled', default: true })
aeditor.settings.registerPage('demo.tools.page', { section: 'demo.tools', title: 'Tools' })
assert.equal(aeditor.settings.schemas.peek().some(function (item) { return item.key === 'demo.tools.enabled' }), true)
assert.deepEqual(aeditor.settings.unregisterPrefix('demo.tools').sort(), ['demo.tools', 'demo.tools.enabled', 'demo.tools.page'])
assert.equal(aeditor.settings.schemas.peek().some(function (item) { return item.key === 'demo.tools.enabled' }), false)
assert.equal(aeditor.settings.get('ai.deepseek.apiKey'), '')

aeditor.settings.set('ai.deepseek.apiKey', 'k1')
assert.equal(aeditor.settings.get('ai.deepseek.apiKey'), 'k1')
assert.equal(JSON.parse(memory['aeditor.settings.v1'])['ai.deepseek.apiKey'], 'k1')

aeditor.settings.configurePersistence({ key: 'aeditor.settings.v1' })
assert.equal(aeditor.settings.get('ai.deepseek.apiKey'), 'k1')

aeditor.settings.reset('ai.deepseek.apiKey')
assert.equal(aeditor.settings.get('ai.deepseek.apiKey'), '')
assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(memory['aeditor.settings.v1']), 'ai.deepseek.apiKey'), false)

aeditor.settings.importValues({ 'ai.deepseek.apiKey': 'k2' })
assert.equal(JSON.parse(memory['aeditor.settings.v1'])['ai.deepseek.apiKey'], 'k2')
aeditor.settings.clearStoredValues()
assert.equal(memory['aeditor.settings.v1'], undefined)

console.log('settings tests ok')
