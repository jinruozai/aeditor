// EF.ai target protocol - stable editor object references for AI context.
;(function (EF) {
  'use strict'

  const ai = EF.ai = EF.ai || {}
  const providers = {}
  const TARGET_MIME = 'application/x-ef-ai-target'
  const TARGET_LIST_MIME = 'application/x-ef-ai-target-list'

  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v))
  }

  function inferResolver(uri, kind) {
    const text = String(uri || '')
    const idx = text.indexOf('://')
    if (idx > 0) return text.slice(0, idx)
    const dot = String(kind || '').indexOf('.')
    return dot > 0 ? String(kind).slice(0, dot) : (kind || 'target')
  }

  function normalizeTarget(target) {
    if (!target) return null
    if (typeof target === 'string') target = { uri: target }
    const uri = String(target.uri || target.id || '')
    if (!uri) return null
    const kind = target.kind || target.type || inferResolver(uri, target.kind)
    return {
      resolver: target.resolver || inferResolver(uri, kind),
      uri: uri,
      kind: kind,
      title: target.title || target.label || uri,
      summary: target.summary || '',
      meta: clone(target.meta || {}),
      capabilities: clone(target.capabilities || []),
      tools: clone(target.tools || []),
    }
  }

  function normalizeTargets(value) {
    if (!value) return []
    const list = Array.isArray(value) ? value : [value]
    const out = []
    for (let i = 0; i < list.length; i++) {
      const target = normalizeTarget(list[i])
      if (target) out.push(target)
    }
    return out
  }

  function registerTargetProvider(name, provider) {
    providers[name] = Object.assign({ id: name }, provider || {})
    return providers[name]
  }

  function getTargetProvider(name) {
    return providers[name] || null
  }

  function listTargetProviders() {
    return Object.keys(providers)
  }

  function captureTarget(source, ctx) {
    if (source && source.uri) return normalizeTarget(source)
    const names = Object.keys(providers)
    for (let i = 0; i < names.length; i++) {
      const provider = providers[names[i]]
      if (provider.match && !provider.match(source, ctx || {})) continue
      if (!provider.capture) continue
      const captured = provider.capture(source, ctx || {})
      const targets = normalizeTargets(captured)
      if (targets.length) return targets.length === 1 ? targets[0] : targets
    }
    return null
  }

  function findResource(target) {
    const list = ai.resources && ai.resources.peek ? ai.resources.peek() : []
    for (let i = 0; i < list.length; i++) {
      if (list[i].resolver === target.resolver && list[i].uri === target.uri) return list[i]
    }
    return null
  }

  function addTarget(target) {
    const normalized = normalizeTarget(target)
    if (!normalized) return null
    const existing = findResource(normalized)
    return existing || ai.addResource(normalized)
  }

  function attachTargetToAgent(agentId, target) {
    const agent = agentId ? ai.findAgent(agentId) : ai.getActiveAgent()
    const stored = addTarget(target)
    if (!agent || !stored) return null
    const refs = (agent.contextRefs || []).slice()
    if (refs.indexOf(stored.id) < 0) refs.push(stored.id)
    return ai.updateAgent(agent.id, { contextRefs: refs })
  }

  function attachTargetsToAgent(agentId, targets) {
    const agent = agentId ? ai.findAgent(agentId) : ai.getActiveAgent()
    if (!agent) return null
    const refs = (agent.contextRefs || []).slice()
    const list = normalizeTargets(targets)
    for (let i = 0; i < list.length; i++) {
      const stored = addTarget(list[i])
      if (stored && refs.indexOf(stored.id) < 0) refs.push(stored.id)
    }
    return ai.updateAgent(agent.id, { contextRefs: refs })
  }

  function resolveTarget(targetOrFn, ev) {
    const value = typeof targetOrFn === 'function' ? targetOrFn(ev) : targetOrFn
    return normalizeTargets(value)
  }

  function writeDragData(ev, targets) {
    const list = normalizeTargets(targets)
    if (!list.length || !ev.dataTransfer) return false
    ev.dataTransfer.effectAllowed = 'copy'
    ev.dataTransfer.setData(TARGET_LIST_MIME, JSON.stringify(list))
    ev.dataTransfer.setData(TARGET_MIME, JSON.stringify(list[0]))
    ev.dataTransfer.setData('text/plain', list.map(function (t) { return t.title || t.uri }).join('\n'))
    return true
  }

  function readTargetFromDragEvent(ev) {
    const dt = ev && ev.dataTransfer
    if (!dt) return []
    const rawList = dt.getData(TARGET_LIST_MIME)
    const rawOne = dt.getData(TARGET_MIME)
    try {
      if (rawList) return normalizeTargets(JSON.parse(rawList))
      if (rawOne) return normalizeTargets(JSON.parse(rawOne))
    } catch (_) {}
    return []
  }

  function hasTargetDrag(ev) {
    const types = ev && ev.dataTransfer && ev.dataTransfer.types
    if (!types) return false
    for (let i = 0; i < types.length; i++) {
      if (types[i] === TARGET_MIME || types[i] === TARGET_LIST_MIME) return true
    }
    return false
  }

  function addCleanup(el, fn) {
    el.__efCleanups = el.__efCleanups || []
    el.__efCleanups.push(fn)
  }

  function bindTarget(el, targetOrFn, opts) {
    opts = opts || {}
    if (opts.draggable !== false) el.draggable = true
    el.dataset.efAiTarget = '1'
    const onDragStart = function (ev) {
      const targets = resolveTarget(targetOrFn, ev)
      if (!writeDragData(ev, targets)) ev.preventDefault()
    }
    el.addEventListener('dragstart', onDragStart)
    addCleanup(el, function () { el.removeEventListener('dragstart', onDragStart) })

    if (opts.contextMenu) {
      const onContext = function (ev) {
        const targets = resolveTarget(targetOrFn, ev)
        if (!targets.length || !EF.ui || !EF.ui.contextMenu) return
        ev.preventDefault()
        EF.ui.contextMenu({ x: ev.clientX, y: ev.clientY }, [
          {
            label: 'Attach to AI',
            icon: 'plus',
            onSelect: function () { attachTargetsToAgent(null, targets) },
          },
          {
            label: 'Ask AI',
            icon: 'message-circle',
            onSelect: function () {
              attachTargetsToAgent(null, targets)
              if (ai.sendMessage) ai.sendMessage(null, 'Inspect the attached target(s).', 'user')
            },
          },
        ])
      }
      el.addEventListener('contextmenu', onContext)
      addCleanup(el, function () { el.removeEventListener('contextmenu', onContext) })
    }

    return el
  }

  function installTargetDrop(el, opts) {
    opts = opts || {}
    const onDragOver = function (ev) {
      if (!hasTargetDrag(ev)) return
      ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
      el.classList.add('ef-ai-target-drop-active')
    }
    const onDragLeave = function (ev) {
      if (ev.currentTarget === el) el.classList.remove('ef-ai-target-drop-active')
    }
    const onDrop = function (ev) {
      const targets = readTargetFromDragEvent(ev)
      if (!targets.length) return
      ev.preventDefault()
      el.classList.remove('ef-ai-target-drop-active')
      if (opts.onDrop) opts.onDrop(targets, ev)
      else attachTargetsToAgent(null, targets)
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    addCleanup(el, function () {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    })
    return el
  }

  ai.registerTargetProvider = registerTargetProvider
  ai.getTargetProvider = getTargetProvider
  ai.listTargetProviders = listTargetProviders
  ai.captureTarget = captureTarget
  ai.normalizeTarget = normalizeTarget
  ai.addTarget = addTarget
  ai.attachTargetToAgent = attachTargetToAgent
  ai.attachTargetsToAgent = attachTargetsToAgent
  ai.bindTarget = bindTarget
  ai.installTargetDrop = installTargetDrop
  ai.readTargetFromDragEvent = readTargetFromDragEvent
  ai.writeTargetDragData = writeDragData
})(window.EF = window.EF || {})
