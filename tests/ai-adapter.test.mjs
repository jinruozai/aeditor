import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

global.window = { EF: {} }
vm.runInThisContext(readFileSync('src/ai/adapter.js', 'utf8'), { filename: 'ai/adapter.js' })

const ai = window.EF.ai

const request = {
  agent: { id: 'a_main', name: 'main', parentAgentId: null },
  messages: [
    { role: 'system', content: 'You are exact.' },
    { role: 'user', content: 'Create a helper.' },
  ],
  toolSpecs: [{
    id: 'agent.create',
    title: 'Create Agent',
    description: 'Create a child agent.',
    schema: { name: 'string', parentAgentId: 'string' },
  }],
}

const encoded = ai.encodeTextToolRequest(request)
assert.equal(encoded.inputItems.length, 1)
assert.equal(encoded.inputItems[0].type, 'text')
assert.match(encoded.inputItems[0].text, /AVAILABLE_TOOLS/)
assert.match(encoded.inputItems[0].text, /CURRENT_AGENT_ID: a_main/)
assert.match(encoded.inputItems[0].text, /"parentAgentId":"a_main"/)
assert.match(encoded.inputItems[0].text, /MUST request the matching EditorFrame tool/)
assert.match(encoded.inputItems[0].text, /For "create an agent".*agent\.create/s)
assert.match(encoded.inputItems[0].text, /USER: Create a helper\./)

const decoded = ai.decodeTextToolResponse({
  role: 'assistant',
  content: [
    'I will create it.',
    '```json',
    '{"ef_tool_calls":[{"toolId":"agent.create","args":{"name":"helper","parentAgentId":"a_main"}}]}',
    '```',
  ].join('\n'),
})
assert.equal(decoded.content, 'I will create it.')
assert.equal(decoded.toolCalls.length, 1)
assert.equal(decoded.toolCalls[0].toolId, 'agent.create')
assert.equal(decoded.toolCalls[0].args.parentAgentId, 'a_main')

const rawDecoded = ai.decodeTextToolResponse({
  role: 'assistant',
  content: '{"ef_tool_calls":[{"toolId":"agent.send","args":{"agentId":"a_child","content":"write"}}]}',
})
assert.equal(rawDecoded.content, '')
assert.equal(rawDecoded.toolCalls.length, 1)
assert.equal(rawDecoded.toolCalls[0].toolId, 'agent.send')

const openAiTools = ai.openAiTools(request)
assert.equal(openAiTools[0].type, 'function')
assert.equal(openAiTools[0].function.name, 'agent__create')
assert.equal(openAiTools[0].function.parameters.type, 'object')

const openAiMessages = ai.openAiMessages([
  { role: 'assistant', content: 'Done', toolCalls: [{ id: 'call_1', toolId: 'agent.create', args: { name: 'helper' } }] },
  { role: 'tool', id: 'tool_result_1', meta: { toolCallId: 'call_1' }, content: { ok: true } },
], request)
assert.equal(openAiMessages[0].tool_calls[0].function.name, 'agent__create')
assert.equal(openAiMessages[1].role, 'tool')
assert.equal(openAiMessages[1].tool_call_id, 'call_1')

const normalized = ai.normalizeOpenAiToolCalls([{
  id: 'call_2',
  function: { name: 'agent__create', arguments: '{"name":"worker"}' },
}], request)
assert.equal(normalized[0].toolId, 'agent.create')
assert.equal(normalized[0].args.name, 'worker')

const imageRequest = {
  resourceRefs: [{ kind: 'file.image', title: 'icon.png' }],
  resources: [{ dataUrl: 'data:image/png;base64,AAAA' }],
}
const anthropicMessages = ai.anthropicPayloadMessages([{ role: 'user', content: 'Look.' }], imageRequest)
assert.equal(anthropicMessages[0].content[0].type, 'text')
assert.equal(anthropicMessages[0].content[1].type, 'image')
assert.equal(anthropicMessages[0].content[1].source.media_type, 'image/png')

console.log('ai adapter tests ok')
