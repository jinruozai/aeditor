import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/i18n.js', 'utf8'), { filename: 'i18n.js' })

const EF = window.EF

EF.i18n.register('en', { hello: 'Hello {name}', only: 'Only English' })
EF.i18n.register('zh', { hello: '你好 {name}' })
assert.equal(EF.i18n.t('hello', { name: 'Ada' }), 'Hello Ada')
EF.i18n.setLocale('zh')
assert.equal(EF.i18n.t('hello', { name: 'Ada' }), '你好 Ada')
assert.equal(EF.i18n.t('only'), 'Only English')
assert.equal(EF.i18n.t('missing.key'), 'missing.key')

const sig = EF.i18n.text('hello', { name: 'Lin' })
assert.equal(sig(), '你好 Lin')
EF.i18n.setLocale('en')
assert.equal(sig(), 'Hello Lin')
sig.dispose()

console.log('i18n tests ok')
