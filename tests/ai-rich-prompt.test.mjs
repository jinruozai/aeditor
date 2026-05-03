import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/ai/rich-prompt.js', 'utf8'), { filename: 'ai/rich-prompt.js' })

const rich = window.EF.ai.richPrompt

let draft = rich.empty()
draft = rich.insertText(draft, 0, 'Compare ')
draft = rich.insertRef(draft, draft.text.length, {
  id: 'res_icon',
  title: 'icon.png',
  kind: 'file.image',
  uri: 'file://upload/icon.png',
})
draft = rich.insertText(draft, draft.text.length, ' with ')
draft = rich.insertRef(draft, draft.text.length, {
  id: 'res_icon_2',
  title: 'icon2.png',
  kind: 'file.image',
})

assert.equal(draft.text.length, 'Compare '.length + 1 + ' with '.length + 1)
assert.deepEqual(rich.refs(draft), ['res_icon', 'res_icon_2'])
assert.equal(rich.toPlainText(draft), 'Compare [icon.png] with [icon2.png]')
assert.equal(rich.toModelText(draft), 'Compare [icon.png](ref:res_icon) with [icon2.png](ref:res_icon_2)')

const firstToken = draft.text['Compare '.length]
const withoutFirst = rich.deleteRange(draft, 'Compare '.length, 'Compare '.length + 1)
assert.equal(withoutFirst.tokens[firstToken], undefined)
assert.deepEqual(rich.refs(withoutFirst), ['res_icon_2'])

const sliced = rich.slice(draft, 'Compare '.length, draft.text.length)
assert.equal(rich.toPlainText(sliced), '[icon.png] with [icon2.png]')
assert.deepEqual(rich.refs(sliced), ['res_icon', 'res_icon_2'])

const inserted = rich.insertDraft(rich.insertText(rich.empty(), 0, 'Use '), 4, sliced)
assert.equal(rich.toPlainText(inserted), 'Use [icon.png] with [icon2.png]')
assert.deepEqual(rich.refs(inserted), ['res_icon', 'res_icon_2'])

const targetWithToken = rich.insertRef(rich.insertText(rich.empty(), 0, 'Keep '), 5, {
  id: 'res_keep',
  title: 'keep.png',
})
const merged = rich.insertDraft(targetWithToken, targetWithToken.text.length, sliced)
assert.equal(rich.toPlainText(merged), 'Keep [keep.png][icon.png] with [icon2.png]')
assert.deepEqual(rich.refs(merged), ['res_keep', 'res_icon', 'res_icon_2'])

const orphan = rich.normalize({
  text: 'A' + firstToken + 'B',
  tokens: {},
})
assert.equal(orphan.text, 'AB')

const content = rich.content(draft)
assert.equal(content.type, 'rich-prompt')
assert.equal(content.renderedText, rich.toModelText(draft))
assert.deepEqual(rich.fromContent(content), draft)

console.log('ai rich prompt tests ok')
