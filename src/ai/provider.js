// EF.ai provider shared helpers.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}

  function normalizeModels(models) {
    const list = Array.isArray(models) ? models : []
    return list.map(function (item) {
      if (typeof item === 'string') return { id: item, value: item, label: item }
      const id = item.id || item.value || item.name || item.model
      return Object.assign({}, item, { id: id, value: id, label: item.label || item.name || id })
    })
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

  function requestJson(url, opts) {
    return requestBody(url, opts).then(function (body) {
      return body.text ? JSON.parse(body.text) : null
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

  ai.provider = {
    normalizeModels: normalizeModels,
    joinUrl: joinUrl,
    authHeaders: authHeaders,
    requestJson: requestJson,
    requestMaybeStream: requestMaybeStream,
  }
  ai.estimateUsageCost = estimateUsageCost
})(window.EF = window.EF || {})
