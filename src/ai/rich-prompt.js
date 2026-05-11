// aeditor.ai rich prompt draft helpers.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  const START = 0xE000
  const END = 0xF8FF

  function isTokenChar(ch) {
    if (!ch || ch.length !== 1) return false
    const code = ch.charCodeAt(0)
    return code >= START && code <= END
  }

  function cloneToken(token) {
    return Object.assign({}, token || {})
  }

  function empty() {
    return { text: '', tokens: {} }
  }

  function normalize(draft) {
    const src = draft || empty()
    const srcText = String(src.text || '').replace(/\r\n?/g, '\n')
    const srcTokens = src.tokens || {}
    let text = ''
    const tokens = {}
    for (let i = 0; i < srcText.length; i++) {
      const ch = srcText[i]
      if (isTokenChar(ch)) {
        if (srcTokens[ch]) {
          text += ch
          tokens[ch] = cloneToken(srcTokens[ch])
        }
        continue
      }
      const code = ch.charCodeAt(0)
      if (code < 32 && ch !== '\n' && ch !== '\t') continue
      text += ch
    }
    return { text: text, tokens: tokens }
  }

  function allocateToken(draft) {
    const d = normalize(draft)
    for (let code = START; code <= END; code++) {
      const ch = String.fromCharCode(code)
      if (d.text.indexOf(ch) < 0 && !d.tokens[ch]) return ch
    }
    return ''
  }

  function clampIndex(text, index) {
    index = Number(index || 0)
    if (index < 0) return 0
    if (index > text.length) return text.length
    return index
  }

  function insertText(draft, index, text) {
    const d = normalize(draft)
    const at = clampIndex(d.text, index)
    const clean = normalize({ text: text, tokens: {} }).text
    return normalize({
      text: d.text.slice(0, at) + clean + d.text.slice(at),
      tokens: d.tokens,
    })
  }

  function tokenFromResource(resource) {
    return {
      type: 'ref',
      resourceId: resource.id || resource.resourceId || '',
      label: resource.label || resource.title || resource.name || resource.uri || resource.id || 'Resource',
      kind: resource.kind || resource.resolver || 'ref',
      uri: resource.uri || '',
      title: resource.title || resource.label || '',
      meta: resource.meta || {},
    }
  }

  function insertRef(draft, index, resource) {
    const d = normalize(draft)
    const token = allocateToken(d)
    if (!token) return d
    const at = clampIndex(d.text, index)
    const tokens = Object.assign({}, d.tokens)
    tokens[token] = tokenFromResource(resource || {})
    return normalize({
      text: d.text.slice(0, at) + token + d.text.slice(at),
      tokens: tokens,
    })
  }

  function insertRefs(draft, index, resources) {
    let d = normalize(draft)
    let at = clampIndex(d.text, index)
    for (let i = 0; i < (resources || []).length; i++) {
      d = insertRef(d, at, resources[i])
      at++
      if (i < resources.length - 1) {
        d = insertText(d, at, ' ')
        at++
      }
    }
    return d
  }

  function deleteRange(draft, start, end) {
    const d = normalize(draft)
    const a = clampIndex(d.text, Math.min(start, end))
    const b = clampIndex(d.text, Math.max(start, end))
    return normalize({
      text: d.text.slice(0, a) + d.text.slice(b),
      tokens: d.tokens,
    })
  }

  function slice(draft, start, end) {
    const d = normalize(draft)
    const a = clampIndex(d.text, Math.min(start, end))
    const b = clampIndex(d.text, Math.max(start, end))
    const text = d.text.slice(a, b)
    const tokens = {}
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (d.tokens[ch]) tokens[ch] = cloneToken(d.tokens[ch])
    }
    return normalize({ text: text, tokens: tokens })
  }

  function insertDraft(draft, index, fragment) {
    const d = normalize(draft)
    const f = normalize(fragment)
    const at = clampIndex(d.text, index)
    const tokens = Object.assign({}, d.tokens)
    let inserted = ''
    for (let i = 0; i < f.text.length; i++) {
      const ch = f.text[i]
      const token = f.tokens[ch]
      if (!token) {
        inserted += ch
        continue
      }
      const nextToken = allocateToken({ text: d.text + inserted, tokens: tokens })
      if (!nextToken) continue
      tokens[nextToken] = cloneToken(token)
      inserted += nextToken
    }
    return normalize({
      text: d.text.slice(0, at) + inserted + d.text.slice(at),
      tokens: tokens,
    })
  }

  function refs(draft) {
    const d = normalize(draft)
    const out = []
    const seen = {}
    for (let i = 0; i < d.text.length; i++) {
      const ch = d.text[i]
      const token = d.tokens[ch]
      if (!token || !token.resourceId || seen[token.resourceId]) continue
      seen[token.resourceId] = true
      out.push(token.resourceId)
    }
    return out
  }

  function visibleLength(draft) {
    const d = normalize(draft)
    return toPlainText(d).trim().length
  }

  function toPlainText(draft) {
    const d = normalize(draft)
    let out = ''
    for (let i = 0; i < d.text.length; i++) {
      const ch = d.text[i]
      const token = d.tokens[ch]
      out += token ? '[' + (token.label || token.resourceId || 'Resource') + ']' : ch
    }
    return out
  }

  function toModelText(draft) {
    const d = normalize(draft)
    let out = ''
    for (let i = 0; i < d.text.length; i++) {
      const ch = d.text[i]
      const token = d.tokens[ch]
      if (!token) {
        out += ch
        continue
      }
      const label = String(token.label || token.resourceId || 'Resource').replace(/\]/g, '\\]')
      const id = String(token.resourceId || '').replace(/\)/g, '')
      out += '[' + label + '](ref:' + id + ')'
    }
    return out
  }

  function isEmpty(draft) {
    return visibleLength(draft) === 0
  }

  function content(draft) {
    const d = normalize(draft)
    return {
      type: 'rich-prompt',
      text: d.text,
      tokens: d.tokens,
      renderedText: toModelText(d),
    }
  }

  function fromContent(value) {
    if (value && value.type === 'rich-prompt') return normalize(value)
    return normalize({ text: value == null ? '' : String(value), tokens: {} })
  }

  ai.richPrompt = {
    empty: empty,
    normalize: normalize,
    allocateToken: allocateToken,
    insertText: insertText,
    insertRef: insertRef,
    insertRefs: insertRefs,
    insertDraft: insertDraft,
    deleteRange: deleteRange,
    slice: slice,
    refs: refs,
    visibleLength: visibleLength,
    toPlainText: toPlainText,
    toModelText: toModelText,
    isEmpty: isEmpty,
    content: content,
    fromContent: fromContent,
    isTokenChar: isTokenChar,
  }
})(window.aeditor = window.aeditor || {})
