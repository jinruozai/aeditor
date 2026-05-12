import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { aeditor: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/log.js', 'utf8'), { filename: 'log.js' })
vm.runInThisContext(readFileSync('src/core/names.js', 'utf8'), { filename: 'names.js' })
vm.runInThisContext(readFileSync('src/ai/name-generator.js', 'utf8'), { filename: 'ai/name-generator.js' })
vm.runInThisContext(readFileSync('src/ai/store.js', 'utf8'), { filename: 'ai/store.js' })
vm.runInThisContext(readFileSync('src/ai/connection.js', 'utf8'), { filename: 'ai/connection.js' })
vm.runInThisContext(readFileSync('src/ai/adapter.js', 'utf8'), { filename: 'ai/adapter.js' })
vm.runInThisContext(readFileSync('src/ai/provider.js', 'utf8'), { filename: 'ai/provider.js' })
vm.runInThisContext(readFileSync('src/ai/provider-auth.js', 'utf8'), { filename: 'ai/provider-auth.js' })
vm.runInThisContext(readFileSync('src/ai/provider-transports.js', 'utf8'), { filename: 'ai/provider-transports.js' })
vm.runInThisContext(readFileSync('src/ai/provider-connections.js', 'utf8'), { filename: 'ai/provider-connections.js' })
vm.runInThisContext(readFileSync('src/ai/context.js', 'utf8'), { filename: 'ai/context.js' })
vm.runInThisContext(readFileSync('src/ai/reference.js', 'utf8'), { filename: 'ai/reference.js' })
vm.runInThisContext(readFileSync('src/ai/request.js', 'utf8'), { filename: 'ai/request.js' })
vm.runInThisContext(readFileSync('src/ai/runtime.js', 'utf8'), { filename: 'ai/runtime.js' })

const ai = window.aeditor.ai
let requestSeen = null

ai.registerTransport('capture', {
  send: function (connection, request) {
    requestSeen = request
    return { role: 'assistant', content: 'ok' }
  },
})
ai.registerConnection('capture', { auth: { type: 'none' }, transport: { type: 'capture' }, configDefaults: {} })

ai.references.register('secret', {
  read: function () { return { hidden: true } },
})

const target = ai.createAgent({
  name: 'Target',
  connection: 'capture',
  messages: [{ role: 'user', content: 'read context' }],
})
const actor = ai.createAgent({ name: 'Actor' })
const res = ai.addAttachment({
  resolver: 'secret',
  uri: 'secret://one',
  kind: 'secret.item',
  title: 'Secret One',
  meta: { id: 'one' },
})
ai.updateAgent(target.id, { contextRefs: [res.id] })
ai.setPermissionResolver(function (ctx, next) {
  if (ctx.scope === 'attachments.read') return false
  return next(ctx)
})

const run = ai.runAgent(target.id, { actor: actor.id })
await run.promise

assert.deepEqual(requestSeen.attachmentRefs, [])
assert.deepEqual(requestSeen.attachments, [])
assert.equal(requestSeen.messages.some(function (m) {
  return String(m.content || '').indexOf('Secret One') >= 0 || String(m.content || '').indexOf('secret://one') >= 0
}), false)

ai.setPermissionResolver(null)
const imageAgent = ai.createAgent({
  name: 'Image Target',
  connection: 'capture',
  messages: [{ role: 'user', content: 'read image' }],
})
const image = ai.addAttachment({
  resolver: 'file',
  uri: 'file://upload/icon.png',
  kind: 'file.image',
  title: 'icon.png',
  meta: { dataUrl: 'data:image/png;base64,aGVsbG8=', type: 'image/png' },
})
ai.updateAgent(imageAgent.id, { contextRefs: [image.id] })
await ai.runAgent(imageAgent.id).promise
assert.equal(requestSeen.messages[0].role, 'system')
const resourceMessage = requestSeen.messages.find(function (message) {
  return String(message.content || '').indexOf('Attached editor context') >= 0
})
assert.equal(!!resourceMessage, true)
assert.equal(String(resourceMessage.content).includes('data:image/png;base64'), false)
assert.equal(String(resourceMessage.content).includes('hasImageData'), true)
assert.equal(requestSeen.attachments[0].meta.dataUrl, 'data:image/png;base64,aGVsbG8=')

console.log('ai resource permission tests ok')
