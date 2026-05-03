// EF.ai provider registry and built-in provider adapters.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const providers = {}
  const providerMeta = {}
  const providersSig = EF.signal([])
  const modelsSig = EF.signal({})

  function registerProvider(name, provider) {
    providers[name] = provider
    providerMeta[name] = {
      id: name,
      label: provider.label || provider.name || name,
      kind: provider.kind || name,
      modelHints: provider.modelHints || [],
    }
    providersSig.set(providerOptions())
    if (!ai.defaultProvider) ai.defaultProvider = name
    if (EF.settings && provider && provider.settings) {
      EF.settings.registerSchema('ai', provider.settings)
    }
    return provider
  }

  function getProvider(name) {
    return providers[name || ai.defaultProvider]
  }

  function listProviders() {
    return Object.keys(providers)
  }

  function providerOptions() {
    return Object.keys(providers).map(function (id) {
      return Object.assign({}, providerMeta[id])
    })
  }

  function modelHints(name) {
    const meta = providerMeta[name || ai.defaultProvider]
    return meta ? (meta.modelHints || []) : []
  }

  function setDefaultProvider(name) {
    ai.defaultProvider = name
    return getProvider(name)
  }

  function refreshModels(name, config) {
    const providerName = name || ai.defaultProvider
    const provider = getProvider(providerName)
    if (!provider || !provider.models) return null
    return Promise.resolve(provider.models(readProviderConfig(providerName, config || {}))).then(function (models) {
      const next = Object.assign({}, modelsSig.peek())
      next[providerName] = normalizeModels(models || [])
      modelsSig.set(next)
      return next[providerName]
    })
  }

  function readProviderConfig(name, overrides) {
    const provider = getProvider(name)
    const defaults = (provider && provider.configDefaults) || {}
    const out = Object.assign({}, defaults)
    if (EF.settings) {
      Object.keys(defaults).forEach(function (key) {
        const value = EF.settings.get('ai.' + name + '.' + key)
        if (value !== undefined) out[key] = value
      })
    }
    return Object.assign(out, overrides || {})
  }

  function normalizeModels(models) {
    const list = Array.isArray(models) ? models : []
    return list.map(function (item) {
      if (typeof item === 'string') return { id: item, value: item, label: item }
      const id = item.id || item.value || item.name || item.model
      return Object.assign({}, item, { id: id, value: id, label: item.label || item.name || id })
    })
  }

  function providerSettings(name, label, defaults, order) {
    return [
      {
        key: 'ai.' + name + '.baseUrl',
        label: label + ' Base URL',
        type: 'string',
        default: defaults.baseUrl,
        description: 'HTTP base URL for the ' + label + ' adapter.',
        order: order,
      },
      {
        key: 'ai.' + name + '.apiKey',
        label: label + ' API Key',
        type: 'password',
        default: '',
        sensitive: true,
        description: 'API key used by the browser adapter. Prefer Local Bridge for shared deployments.',
        order: order + 1,
      },
      {
        key: 'ai.' + name + '.defaultModel',
        label: label + ' Default Model',
        type: 'string',
        default: defaults.defaultModel,
        description: 'Fallback model when the provider model list has not been loaded.',
        order: order + 2,
      },
      {
        key: 'ai.' + name + '.stream',
        label: label + ' Stream',
        type: 'bool',
        default: !!defaults.stream,
        description: 'Request streaming responses when the provider and runtime path support them.',
        order: order + 3,
      },
    ]
  }

  function trimSlash(s) {
    return String(s || '').replace(/\/+$/, '')
  }

  function joinUrl(base, path) {
    return trimSlash(base) + '/' + String(path || '').replace(/^\/+/, '')
  }

  function authHeaders(config, kind) {
    const headers = { 'Content-Type': 'application/json' }
    if (!config.apiKey) return headers
    if (kind === 'anthropic') headers['x-api-key'] = config.apiKey
    else headers.Authorization = 'Bearer ' + config.apiKey
    return headers
  }

  function requestJson(url, opts) {
    return requestBody(url, opts).then(function (body) {
      return body.text ? JSON.parse(body.text) : null
    })
  }

  function requestBody(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        let data = null
        try { data = text ? JSON.parse(text) : null } catch (_) {}
        if (!res.ok) throw new Error((data && (data.error && (data.error.message || data.error))) || res.statusText || 'Provider request failed')
        return {
          text: text,
          contentType: res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '',
        }
      })
    })
  }

  function requestMaybeStream(url, opts, extractDelta) {
    return fetch(url, opts).then(function (res) {
      const contentType = res.headers && res.headers.get ? (res.headers.get('content-type') || '') : ''
      if (res.ok && contentType.indexOf('text/event-stream') >= 0 && res.body) {
        return { streamed: true, deltas: streamSse(res.body, extractDelta) }
      }
      return res.text().then(function (text) {
        let data = null
        try { data = text ? JSON.parse(text) : null } catch (_) {}
        if (!res.ok) throw new Error((data && (data.error && (data.error.message || data.error))) || res.statusText || 'Provider request failed')
        if (contentType.indexOf('text/event-stream') >= 0 || text.indexOf('data:') === 0) {
          const parsed = parseSse(text, extractDelta)
          return { streamed: true, content: parsed.content, usage: parsed.usage }
        }
        return { streamed: false, data: data }
      })
    })
  }

  async function* streamSse(body, extractDelta) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      buffer += decoder.decode(next.value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.indexOf('data:') !== 0) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        const data = JSON.parse(raw)
        const chunk = extractDelta(data)
        if (chunk || data.usage) yield { text: chunk || '', usage: data.usage || null }
      }
    }
    buffer += decoder.decode()
    if (buffer.indexOf('data:') === 0) {
      const raw = buffer.slice(5).trim()
      if (raw && raw !== '[DONE]') {
        const data = JSON.parse(raw)
        const chunk = extractDelta(data)
        if (chunk || data.usage) yield { text: chunk || '', usage: data.usage || null }
      }
    }
  }

  function parseSse(text, extractDelta) {
    const lines = String(text || '').split(/\r?\n/)
    const parts = []
    let usage = null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.indexOf('data:') !== 0) continue
      const raw = line.slice(5).trim()
      if (!raw || raw === '[DONE]') continue
      const data = JSON.parse(raw)
      if (data.usage) usage = data.usage
      const chunk = extractDelta(data)
      if (chunk) parts.push(chunk)
    }
    return { content: parts.join(''), usage: usage }
  }

  function estimateUsageCost(provider, model, usage) {
    if (provider !== 'deepseek' || !usage) return null
    const m = String(model || '').toLowerCase()
    const rates = m.indexOf('pro') >= 0
      ? { inputHit: 0.145, inputMiss: 1.74, output: 3.48 }
      : { inputHit: 0.028, inputMiss: 0.14, output: 0.28 }
    const hit = Number(usage.prompt_cache_hit_tokens || 0)
    const prompt = Number(usage.prompt_tokens || 0)
    const explicitMiss = Number(usage.prompt_cache_miss_tokens || 0)
    const miss = explicitMiss || Math.max(0, prompt - hit)
    const out = Number(usage.completion_tokens || usage.output_tokens || 0)
    const amount = (hit * rates.inputHit + miss * rates.inputMiss + out * rates.output) / 1000000
    return amount > 0 ? { currency: 'USD', amount: amount } : null
  }

  function messageText(content) {
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
      if (typeof value === 'string') props[key] = { type: value === 'array' ? 'array' : value }
      else props[key] = value || {}
    })
    return { type: 'object', properties: props }
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

  const openAiDefaults = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    defaultModel: '',
    stream: true,
  }

  const anthropicDefaults = {
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    defaultModel: '',
    stream: true,
  }

  const localBridgeDefaults = {
    baseUrl: 'http://127.0.0.1:8787',
    apiKey: '',
    defaultModel: '',
    stream: true,
  }

  function openAiCompatibleProvider(id, label, defaults, order) {
    return {
      label: label,
      kind: 'openai',
      configDefaults: defaults,
      modelHints: defaults.modelHints || [],
      settings: providerSettings(id, label, defaults, order),
      models: function (config) {
        return requestJson(joinUrl(config.baseUrl, '/models'), {
          method: 'GET',
          headers: authHeaders(config, 'openai'),
        }).then(function (data) {
          return normalizeModels((data.data || data.models || []).map(function (item) { return item.id || item.name || item.model || item }))
        })
      },
      send: function (request, ctx) {
        const config = readProviderConfig(id)
        const model = request.model || config.defaultModel
        const tools = openAiTools(request)
        const stream = !!(request.stream && config.stream && !tools.length)
        const body = {
          model: model,
          messages: openAiMessages(request.messages, request),
          stream: stream,
          stream_options: stream ? { include_usage: true } : undefined,
        }
        if (tools.length) {
          body.tools = tools
          body.tool_choice = 'auto'
        }
        return requestMaybeStream(joinUrl(config.baseUrl, '/chat/completions'), {
          method: 'POST',
          headers: authHeaders(config, 'openai'),
          signal: ctx.signal,
          body: JSON.stringify(body),
        }, function (data) {
          const choice = data.choices && data.choices[0]
          const delta = choice && (choice.delta || choice.message)
          return delta ? messageText(delta.content) : ''
        }).then(function (data) {
          if (data.streamed && data.deltas) return { deltas: data.deltas }
          if (data.streamed) return { role: 'assistant', content: data.content, usage: data.usage || null }
          data = data.data
          const choice = data.choices && data.choices[0]
          const message = (choice && choice.message) || {}
          return {
            role: message.role || 'assistant',
            content: messageText(message.content),
            toolCalls: normalizeOpenAiToolCalls(message.tool_calls || message.toolCalls || [], request),
            usage: data.usage || null,
    }
  })
      },
    }
  }

  registerProvider('mock', {
    label: 'Mock',
    settings: [
      {
        key: 'ai.mock.responsePrefix',
        label: 'Response Prefix',
        type: 'string',
        default: 'Echo:',
        description: 'Prefix used by the mock provider.',
        order: 100,
      },
    ],
    send: function (request, ctx) {
      if (ctx.signal && ctx.signal.aborted) throw new Error('aborted')
      const last = request.messages[request.messages.length - 1]
      const text = last && last.content ? last.content : ''
      const prefix = EF.settings ? EF.settings.get('ai.mock.responsePrefix') : 'Echo:'
      return {
        role: 'assistant',
        content: text ? prefix + ' ' + text : 'Mock assistant response.',
      }
    },
  })

  registerProvider('openai-compatible', openAiCompatibleProvider('openai-compatible', 'OpenAI Compatible', openAiDefaults, 120))
  registerProvider('openrouter', openAiCompatibleProvider('openrouter', 'OpenRouter', { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5', 'google/gemini-2.5-pro'] }, 130))
  registerProvider('groq', openAiCompatibleProvider('groq', 'Groq', { baseUrl: 'https://api.groq.com/openai/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'] }, 140))
  registerProvider('mistral', openAiCompatibleProvider('mistral', 'Mistral', { baseUrl: 'https://api.mistral.ai/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['mistral-large-latest', 'mistral-medium-latest', 'codestral-latest'] }, 150))
  registerProvider('xai', openAiCompatibleProvider('xai', 'xAI', { baseUrl: 'https://api.x.ai/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['grok-4', 'grok-code-fast-1'] }, 160))
  registerProvider('deepseek', openAiCompatibleProvider('deepseek', 'DeepSeek', { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['deepseek-v4-flash', 'deepseek-v4-pro'] }, 170))
  registerProvider('ollama', openAiCompatibleProvider('ollama', 'Ollama', { baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', defaultModel: '', stream: true, modelHints: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1'] }, 180))
  registerProvider('custom-openai', openAiCompatibleProvider('custom-openai', 'Custom OpenAI Compatible', { baseUrl: '', apiKey: '', defaultModel: '', stream: true }, 190))

  registerProvider('anthropic-compatible', {
    label: 'Anthropic Compatible',
    kind: 'http',
    configDefaults: anthropicDefaults,
    settings: providerSettings('anthropic-compatible', 'Anthropic Compatible', anthropicDefaults, 140),
    models: function (config) {
      const headers = authHeaders(config, 'anthropic')
      headers['anthropic-version'] = '2023-06-01'
      return requestJson(joinUrl(config.baseUrl, '/v1/models'), {
        method: 'GET',
        headers: headers,
      }).then(function (data) {
        return normalizeModels((data.data || data.models || []).map(function (item) { return item.id || item.name }))
      })
    },
    send: function (request, ctx) {
      const config = readProviderConfig('anthropic-compatible')
      const headers = authHeaders(config, 'anthropic')
      const system = anthropicSystem(request.messages)
      const body = {
        model: request.model || config.defaultModel,
        messages: anthropicPayloadMessages(request.messages, request),
        max_tokens: 4096,
        stream: !!(request.stream && config.stream),
      }
      headers['anthropic-version'] = '2023-06-01'
      if (system) body.system = system
      return requestMaybeStream(joinUrl(config.baseUrl, '/v1/messages'), {
        method: 'POST',
        headers: headers,
        signal: ctx.signal,
        body: JSON.stringify(body),
      }, function (data) {
        if (data.type === 'content_block_delta' && data.delta) return data.delta.text || ''
        if (data.type === 'content_block_start' && data.content_block) return data.content_block.text || ''
        return ''
      }).then(function (data) {
        if (data.streamed && data.deltas) return { deltas: data.deltas }
        if (data.streamed) return { role: 'assistant', content: data.content, usage: data.usage || null }
        data = data.data
        const chunks = data.content || []
        return {
          role: 'assistant',
          content: chunks.map(function (item) { return item.text || '' }).join(''),
          toolCalls: data.tool_calls || data.toolCalls || [],
          usage: data.usage || null,
        }
      })
    },
  })

  registerProvider('local-bridge', {
    label: 'Local Bridge',
    kind: 'bridge',
    configDefaults: localBridgeDefaults,
    settings: providerSettings('local-bridge', 'Local Bridge', localBridgeDefaults, 160),
    models: function (config) {
      return requestJson(joinUrl(config.baseUrl, '/models'), {
        method: 'GET',
        headers: authHeaders(config, 'openai'),
      }).then(function (data) {
        return normalizeModels(data.models || data.data || [])
      })
    },
    send: function (request, ctx) {
      const config = readProviderConfig('local-bridge')
      return requestMaybeStream(joinUrl(config.baseUrl, '/chat'), {
        method: 'POST',
        headers: authHeaders(config, 'openai'),
        signal: ctx.signal,
        body: JSON.stringify(Object.assign({}, request, {
          model: request.model || config.defaultModel,
          stream: !!(request.stream && config.stream),
        })),
      }, function (data) {
        if (data.delta) return messageText(data.delta)
        if (data.content) return messageText(data.content)
        return ''
      }).then(function (data) {
        if (data.streamed && data.deltas) return { deltas: data.deltas }
        if (data.streamed) return { role: 'assistant', content: data.content, usage: data.usage || null }
        data = data.data
        if (typeof data === 'string') return { role: 'assistant', content: data }
        return data.message || data.result || data
      })
    },
  })

  ai.defaultProvider = 'mock'

  ai.providers = providersSig
  ai.models = modelsSig
  ai.registerProvider = registerProvider
  ai.getProvider = getProvider
  ai.listProviders = listProviders
  ai.providerOptions = providerOptions
  ai.modelHints = modelHints
  ai.setDefaultProvider = setDefaultProvider
  ai.refreshModels = refreshModels
  ai.getProviderConfig = readProviderConfig
  ai.estimateUsageCost = estimateUsageCost
})(window.EF = window.EF || {})
