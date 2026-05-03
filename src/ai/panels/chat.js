;(function (EF) {
  'use strict'

  const ui = EF.ui

  const MODE_OPTIONS = [
    { value: 'chat', label: 'Chat' },
    { value: 'goal', label: 'Goal' },
  ]

  const PERMISSION_OPTIONS = [
    { value: 'default', label: 'Default permissions', icon: 'settings' },
    { value: 'auto', label: 'Auto review', icon: 'clock' },
    { value: 'full', label: 'Full access', icon: 'alert-circle' },
    { value: 'custom', label: 'Custom', icon: 'sliders' },
  ]

  function read(v) {
    return ui.isSignal(v) ? v() : v
  }

  function readList(v) {
    return read(v) || []
  }

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function clearChildren(el) {
    while (el.firstChild) disposeTree(el.firstChild)
  }

  function optionsFrom(items) {
    const list = readList(items)
    const out = []
    for (let i = 0; i < list.length; i++) {
      const it = list[i]
      out.push(typeof it === 'string'
        ? { value: it, label: it }
        : { value: it.id || it.value || it.name, label: it.label || it.name || it.id || it.value })
    }
    return out
  }

  function pushOption(out, item) {
    const value = typeof item === 'string' ? item : (item.id || item.value || item.name || item.model)
    if (!value) return
    for (let i = 0; i < out.length; i++) if (out[i].value === value) return
    out.push(typeof item === 'string'
      ? { value: value, label: value }
      : { value: value, label: item.label || item.name || value })
  }

  function providerOptions() {
    if (EF.ai.providerOptions) return optionsFrom(EF.ai.providerOptions())
    return EF.ai.providers ? optionsFrom(EF.ai.providers) : optionsFrom(EF.ai.listProviders())
  }

  function defaultProvider() {
    if (EF.settings) return EF.settings.get('ai.defaultProvider') || EF.ai.defaultProvider || 'mock'
    return EF.ai.defaultProvider || 'mock'
  }

  function providerConfig(provider) {
    return EF.ai.getProviderConfig ? EF.ai.getProviderConfig(provider || defaultProvider()) : {}
  }

  function defaultModel(provider) {
    return providerConfig(provider).defaultModel || ''
  }

  function modelOptions(provider, config) {
    const o = config || {}
    const out = []
    const hints = (!o.loadedOnly && EF.ai.modelHints) ? EF.ai.modelHints(provider) : []
    for (let h = 0; h < hints.length; h++) pushOption(out, hints[h])
    const providers = EF.ai.providers ? readList(EF.ai.providers) : []
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i]
      if (typeof p !== 'string' && (p.id === provider || p.name === provider || p.value === provider)) {
        const metaModels = p.models || []
        for (let m = 0; m < metaModels.length; m++) pushOption(out, metaModels[m])
      }
    }
    const models = EF.ai.models ? (read(EF.ai.models) || []) : []
    const loaded = (Array.isArray(models) ? models : models[provider]) || []
    for (let j = 0; j < loaded.length; j++) pushOption(out, loaded[j])
    const fallback = defaultModel(provider)
    if (fallback) pushOption(out, fallback)
    return out
  }

  function configuredProviderOptions() {
    const providers = providerOptions()
    const out = []
    for (let i = 0; i < providers.length; i++) {
      const p = providers[i]
      const id = p.value || p.id
      if (!id || id === 'mock') continue
      const cfg = providerConfig(id)
      const isLocal = id === 'ollama' || id === 'local-bridge'
      const opts = modelOptions(id, { loadedOnly: isLocal })
      const hasCredential = !!cfg.apiKey
      const hasLocalModels = isLocal && !!(opts && opts.length)
      if (!hasCredential && !hasLocalModels) continue
      if (!opts.length) continue
      out.push({ id: id, label: p.label || p.name || id, models: opts })
    }
    return out
  }

  function modelValue(provider, model) {
    return (provider || '') + '::' + (model || '')
  }

  function parseModelValue(value) {
    const s = String(value || '')
    const idx = s.indexOf('::')
    return idx < 0 ? { provider: defaultProvider(), model: s } : { provider: s.slice(0, idx), model: s.slice(idx + 2) }
  }

  function groupedModelOptions() {
    const groups = configuredProviderOptions()
    const out = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (!g.models.length) continue
      if (out.length) out.push({ type: 'divider' })
      out.push({ type: 'header', label: g.label })
      for (let j = 0; j < g.models.length; j++) {
        const m = g.models[j]
        out.push({
          value: modelValue(g.id, m.value),
          label: m.label || m.value,
          subLabel: g.label,
        })
      }
    }
    return out
  }

  function agents() {
    return readList(EF.ai.agents)
  }

  function resources() {
    return readList(EF.ai.resources)
  }

  function activeAgent() {
    const id = read(EF.ai.activeAgentId)
    const list = agents()
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
    return null
  }

  function updateCurrentAgent(patch) {
    const agent = activeAgent()
    if (agent) EF.ai.updateAgent(agent.id, patch)
  }

  function permissionLabel(value) {
    for (let i = 0; i < PERMISSION_OPTIONS.length; i++) {
      if (PERMISSION_OPTIONS[i].value === value) return PERMISSION_OPTIONS[i].label
    }
    return 'Permissions'
  }

  function resolveRef(ref) {
    const id = typeof ref === 'string' ? ref : (ref.resourceId || ref.id)
    const all = resources()
    for (let i = 0; i < all.length; i++) {
      if (all[i].id === id) return Object.assign({}, all[i], { ref: ref, id: id })
    }
    return typeof ref === 'string' ? { id: ref, title: ref, ref: ref } : Object.assign({ id: id, ref: ref }, ref)
  }

  function refTitle(item) {
    return item.title || item.label || item.name || item.uri || item.id || 'Resource'
  }

  function refKind(item) {
    return item.kind || item.resolver || 'ref'
  }

  function removeContextRef(ref) {
    const agent = activeAgent()
    const id = typeof ref === 'string' ? ref : (ref.resourceId || ref.id)
    const next = (agent.contextRefs || []).filter(function (item) {
      const itemId = typeof item === 'string' ? item : (item.resourceId || item.id)
      return itemId !== id
    })
    EF.ai.updateAgent(agent.id, { contextRefs: next })
  }

  function hasContextRef(agent, ref) {
    const id = typeof ref === 'string' ? ref : (ref.resourceId || ref.id)
    const refs = agent.contextRefs || []
    for (let i = 0; i < refs.length; i++) {
      const itemId = typeof refs[i] === 'string' ? refs[i] : (refs[i].resourceId || refs[i].id)
      if (itemId === id) return true
    }
    return false
  }

  function toggleContextRef(ref) {
    const agent = activeAgent()
    if (hasContextRef(agent, ref)) {
      removeContextRef(ref)
      return
    }
    EF.ai.updateAgent(agent.id, { contextRefs: (agent.contextRefs || []).concat([ref.id]) })
  }

  function openResourceMenu(anchor) {
    const agent = activeAgent()
    const all = resources()
    const items = all.length ? all.map(function (res) {
      return {
        label: refTitle(res),
        icon: hasContextRef(agent, res) ? 'check' : 'plus',
        onSelect: function () { toggleContextRef(res) },
      }
    }) : [{ type: 'header', label: 'No resources available' }]
    ui.menu({ anchor: anchor, items: items, side: 'top', align: 'start' })
  }

  function chipImage(item) {
    const meta = item.meta || {}
    if (item.kind === 'file.image' && meta.dataUrl) return meta.dataUrl
    return ''
  }

  function appendResourceChip(parent, item, opts) {
    opts = opts || {}
    const title = opts.title ? opts.title(item) : refTitle(item)
    const kind = opts.kind ? opts.kind(item) : refKind(item)
    const chip = ui.h('button', 'ef-ai-resource-chip', { type: 'button', title: title })
    const img = chipImage(item)
    if (img) chip.appendChild(ui.h('img', 'ef-ai-resource-thumb', { src: img, alt: '' }))
    else chip.appendChild(ui.h('span', 'ef-ai-resource-kind', { text: kind }))
    chip.appendChild(ui.h('span', 'ef-ai-resource-title', { text: title }))
    chip.appendChild(ui.h('span', 'ef-ai-resource-remove', { text: 'x' }))
    chip.addEventListener('click', function (ev) {
      ev.preventDefault()
      if (opts.remove) opts.remove(item)
    })
    parent.appendChild(chip)
  }

  function renderAllChips(parent, agent, pendingSig) {
    clearChildren(parent)
    parent.classList.remove('ef-ai-resource-chips-visible')
    const refs = agent ? (agent.contextRefs || []) : []
    const pending = pendingSig()
    if ((!agent || !refs.length) && !pending.length) return
    parent.classList.add('ef-ai-resource-chips-visible')
    for (let i = 0; i < refs.length; i++) {
      const item = resolveRef(refs[i])
      appendResourceChip(parent, item, {
        remove: function (res) { removeContextRef(res.ref) },
      })
    }
    for (let j = 0; j < pending.length; j++) {
      const item = pending[j]
      appendResourceChip(parent, item, {
        title: targetTitle,
        kind: targetKind,
        remove: function (target) {
          pendingSig.set(pendingSig.peek().filter(function (item) { return !sameTarget(item, target) }))
        },
      })
    }
  }

  function sameTarget(a, b) {
    return a && b && a.resolver === b.resolver && a.uri === b.uri
  }

  function addPendingTargets(sig, targets) {
    const list = sig.peek().slice()
    const incoming = EF.ai.normalizeTarget ? targets.map(EF.ai.normalizeTarget).filter(Boolean) : targets
    for (let i = 0; i < incoming.length; i++) {
      let exists = false
      for (let j = 0; j < list.length; j++) exists = exists || sameTarget(list[j], incoming[i])
      if (!exists) list.push(incoming[i])
    }
    sig.set(list)
  }

  function targetTitle(item) {
    return item.title || item.label || item.name || item.uri || 'Target'
  }

  function targetKind(item) {
    return item.kind || item.resolver || 'target'
  }

  function openPermissionMenu(anchor, permSig) {
    const items = PERMISSION_OPTIONS.map(function (opt) {
      return {
        label: opt.label,
        icon: opt.icon,
        checked: permSig.peek() === opt.value,
        onSelect: function () {
          permSig.set(opt.value)
          updateCurrentAgent({ permissionMode: opt.value })
        },
      }
    })
    ui.menu({ anchor: anchor, items: items, side: 'top', align: 'start' })
  }

  function factory(propsSig, ctx) {
    const props = propsSig.peek() || {}
    const provider = EF.signal(props.provider || defaultProvider())
    const model = EF.signal(props.model || defaultModel(provider.peek()))
    const mode = EF.signal(props.mode || 'chat')
    const permissionMode = EF.signal(props.permissionMode || 'full')
    const input = EF.signal('')
    const pendingTargets = EF.signal([])
    const hasTarget = EF.derived(function () { return !!activeAgent() })
    const busy = EF.derived(function () {
      const a = activeAgent()
      return !!(a && (a.status === 'running' || a.status === 'queued'))
    })
    const controlDisabled = EF.derived(function () { return !hasTarget() })
    const sendDisabled = EF.derived(function () { return !hasTarget() || (!busy() && !input().trim() && !pendingTargets().length) })
    const sendIcon = EF.derived(function () { return busy() ? 'square' : 'arrow-up' })

    const root = ui.h('div', 'ef-ai-panel ef-ai-chat')
    ui.collect(root, hasTarget.dispose)
    ui.collect(root, busy.dispose)
    ui.collect(root, controlDisabled.dispose)
    ui.collect(root, sendDisabled.dispose)
    ui.collect(root, sendIcon.dispose)

    const composer = ui.h('div', 'ef-ai-composer')
    if (EF.ai.installTargetDrop) {
      EF.ai.installTargetDrop(composer, {
        onDrop: function (targets) { addPendingTargets(pendingTargets, targets) },
      })
    }

    const chips = ui.h('div', 'ef-ai-resource-chips')
    composer.appendChild(chips)

    const editorWrap = ui.h('div', 'ef-ai-chat-input-wrap')
    const editor = ui.textarea({ value: input, rows: 4, placeholder: 'Message current agent...', mono: false, disabled: controlDisabled })
    editor.classList.add('ef-ai-chat-input')
    editor.setAttribute('autocomplete', 'off')
    editor.setAttribute('autocapitalize', 'off')
    editor.setAttribute('spellcheck', 'false')
    editorWrap.appendChild(editor)
    composer.appendChild(editorWrap)

    const nativeEditor = editor.tagName === 'TEXTAREA' ? editor : editor.querySelector('textarea')
    if (nativeEditor) {
      nativeEditor.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' || ev.shiftKey) return
        ev.preventDefault()
        sendClick()
      })
    }

    const actions = ui.h('div', 'ef-ai-chat-actions')
    const leftActions = ui.h('div', 'ef-ai-chat-actions-left')
    const rightActions = ui.h('div', 'ef-ai-chat-actions-right')
    const add = ui.iconButton({
      icon: 'plus',
      title: 'Add context',
      kind: 'ghost',
      disabled: controlDisabled,
      onClick: function (ev) { openResourceMenu(ev.currentTarget) },
    })
    const permissionText = EF.derived(function () { return permissionLabel(permissionMode()) })
    ui.collect(root, permissionText.dispose)
    const permission = ui.button({
      text: permissionText,
      icon: ui.icon({ name: 'alert-circle', size: 'sm' }),
      kind: 'ghost',
      size: 'sm',
      disabled: controlDisabled,
      onClick: function (ev) { openPermissionMenu(ev.currentTarget, permissionMode) },
    })
    const modelSlot = ui.h('div', 'ef-ai-model-control')
    const modeSlot = ui.h('div', 'ef-ai-mode-control')
    const sendTitle = EF.derived(function () { return busy() ? 'Stop' : 'Send' })
    ui.collect(root, sendTitle.dispose)
    const send = ui.iconButton({
      icon: sendIcon,
      title: sendTitle,
      kind: 'primary',
      disabled: sendDisabled,
      onClick: sendClick,
    })
    leftActions.appendChild(add)
    leftActions.appendChild(permission)
    rightActions.appendChild(modelSlot)
    rightActions.appendChild(modeSlot)
    rightActions.appendChild(send)
    actions.appendChild(leftActions)
    actions.appendChild(rightActions)
    composer.appendChild(actions)
    root.appendChild(composer)

    ui.collect(root, EF.effect(function () {
      const opts = providerOptions()
      const preferred = defaultProvider()
      if (opts.length && !provider.peek()) provider.set(preferred || opts[0].value)
    }))

    ui.collect(root, EF.effect(function () {
      const opts = groupedModelOptions()
      const selected = EF.signal(modelValue(provider(), model()))
      disposeTree(modelSlot.firstChild)
      modelSlot.appendChild(ui.select({
        value: selected,
        options: opts,
        placeholder: 'Model',
        variant: 'minimal',
        autoWidth: true,
        disabled: controlDisabled,
        onChange: function (v) {
          const parsed = parseModelValue(v)
          provider.set(parsed.provider)
          model.set(parsed.model)
          updateCurrentAgent({ provider: parsed.provider, model: parsed.model, stream: !!providerConfig(parsed.provider).stream })
        },
      }))
      let found = false
      const current = selected.peek()
      for (let i = 0; i < opts.length; i++) found = found || opts[i].value === current
      if (!found) {
        const first = opts.find(function (it) { return it.value })
        if (first) {
          const parsed = parseModelValue(first.value)
          provider.set(parsed.provider)
          model.set(parsed.model)
          updateCurrentAgent({ provider: parsed.provider, model: parsed.model, stream: !!providerConfig(parsed.provider).stream })
        }
      }
    }))

    ui.collect(root, EF.effect(function () {
      const a = activeAgent()
      if (!a) {
        provider.set(defaultProvider())
        model.set(defaultModel(provider.peek()))
        return
      }
      provider.set(a.provider || defaultProvider())
      model.set(a.model || defaultModel(a.provider || defaultProvider()))
      mode.set(a.mode || 'chat')
      permissionMode.set(a.permissionMode || 'full')
    }))

    ui.collect(root, EF.effect(function () {
      disposeTree(modeSlot.firstChild)
      modeSlot.appendChild(ui.select({
        value: mode,
        options: MODE_OPTIONS,
        placeholder: 'Mode',
        variant: 'minimal',
        autoWidth: true,
        disabled: controlDisabled,
        onChange: function (v) {
          mode.set(v)
          updateCurrentAgent({ mode: v })
        },
      }))
    }))

    ui.collect(root, EF.effect(function () { renderAllChips(chips, activeAgent(), pendingTargets) }))

    return root

    function sendClick() {
      const agent = activeAgent()
      if (!agent) return
      if (busy()) {
        EF.ai.stopAgent(agent.id)
        return
      }
      const targets = pendingTargets.peek()
      const text = input().trim() || (targets.length ? 'Inspect the attached file(s).' : '')
      if (!text) return
      let nextAgent = agent
      if (targets.length && EF.ai.attachTargetsToAgent) {
        nextAgent = EF.ai.attachTargetsToAgent(agent.id, targets) || agent
      }
      EF.ai.updateAgent(agent.id, {
        provider: provider.peek(),
        model: model.peek() || defaultModel(provider.peek()),
        mode: mode.peek(),
        permissionMode: permissionMode.peek(),
        stream: !!providerConfig(provider.peek()).stream,
      })
      const meta = {
        provider: provider.peek(),
        model: model.peek() || defaultModel(provider.peek()),
        mode: mode.peek(),
        permissionMode: permissionMode.peek(),
        targets: targets,
      }
      EF.ai.sendMessage(agent.id, { content: text, contextRefs: nextAgent.contextRefs || [], meta: meta }, 'user')
      pendingTargets.set([])
      input.set('')
      if (nativeEditor) nativeEditor.value = ''
    }
  }

  EF.registerComponent('ai-chatinput', {
    defaults: function () { return { title: 'AI Send', icon: 'message-circle', props: { mode: 'chat' } } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
