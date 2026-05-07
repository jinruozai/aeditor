// EF.ai provider adapters.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  function messageText(content) {
    if (content && typeof content === 'object' && content.type === 'rich-prompt') {
      return content.renderedText || (ai.richPrompt && ai.richPrompt.toModelText ? ai.richPrompt.toModelText(content) : '')
    }
    if (Array.isArray(content)) {
      return content.map(function (item) { return typeof item === 'string' ? item : (item.text || item.content || '') }).join('')
    }
    return content == null ? '' : String(content)
  }

  function dataUrlInfo(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.*)$/)
    return match ? { mediaType: match[1], base64: match[2], url: dataUrl } : null
  }

  function imageResources(request) {
    const refs = request.resourceRefs || []
    const resolved = request.resources || request.resolvedResources || []
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i] || {}
      const payload = resolved[i] || {}
      const dataUrl = (payload && payload.dataUrl) || (ref.meta && ref.meta.dataUrl)
      const info = dataUrlInfo(dataUrl)
      if (info && ((ref.kind || payload.kind) === 'file.image' || String(info.mediaType).indexOf('image/') === 0)) {
        out.push({
          title: ref.title || ref.uri || 'image',
          mediaType: info.mediaType,
          base64: info.base64,
          url: info.url,
        })
      }
    }
    return out
  }

  function jsonSchema(schema) {
    if (!schema) return { type: 'object', properties: {} }
    if (schema.type) return schema
    const props = {}
    Object.keys(schema || {}).forEach(function (key) {
      const value = schema[key]
      if (typeof value === 'string') props[key] = value === 'any' ? {} : { type: value === 'array' ? 'array' : value }
      else props[key] = value || {}
    })
    return { type: 'object', properties: props }
  }

  function compactJson(value, max) {
    let text = ''
    try { text = JSON.stringify(value) } catch (_) { text = String(value) }
    max = max || 6000
    return text.length > max ? text.slice(0, max) + '...' : text
  }

  function compactContextRef(ref) {
    if (!ref || typeof ref !== 'object') return ref
    const out = {}
    const keys = ['resolver', 'uri', 'kind', 'title', 'summary', 'meta', 'capabilities', 'tools']
    for (let i = 0; i < keys.length; i++) {
      if (ref[keys[i]] != null) out[keys[i]] = ref[keys[i]]
    }
    return out
  }

  function compactRuntimeContextValue(value) {
    if (value == null) return null
    if (Array.isArray(value)) return value.map(compactRuntimeContextValue)
    if (typeof value !== 'object') return value
    const out = compactContextRef(value)
    if (value.selection != null) out.selection = value.selection
    if (value.refs != null) out.refs = value.refs.map(compactContextRef)
    if (Object.keys(out).length) return out
    return { value: compactJson(value, 1200) }
  }

  function runtimeContextMessage(ctx) {
    const context = ctx && ctx.context || []
    const items = []
    for (let i = 0; i < context.length; i++) {
      const item = context[i] || {}
      const value = compactRuntimeContextValue(item.value)
      if (value == null) continue
      items.push({ id: item.id || '', value: value })
    }
    if (!items.length) return null
    return {
      id: 'system-runtime-context-' + Date.now().toString(36),
      from: 'system',
      role: 'system',
      status: 'done',
      content: [
        'Current editor runtime context.',
        'Use this to resolve phrases like "current table", "selected rows", "selected nodes", or "active editor".',
        'This is a navigation summary, not full data. Before modifying data, call the relevant tools to read schemas/entities.',
        compactJson(items, 6000),
      ].join('\n'),
    }
  }

  function requestWithRuntimeContext(request, ctx) {
    const message = runtimeContextMessage(ctx)
    if (!message) return request
    const messages = request.messages || []
    let insertAt = 0
    while (insertAt < messages.length && messages[insertAt] && messages[insertAt].role === 'system') insertAt++
    return Object.assign({}, request, {
      messages: messages.slice(0, insertAt).concat([message], messages.slice(insertAt)),
    })
  }

  function toolName(id) {
    return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '__').slice(0, 64)
  }

  function toolIdFromName(name, request) {
    const specs = request.toolSpecs || []
    for (let i = 0; i < specs.length; i++) {
      if (toolName(specs[i].id) === name || specs[i].id === name) return specs[i].id
    }
    return name
  }

  function openAiTools(request) {
    const specs = request.toolSpecs || []
    return specs.map(function (tool) {
      return {
        type: 'function',
        function: {
          name: toolName(tool.id),
          description: tool.description || tool.title || tool.id,
          parameters: jsonSchema(tool.schema),
        },
      }
    })
  }

  function parseJsonArg(text) {
    try { return text ? JSON.parse(text) : {} } catch (_) { return { value: text } }
  }

  function normalizeOpenAiToolCalls(calls, request) {
    return (calls || []).map(function (call) {
      const fn = call.function || {}
      const id = toolIdFromName(fn.name || call.name || call.toolId || call.id, request)
      return {
        id: call.id || null,
        toolId: id,
        name: id,
        args: call.args || parseJsonArg(fn.arguments || call.arguments || ''),
      }
    })
  }

  function openAiMessages(messages, request) {
    const outMessages = (messages || []).map(function (m) {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: m.toolCallId || (m.meta && m.meta.toolCallId) || m.id,
          content: messageText(m.content),
        }
      }
      const out = { role: m.role || 'user', content: messageText(m.content) }
      const calls = m.toolCalls || []
      if (calls.length) {
        const reasoning = m.reasoning_content != null ? m.reasoning_content : m.reasoningContent
        if (reasoning && isDeepSeekRequest(request)) out.reasoning_content = reasoning
        out.tool_calls = calls.map(function (call) {
          return {
            id: call.providerCallId || call.id,
            type: 'function',
            function: {
              name: toolName(call.toolId || call.name),
              arguments: JSON.stringify(call.args || {}),
            },
          }
        })
      }
      return out
    })
    const images = imageResources(request || {})
    if (!images.length) return outMessages
    for (let i = outMessages.length - 1; i >= 0; i--) {
      if (outMessages[i].role !== 'user') continue
      const text = messageText(outMessages[i].content)
      const content = []
      if (text) content.push({ type: 'text', text: text })
      for (let j = 0; j < images.length; j++) {
        content.push({ type: 'image_url', image_url: { url: images[j].url } })
      }
      outMessages[i] = Object.assign({}, outMessages[i], { content: content })
      return outMessages
    }
    return outMessages
  }

  function isDeepSeekRequest(request) {
    return String((request && (request.connectionName || request.connection || request.provider)) || '').toLowerCase() === 'deepseek'
      || String(request && request.model || '').toLowerCase().indexOf('deepseek') >= 0
  }

  function anthropicPayloadMessages(messages, request) {
    const out = []
    const images = imageResources(request || {})
    let imagesAttached = false
    for (let i = 0; i < (messages || []).length; i++) {
      const m = messages[i]
      if (m.role === 'system') continue
      const role = m.role === 'assistant' ? 'assistant' : 'user'
      let content = messageText(m.content)
      if (role === 'user' && images.length && !imagesAttached) {
        const blocks = []
        if (content) blocks.push({ type: 'text', text: content })
        for (let j = 0; j < images.length; j++) {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: images[j].mediaType,
              data: images[j].base64,
            },
          })
        }
        out.push({ role: role, content: blocks })
        imagesAttached = true
        continue
      }
      out.push({
        role: role,
        content: content,
      })
    }
    return out
  }

  function anthropicSystem(messages) {
    const parts = []
    for (let i = 0; i < (messages || []).length; i++) {
      if (messages[i].role === 'system') parts.push(messageText(messages[i].content))
    }
    return parts.join('\n\n')
  }

  function textToolProtocol(request) {
    const tools = request.toolSpecs || []
    if (!tools.length) return ''
    const compact = tools.map(function (tool) {
      return {
        id: tool.id,
        title: tool.title || tool.id,
        description: tool.description || '',
        schema: tool.schema || null,
      }
    })
    return [
      'SYSTEM: You are running inside EditorFrame. Some user requests require changing editor state.',
      'If a user asks you to create, delete, rename, move, reparent, send to, or inspect an EditorFrame agent/group/resource, you MUST request the matching EditorFrame tool.',
      'Do not merely say you will do it. The host cannot act unless you emit an ef_tool_calls JSON block.',
      'Complete the user request end-to-end. For delegated work, prefer toolId "agent.delegate" because it creates/reuses an agent and sends the task in one workflow.',
      'If you use agent.create separately for a delegated task, do not stop after agent.create; continue with agent.send, then quest.read/message.read when the quest completes.',
      'If a tool result gives you a questId, do not poll quest.result immediately. Child completion is delivered later as an inbox notification; then use quest.result for completed events in that batch.',
      'A reply that emits agent.delegate or agent.send is an action turn. Do not include final user-visible answer content in the same reply as those tool calls.',
      'If you need a tool, end your reply with exactly one JSON code block using this shape:',
      '```json',
      '{"ef_tool_calls":[{"toolId":"agent.create","args":{"name":"poet","parentAgentId":"' + ((request.agent && request.agent.id) || '') + '","systemPrompt":"Write concise poems."}}]}',
      '```',
      'For "create an agent" or "create a child agent" with no work, use toolId "agent.create".',
      'For "create an agent and have it do work", use toolId "agent.delegate".',
      'For "message another agent", use toolId "agent.send".',
      'For "get delegated agent result", prefer toolId "quest.result".',
      'For normal conversation that does not change editor state, answer normally and do not emit ef_tool_calls.',
      'Do not claim that a tool was executed unless you emit an ef_tool_calls block. The host UI will preview/apply tools after your reply.',
      'CURRENT_AGENT_ID: ' + ((request.agent && request.agent.id) || ''),
      'CURRENT_AGENT_NAME: ' + ((request.agent && request.agent.name) || ''),
      'CURRENT_PARENT_AGENT_ID: ' + ((request.agent && request.agent.parentAgentId) || ''),
      'AVAILABLE_TOOLS: ' + JSON.stringify(compact),
    ].join('\n')
  }

  function transcriptText(request) {
    const messages = request.messages || []
    const out = []
    const toolText = textToolProtocol(request)
    if (toolText) out.push(toolText)
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] || {}
      if (msg.status === 'running') continue
      const text = messageText(msg.content != null ? msg.content : msg.text).trim()
      if (!text) continue
      out.push(String(msg.role || msg.from || 'message').toUpperCase() + ': ' + text)
    }
    return out.join('\n\n')
  }

  function imageInputItems(request) {
    const refs = request.resourceRefs || []
    const payloads = request.resources || request.resolvedResources || []
    const out = []
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i] || {}
      const payload = payloads[i] || {}
      const kind = String(ref.kind || payload.kind || '')
      if (payload.path && kind.indexOf('image') >= 0) out.push({ type: 'localImage', path: payload.path })
      else if (payload.url && kind.indexOf('image') >= 0) out.push({ type: 'image', url: payload.url })
      else if (payload.dataUrl && kind.indexOf('image') >= 0) out.push({ type: 'image', url: payload.dataUrl })
    }
    return out
  }

  function encodeTextToolRequest(request) {
    const inputItems = []
    const text = transcriptText(request)
    if (text) inputItems.push({ type: 'text', text: text })
    return Object.assign({}, request, {
      inputItems: inputItems.concat(imageInputItems(request)),
    })
  }

  function parseTextToolCalls(text) {
    const source = String(text || '')
    const calls = []
    const re = /```(?:json)?\s*([\s\S]*?)```/gi
    let cleaned = source
    let match
    while ((match = re.exec(source))) {
      const raw = match[1].trim()
      let data = null
      try { data = JSON.parse(raw) } catch (_) { continue }
      const list = data && (data.ef_tool_calls || data.toolCalls || data.tool_calls)
      if (!Array.isArray(list)) continue
      for (let i = 0; i < list.length; i++) {
        const item = list[i] || {}
        calls.push({
          toolId: item.toolId || item.name || item.tool || '',
          name: item.toolId || item.name || item.tool || '',
          args: item.args || item.arguments || {},
        })
      }
      cleaned = cleaned.replace(match[0], '').trim()
    }
    const rawRe = /(^|\n)\s*(\{[^\n]*"ef_tool_calls"[^\n]*\})\s*(?=\n|$)/g
    while ((match = rawRe.exec(cleaned))) {
      const raw = match[2].trim()
      let data = null
      try { data = JSON.parse(raw) } catch (_) { continue }
      const list = data && (data.ef_tool_calls || data.toolCalls || data.tool_calls)
      if (!Array.isArray(list)) continue
      for (let i = 0; i < list.length; i++) {
        const item = list[i] || {}
        calls.push({
          toolId: item.toolId || item.name || item.tool || '',
          name: item.toolId || item.name || item.tool || '',
          args: item.args || item.arguments || {},
        })
      }
      cleaned = cleaned.replace(raw, '').trim()
    }
    return { content: calls.length ? cleaned : (cleaned || source), toolCalls: calls }
  }

  function decodeTextToolResponse(result) {
    const message = result && result.message ? result.message : result
    if (typeof message === 'string') {
      const parsed = parseTextToolCalls(message)
      return { role: 'assistant', content: parsed.content, toolCalls: parsed.toolCalls }
    }
    const content = messageText(message && message.content)
    const parsed = parseTextToolCalls(content)
    return Object.assign({}, message || {}, {
      role: (message && message.role) || 'assistant',
      content: parsed.content,
      toolCalls: (message && message.toolCalls && message.toolCalls.length) ? message.toolCalls : parsed.toolCalls,
    })
  }

  ai.messageText = ai.messageText || messageText
  ai.requestWithRuntimeContext = requestWithRuntimeContext
  ai.openAiTools = openAiTools
  ai.openAiMessages = openAiMessages
  ai.normalizeOpenAiToolCalls = normalizeOpenAiToolCalls
  ai.anthropicPayloadMessages = anthropicPayloadMessages
  ai.anthropicSystem = anthropicSystem
  ai.encodeTextToolRequest = encodeTextToolRequest
  ai.decodeTextToolResponse = decodeTextToolResponse
})(window.EF = window.EF || {})
