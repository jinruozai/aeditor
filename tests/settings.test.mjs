import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const memory = {}
global.window = {
  EF: {},
  localStorage: {
    getItem(key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null },
    setItem(key, value) { memory[key] = String(value) },
    removeItem(key) { delete memory[key] },
  },
}

vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/settings.js', 'utf8'), { filename: 'settings.js' })

const EF = window.EF

EF.settings.registerSchema('ai', { key: 'ai.deepseek.apiKey', default: '' })
assert.equal(EF.settings.get('ai.deepseek.apiKey'), '')

EF.settings.set('ai.deepseek.apiKey', 'k1')
assert.equal(EF.settings.get('ai.deepseek.apiKey'), 'k1')
assert.equal(JSON.parse(memory['editorframe.settings.v1'])['ai.deepseek.apiKey'], 'k1')

EF.settings.configurePersistence({ key: 'editorframe.settings.v1' })
assert.equal(EF.settings.get('ai.deepseek.apiKey'), 'k1')

EF.settings.reset('ai.deepseek.apiKey')
assert.equal(EF.settings.get('ai.deepseek.apiKey'), '')
assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(memory['editorframe.settings.v1']), 'ai.deepseek.apiKey'), false)

EF.settings.importValues({ 'ai.deepseek.apiKey': 'k2' })
assert.equal(JSON.parse(memory['editorframe.settings.v1'])['ai.deepseek.apiKey'], 'k2')
EF.settings.clearStoredValues()
assert.equal(memory['editorframe.settings.v1'], undefined)

console.log('settings tests ok')
