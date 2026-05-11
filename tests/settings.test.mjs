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
vm.runInThisContext(readFileSync('src/core/settings.js', 'utf8'), { filename: 'settings.js' })

const aeditor = window.aeditor

aeditor.settings.registerSchema('ai', { key: 'ai.deepseek.apiKey', default: '' })
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
