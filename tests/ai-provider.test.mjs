import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/core/signal.js', 'utf8'), { filename: 'signal.js' })
vm.runInThisContext(readFileSync('src/core/settings.js', 'utf8'), { filename: 'settings.js' })
vm.runInThisContext(readFileSync('src/ai/provider.js', 'utf8'), { filename: 'ai/provider.js' })

const EF = window.EF
const ai = EF.ai
const calls = []

global.fetch = function (url, opts) {
  calls.push({ url, opts: opts || {} })
  if (String(url).startsWith('https://stream.test')) {
    return Promise.resolve(streamResponse([
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
      'data: [DONE]\n\n',
    ]))
  }
  if (String(url).endsWith('/models')) {
    return Promise.resolve(response({
      data: [{ id: 'model-a' }, { id: 'model-b' }],
      models: [{ id: 'bridge-a' }],
    }))
  }
  if (String(url).endsWith('/chat/completions')) {
    return Promise.resolve(response({
      choices: [{ message: { role: 'assistant', content: 'openai reply' } }],
    }))
  }
  if (String(url).endsWith('/v1/messages')) {
    return Promise.resolve(response({
      content: [{ type: 'text', text: 'anthropic reply' }],
    }))
  }
  if (String(url).endsWith('/chat')) {
    return Promise.resolve(response({
      message: { role: 'assistant', content: 'bridge reply' },
    }))
  }
  return Promise.resolve(response({}, false, 'not found'))
}

function response(body, ok = true, statusText = 'OK') {
  return {
    ok,
    statusText,
    headers: { get: function () { return 'application/json' } },
    text: function () { return Promise.resolve(JSON.stringify(body)) },
  }
}

function streamResponse(chunks) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    ok: true,
    statusText: 'OK',
    headers: { get: function () { return 'text/event-stream' } },
    body: {
      getReader: function () {
        return {
          read: function () {
            if (index >= chunks.length) return Promise.resolve({ done: true })
            return Promise.resolve({ done: false, value: encoder.encode(chunks[index++]) })
          },
        }
      },
    },
    text: function () { throw new Error('stream response should not be buffered') },
  }
}

assert.deepEqual(ai.listProviders(), [
  'mock',
  'openai-compatible',
  'openrouter',
  'groq',
  'mistral',
  'xai',
  'deepseek',
  'ollama',
  'custom-openai',
  'anthropic-compatible',
  'local-bridge',
])
assert.equal(ai.providerOptions()[1].label, 'OpenAI Compatible')

EF.settings.set('ai.openai-compatible.baseUrl', 'https://openai.test/v1/')
EF.settings.set('ai.openai-compatible.apiKey', 'openai-key')
EF.settings.set('ai.openai-compatible.defaultModel', 'model-a')
EF.settings.set('ai.openai-compatible.stream', true)

const openAiModels = await ai.refreshModels('openai-compatible')
assert.deepEqual(openAiModels.map(function (m) { return m.id }), ['model-a', 'model-b'])
assert.equal(calls.at(-1).url, 'https://openai.test/v1/models')
assert.equal(calls.at(-1).opts.headers.Authorization, 'Bearer openai-key')

const openAiReply = await ai.getProvider('openai-compatible').send({
  model: '',
  stream: true,
  messages: [{ role: 'user', content: 'hello' }],
  toolSpecs: [],
}, { signal: null })
assert.equal(openAiReply.content, 'openai reply')
const openAiBody = JSON.parse(calls.at(-1).opts.body)
assert.equal(openAiBody.model, 'model-a')
assert.equal(openAiBody.stream, true)
assert.deepEqual(openAiBody.messages, [{ role: 'user', content: 'hello' }])

const imageDataUrl = 'data:image/png;base64,aGVsbG8='
await ai.getProvider('openai-compatible').send({
  model: '',
  stream: false,
  messages: [{ role: 'user', content: 'see image' }],
  resourceRefs: [{ kind: 'file.image', title: 'icon.png', meta: { dataUrl: imageDataUrl } }],
  resources: [{ dataUrl: imageDataUrl }],
  toolSpecs: [],
}, { signal: null })
const openAiImageBody = JSON.parse(calls.at(-1).opts.body)
assert.deepEqual(openAiImageBody.messages[0].content, [
  { type: 'text', text: 'see image' },
  { type: 'image_url', image_url: { url: imageDataUrl } },
])

const openAiToolReply = await ai.getProvider('openai-compatible').send({
  model: '',
  stream: true,
  messages: [{ role: 'user', content: 'use tool' }],
  toolSpecs: [{ id: 'gde.queryRows', title: 'Query Rows', description: 'Read rows', schema: { table: 'string', limit: 'number' } }],
}, { signal: null })
const openAiToolBody = JSON.parse(calls.at(-1).opts.body)
assert.equal(openAiToolBody.stream, false)
assert.equal(openAiToolBody.tools[0].function.name, 'gde__queryRows')
assert.deepEqual(openAiToolBody.tools[0].function.parameters.properties.table, { type: 'string' })
assert.deepEqual(openAiToolReply.toolCalls, [])

EF.settings.set('ai.deepseek.baseUrl', 'https://stream.test/v1')
EF.settings.set('ai.deepseek.defaultModel', 'deepseek-v4-flash')
EF.settings.set('ai.deepseek.stream', true)
const streamedReply = await ai.getProvider('deepseek').send({
  model: '',
  stream: true,
  messages: [{ role: 'user', content: 'stream' }],
}, { signal: null })
assert.equal(typeof streamedReply.deltas[Symbol.asyncIterator], 'function')
const streamParts = []
let streamUsage = null
for await (const delta of streamedReply.deltas) {
  if (delta.text) streamParts.push(delta.text)
  if (delta.usage) streamUsage = delta.usage
}
assert.equal(streamParts.join(''), 'hello')
assert.deepEqual(streamUsage, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 })

EF.settings.set('ai.anthropic-compatible.baseUrl', 'https://anthropic.test')
EF.settings.set('ai.anthropic-compatible.apiKey', 'anthropic-key')
EF.settings.set('ai.anthropic-compatible.defaultModel', 'claude-test')

const anthropicReply = await ai.getProvider('anthropic-compatible').send({
  model: '',
  stream: false,
  messages: [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hello' },
  ],
}, { signal: null })
assert.equal(anthropicReply.content, 'anthropic reply')
const anthropicCall = calls.at(-1)
const anthropicBody = JSON.parse(anthropicCall.opts.body)
assert.equal(anthropicCall.opts.headers['x-api-key'], 'anthropic-key')
assert.equal(anthropicCall.opts.headers['anthropic-version'], '2023-06-01')
assert.equal(anthropicBody.model, 'claude-test')
assert.equal(anthropicBody.system, 'be brief')
assert.deepEqual(anthropicBody.messages, [{ role: 'user', content: 'hello' }])

await ai.getProvider('anthropic-compatible').send({
  model: '',
  stream: false,
  messages: [{ role: 'user', content: 'see image' }],
  resourceRefs: [{ kind: 'file.image', title: 'icon.png', meta: { dataUrl: imageDataUrl } }],
  resources: [{ dataUrl: imageDataUrl }],
}, { signal: null })
const anthropicImageBody = JSON.parse(calls.at(-1).opts.body)
assert.deepEqual(anthropicImageBody.messages[0].content, [
  { type: 'text', text: 'see image' },
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
])

EF.settings.set('ai.local-bridge.baseUrl', 'http://bridge.test/')
EF.settings.set('ai.local-bridge.defaultModel', 'local-test')
const bridgeReply = await ai.getProvider('local-bridge').send({
  model: '',
  stream: false,
  messages: [{ role: 'user', content: 'hello' }],
  resources: [{ uri: 'memory://one' }],
}, { signal: null })
assert.equal(bridgeReply.content, 'bridge reply')
const bridgeBody = JSON.parse(calls.at(-1).opts.body)
assert.equal(calls.at(-1).url, 'http://bridge.test/chat')
assert.equal(bridgeBody.model, 'local-test')
assert.deepEqual(bridgeBody.resources, [{ uri: 'memory://one' }])

console.log('ai provider tests ok')
