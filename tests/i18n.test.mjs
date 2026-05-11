import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/i18n.js', 'utf8'), { filename: 'i18n.js' })

const aeditor = window.aeditor

aeditor.i18n.register('en', { hello: 'Hello {name}', only: 'Only English' })
aeditor.i18n.register('zh', { hello: '你好 {name}' })
assert.equal(aeditor.i18n.t('hello', { name: 'Ada' }), 'Hello Ada')
aeditor.i18n.setLocale('zh')
assert.equal(aeditor.i18n.t('hello', { name: 'Ada' }), '你好 Ada')
assert.equal(aeditor.i18n.t('only'), 'Only English')
assert.equal(aeditor.i18n.t('missing.key'), 'missing.key')

const sig = aeditor.i18n.text('hello', { name: 'Lin' })
assert.equal(sig(), '你好 Lin')
aeditor.i18n.setLocale('en')
assert.equal(sig(), 'Hello Lin')
sig.dispose()

console.log('i18n tests ok')
