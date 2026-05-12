// aeditor.extensions owner-aware extension runtime.
;(function (aeditor) {
  'use strict'

  const extensions = {}
  const layouts = {}
  const adapters = {}
  const DEFAULT_STORAGE_KEY = 'aeditor.extensions.v1'
  let storageKey = DEFAULT_STORAGE_KEY
  let storage = null
  let safeModeEnabled = false
  let safeModeAllowApp = false
  let maxLayer = 'session'
  const disabledLayers = {}
  let permissionPolicy = null

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function keys(obj) { return Object.keys(obj) }

  function ownerFor(id) { return 'extension:' + id }

  const matchesPrefix = aeditor.names.matchesPrefix

  function defaultStorage() {
    try { return window.localStorage || null } catch (_) { return null }
  }

  function publicId(manifestId, localId, explicit) {
    if (explicit) return String(explicit)
    manifestId = String(manifestId)
    localId = String(localId)
    return localId === manifestId || localId.indexOf(manifestId + '.') === 0
      ? localId
      : manifestId + '.' + localId
  }

  function normalizeLayer(layer) {
    layer = layer || 'session'
    if (layer !== 'core' && layer !== 'builtin' && layer !== 'app' && layer !== 'user' && layer !== 'session') {
      throw new Error('Invalid extension layer: ' + layer)
    }
    return layer
  }

  function layerRank(layer) {
    layer = normalizeLayer(layer)
    if (layer === 'builtin' || layer === 'core') return 0
    if (layer === 'app') return 1
    if (layer === 'user') return 2
    return 3
  }

  function canActivateLayer(layer) {
    layer = normalizeLayer(layer)
    if (safeModeEnabled && layerRank(layer) > (safeModeAllowApp ? 1 : 0)) return false
    if (disabledLayers[layer]) return false
    return layerRank(layer) <= layerRank(maxLayer)
  }

  function sourceHash(source) {
    source = String(source || '')
    let h = 2166136261
    for (let i = 0; i < source.length; i++) {
      h ^= source.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return 'aeditor-fnv1a-' + h.toString(16)
  }

  function normalizeManifest(input) {
    const m = clone(input || {})
    if (!m.id) throw new Error('Extension manifest requires id')
    m.id = String(m.id)
    m.title = m.title || m.id
    m.layer = normalizeLayer(m.layer)
    m.version = m.version || '0.0.0'
    m.trust = normalizeTrust(m.trust)
    m.permissions = clone(m.permissions || {})
    m.contributes = m.contributes || {}
    m.contributes.components = normalizeComponents(m)
    m.contributes.dockPanels = normalizeDockPanels(m)
    m.contributes.tools = normalizePublicEntries(m, m.contributes.tools)
    m.contributes.context = normalizePublicEntries(m, m.contributes.context)
    m.contributes.references = normalizePublicEntries(m, m.contributes.references)
    m.contributes.operations = normalizePublicEntries(m, m.contributes.operations)
    m.contributes.commands = normalizePublicEntries(m, m.contributes.commands)
    m.contributes.menus = normalizeMenus(m)
    m.contributes.settings = clone(m.contributes.settings || [])
    return m
  }

  function normalizeTrust(trust) {
    const t = clone(trust || {})
    const code = t.code || 'none'
    if (code !== 'none' && code !== 'trusted' && code !== 'sandbox') throw new Error('Invalid extension trust.code: ' + code)
    return { code: code }
  }

  function normalizePublicEntries(manifest, list) {
    list = list || []
    const out = []
    for (let i = 0; i < list.length; i++) {
      const item = clone(list[i])
      if (!item.id) throw new Error('Extension contribution requires id')
      item.id = String(item.id)
      item.publicId = publicId(manifest.id, item.id, item.publicId)
      out.push(item)
    }
    return out
  }

  function normalizeComponents(manifest) {
    const list = manifest.contributes.components || []
    const out = []
    for (let i = 0; i < list.length; i++) {
      const c = clone(list[i])
      if (!c.id) throw new Error('Extension component requires id')
      c.id = String(c.id)
      c.publicId = publicId(manifest.id, c.id, c.publicId)
      c.kind = c.kind || 'declarative-panel'
      c.title = c.title || c.label || c.id
      c.props = c.props || {}
      if (c.kind === 'factory') c.isolation = c.isolation || 'same-page'
      if (c.kind === 'iframe') c.isolation = 'iframe'
      out.push(c)
    }
    return out
  }

  function normalizeDockPanels(manifest) {
    const list = manifest.contributes.dockPanels || []
    const out = []
    for (let i = 0; i < list.length; i++) {
      const p = clone(list[i])
      if (!p.component) throw new Error('Dock panel contribution requires component')
      p.id = p.id || p.component
      p.layout = p.layout || 'default'
      p.title = p.title || p.component
      p.mode = p.mode || 'open-on-install'
      out.push(p)
    }
    return out
  }

  function normalizeMenus(manifest) {
    const list = manifest.contributes.menus || []
    const out = []
    for (let i = 0; i < list.length; i++) {
      const item = clone(list[i])
      item.id = item.id || (item.target || 'global') + ':' + (item.command || i)
      item.publicId = publicId(manifest.id, item.id, item.publicId)
      if (item.command) item.command = publicId(manifest.id, item.command)
      out.push(item)
    }
    return out
  }

  function componentMap(manifest) {
    const map = {}
    const list = manifest.contributes.components || []
    for (let i = 0; i < list.length; i++) map[list[i].id] = list[i].publicId
    return map
  }

  function resolveComponentRef(map, name) {
    return map[name] || name
  }

  function normalizeUiNode(node, map) {
    if (!node) return null
    const out = clone(node)
    if (out.component) out.component = resolveComponentRef(map, out.component)
    if (out.children && out.children.length) {
      for (let i = 0; i < out.children.length; i++) {
        out.children[i] = normalizeUiNode(out.children[i], map)
      }
    }
    return out
  }

  function hasCodeContribution(manifest) {
    const list = manifest.contributes.components || []
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === 'factory' || list[i].kind === 'iframe') return true
    }
    return false
  }

  function codeTrustError(manifest, contribution) {
    if (contribution.kind === 'factory' && manifest.trust.code !== 'trusted') {
      return 'Factory component requires trust.code="trusted": ' + contribution.publicId
    }
    if (contribution.kind === 'iframe' && manifest.trust.code !== 'sandbox' && manifest.trust.code !== 'trusted') {
      return 'Iframe component requires trust.code="sandbox" or "trusted": ' + contribution.publicId
    }
    return null
  }

  function extensionPermissions(manifest) {
    const out = []
    out.push('extensions.layer.' + manifest.layer + '.write')
    const list = manifest.contributes.components || []
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === 'factory') out.push('extensions.code.install')
      if (list[i].kind === 'iframe') out.push('extensions.iframe.install')
    }
    const declared = manifest.permissions || []
    if (Array.isArray(declared)) {
      for (let j = 0; j < declared.length; j++) out.push(declared[j])
    } else {
      const names = keys(declared)
      for (let k = 0; k < names.length; k++) if (declared[names[k]]) out.push(names[k])
    }
    return out.filter(function (item, idx) { return out.indexOf(item) === idx })
  }

  function configurePermissions(policy) {
    permissionPolicy = policy || null
    return permissionPolicy
  }

  function checkExtensionPermission(action, manifest, opts) {
    opts = opts || {}
    const details = {
      action: action,
      manifest: manifest,
      permissions: extensionPermissions(manifest),
      allowCode: !!opts.allowCode,
      actor: opts.actor || 'user',
      agentId: opts.agentId || null,
      origin: 'extension:' + manifest.id,
      risk: hasCodeContribution(manifest) ? 'install' : 'write',
    }
    if (permissionPolicy && permissionPolicy[action]) return permissionPolicy[action](details) === true
    if (permissionPolicy && permissionPolicy.can) return permissionPolicy.can(details) === true
    if (aeditor.ai && aeditor.ai.decidePermission) {
      return aeditor.ai.decidePermission(details.actor, details.agentId, 'extension.' + action, {
        extensionId: manifest.id,
        entry: 'extension.' + action,
        phase: action === 'preview' ? 'preview' : action,
        origin: details.origin,
        risk: details.risk,
        target: manifest.id,
        permissions: details.permissions,
      }).allowed === true
    }
    return true
  }

  function validateInstall(manifest, opts) {
    opts = opts || {}
    const action = opts.action || 'install'
    if (!checkExtensionPermission(action, manifest, opts)) {
      throw new Error('Extension ' + action + ' permission denied: ' + manifest.id)
    }
    if (hasCodeContribution(manifest) && !opts.allowCode) {
      throw new Error('Code panel contribution requires allowCode')
    }
    const errors = collectValidationErrors(manifest, opts)
    if (errors.length) throw new Error(errors[0].message)
  }

  function validateFactorySource(source) {
    source = String(source || '')
    if (!source.trim()) return { ok: false, error: 'Panel source is required' }
    if (!/^\s*function\b/.test(source)) return { ok: false, error: 'Panel source must be a function expression: function (propsSig, ctx) { return HTMLElement }' }
    try {
      Function('aeditor', '"use strict"; return (' + source + ')')
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) }
    }
    return { ok: true }
  }

  function collectValidationErrors(manifest, opts) {
    opts = opts || {}
    const errors = []
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.components
    for (let i = 0; i < list.length; i++) {
      const trustError = codeTrustError(manifest, list[i])
      if (trustError) errors.push({ path: 'contributes.components[' + i + '].kind', message: trustError })
      if (list[i].kind === 'factory' && !list[i].source) {
        errors.push({ path: 'contributes.components[' + i + '].source', message: 'Factory component requires source: ' + list[i].publicId })
      }
      if ((list[i].kind === 'factory' || list[i].kind === 'iframe') && list[i].hash && list[i].hash !== sourceHash(list[i].source || list[i].srcdoc || '')) {
        errors.push({ path: 'contributes.components[' + i + '].hash', message: 'Code panel hash mismatch: ' + list[i].publicId })
      }
      const existing = aeditor.componentRegistration && aeditor.componentRegistration(list[i].publicId)
      if (existing && existing.owner !== owner) {
        errors.push({ path: 'contributes.components[' + i + '].id', message: 'Component already registered: ' + list[i].publicId })
      }
    }
    validateAiRegistryConflicts(manifest, owner, errors)
    validatePublicNames(manifest, errors)
    validateComponentUi(manifest, errors)
    validateAdapters(manifest, errors)
    if (!opts.deferLayout) validateDockTargets(manifest, errors)
    return errors
  }

  function validateAiRegistryConflicts(manifest, owner, errors) {
    const ai = aeditor.ai
    if (!ai) return
    const tools = manifest.contributes.tools || []
    for (let i = 0; i < tools.length; i++) {
      const existingTool = ai.tools && ai.tools.get && ai.tools.get(tools[i].publicId)
      const meta = ai.tools && ai.tools.meta && ai.tools.meta(tools[i].publicId) || {}
      if (existingTool && meta.owner !== owner) {
        errors.push({ path: 'contributes.tools[' + i + '].id', message: 'Tool already registered: ' + tools[i].publicId })
      }
    }
    const context = manifest.contributes.context || []
    for (let j = 0; j < context.length; j++) {
      if (ai.context && ai.context.get && ai.context.get(context[j].publicId)) {
        errors.push({ path: 'contributes.context[' + j + '].id', message: 'Context provider already registered: ' + context[j].publicId })
      }
    }
  }

  function validatePublicNames(manifest, errors) {
    const groups = ['components', 'tools', 'context', 'references', 'operations', 'commands', 'menus']
    for (let i = 0; i < groups.length; i++) {
      const name = groups[i]
      const list = manifest.contributes[name] || []
      for (let j = 0; j < list.length; j++) {
        const id = list[j].publicId
        if (id && !(id === manifest.id || id.indexOf(manifest.id + '.') === 0)) {
          errors.push({ path: 'contributes.' + name + '[' + j + '].id', message: 'Extension contribution must use dotted prefix "' + manifest.id + '.": ' + id })
        }
      }
    }
  }

  function validateComponentUi(manifest, errors) {
    const map = componentMap(manifest)
    const list = manifest.contributes.components
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === 'factory' || list[i].kind === 'iframe') continue
      const uiTree = list[i].ui || list[i].view
      if (uiTree) validateUiNode(uiTree, map, 'contributes.components[' + i + '].ui', errors)
    }
  }

  function validateUiNode(node, map, path, errors) {
    if (!node.component) {
      errors.push({ path: path + '.component', message: 'UI node requires component' })
      return
    }
    const component = resolveComponentRef(map, node.component)
    if (!map[node.component] && !(aeditor.componentRegistration && aeditor.componentRegistration(component))) {
      errors.push({ path: path + '.component', message: 'UI component not registered: ' + component })
    }
    for (let i = 0; node.children && i < node.children.length; i++) {
      validateUiNode(node.children[i], map, path + '.children[' + i + ']', errors)
    }
  }

  function validateAdapters(manifest, errors) {
    const tools = manifest.contributes.tools || []
    for (let t = 0; t < tools.length; t++) {
      const toolAdapterId = tools[t].adapter || tools[t].run && tools[t].run.adapter
      if (toolAdapterId && !adapters[toolAdapterId]) {
        errors.push({ path: 'contributes.tools[' + t + '].adapter', message: 'Adapter not registered: ' + toolAdapterId })
      }
    }
    const context = manifest.contributes.context || []
    for (let c = 0; c < context.length; c++) {
      const contextAdapterId = context[c].adapter || context[c].provider && context[c].provider.adapter
      if (contextAdapterId && !adapters[contextAdapterId]) {
        errors.push({ path: 'contributes.context[' + c + '].adapter', message: 'Adapter not registered: ' + contextAdapterId })
      }
    }
    const refs = manifest.contributes.references || []
    for (let i = 0; i < refs.length; i++) {
      if (refs[i].adapter && !adapters[refs[i].adapter]) {
        errors.push({ path: 'contributes.references[' + i + '].adapter', message: 'Adapter not registered: ' + refs[i].adapter })
      }
    }
    const ops = manifest.contributes.operations || []
    for (let j = 0; j < ops.length; j++) {
      if (ops[j].adapter && !adapters[ops[j].adapter]) {
        errors.push({ path: 'contributes.operations[' + j + '].adapter', message: 'Adapter not registered: ' + ops[j].adapter })
      }
    }
    const cmds = manifest.contributes.commands || []
    for (let k = 0; k < cmds.length; k++) {
      const adapterId = cmds[k].adapter || cmds[k].run && cmds[k].run.adapter
      if (adapterId && !adapters[adapterId]) {
        errors.push({ path: 'contributes.commands[' + k + '].adapter', message: 'Adapter not registered: ' + adapterId })
      }
    }
  }

  function validateDockTargets(manifest, errors) {
    const docks = manifest.contributes.dockPanels || []
    const map = componentMap(manifest)
    for (let i = 0; i < docks.length; i++) {
      if (docks[i].mode === 'manual') continue
      const layout = resolveLayout(docks[i].layout)
      if (!layout || !layout.tree) {
        errors.push({ path: 'contributes.dockPanels[' + i + '].layout', message: 'Layout not registered: ' + docks[i].layout })
        continue
      }
      const dockName = docks[i].dock || docks[i].dockId || docks[i].target || 'main'
      if (!dockExists(layout.tree(), dockName)) {
        errors.push({ path: 'contributes.dockPanels[' + i + '].dock', message: 'Dock not found: ' + dockName })
      }
      const component = resolveComponentRef(map, docks[i].component)
      if (!map[docks[i].component] && !(aeditor.componentRegistration && aeditor.componentRegistration(component))) {
        errors.push({ path: 'contributes.dockPanels[' + i + '].component', message: 'Component not registered: ' + component })
      }
    }
  }

  function dockExists(tree, idOrName) {
    let hit = false
    function walk(n) {
      if (!n || hit) return
      if (n.type === 'dock') {
        if (n.id === idOrName || n.name === idOrName) hit = true
      } else if (n.children) {
        for (let i = 0; i < n.children.length; i++) walk(n.children[i])
      }
    }
    walk(tree)
    return hit
  }

  function makeComponentSpec(manifest, contribution) {
    const map = componentMap(manifest)
    const uiTree = normalizeUiNode(contribution.ui || contribution.view, map)
    const defaults = {
      title: contribution.title,
      icon: contribution.icon || '',
      props: clone(contribution.props || {}),
      owner: ownerFor(manifest.id),
      extensionId: manifest.id,
    }
    return {
      title: contribution.title,
      icon: contribution.icon || '',
      category: contribution.category || 'Extension',
      defaults: function () { return clone(defaults) },
      factory: function (propsSig, ctx) {
        if (contribution.kind === 'iframe') {
          const frame = document.createElement('iframe')
          frame.className = 'aeditor-extension-iframe'
          frame.setAttribute('sandbox', contribution.sandbox || 'allow-scripts')
          frame.setAttribute('referrerpolicy', 'no-referrer')
          frame.srcdoc = contribution.srcdoc || contribution.source || ''
          return frame
        }
        if (contribution.kind === 'factory') {
          if (contribution.isolation !== 'same-page') throw new Error('Unsupported factory isolation: ' + contribution.isolation)
          const maker = Function('aeditor', '"use strict"; return (' + contribution.source + ')')(aeditor)
          return maker(propsSig, ctx || {})
        }
        if (!uiTree) {
          const el = document.createElement('div')
          el.className = 'aeditor-extension-empty'
          el.textContent = contribution.title
          return el
        }
        const extCtx = Object.assign({}, ctx || {}, {
          extension: {
            id: manifest.id,
            owner: ownerFor(manifest.id),
            manifest: manifest,
            component: contribution.id,
          },
          data: propsSig,
        })
        return aeditor.ui.renderUITree(uiTree, extCtx)
      },
      dispose: function (el) {
        if (aeditor.ui && aeditor.ui.dispose) aeditor.ui.dispose(el)
      },
    }
  }

  function registerComponents(manifest, rollback) {
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.components
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      aeditor.registerComponent(c.publicId, makeComponentSpec(manifest, c), { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { aeditor.unregisterComponent(name, { owner: owner }) }
      }(c.publicId))
    }
  }

  function makeAdapterCall(adapterId, method) {
    return function (arg, ctx) {
      const adapter = adapters[adapterId]
      if (!adapter || !adapter[method]) return null
      return adapter[method](arg, ctx || {})
    }
  }

  function makeContextAdapterCall(adapterId, method) {
    return function (target, event, ctx) {
      const adapter = adapters[adapterId]
      if (!adapter || !adapter[method]) return method === 'match' ? true : null
      return adapter[method](target, event, ctx || {})
    }
  }

  function registerTools(manifest, rollback) {
    const ai = aeditor.ai
    if (!ai || !ai.tools) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.tools
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      const adapterId = t.adapter || t.run && t.run.adapter
      const spec = {
        title: t.title || t.label || t.id,
        description: t.description || '',
        schema: clone(t.schema || null),
        permissions: clone(t.permissions || ['tool.call']),
        risk: t.risk || (t.permission && t.permission.risk) || null,
        origin: 'extension:' + manifest.id,
        exposeToModel: t.visibleToModel === true || t.exposeToModel === true,
        available: t.available,
        preview: t.preview || (adapterId ? makeAdapterCall(adapterId, 'preview') : null),
        run: t.run && typeof t.run === 'function'
          ? t.run
          : (adapterId ? makeAdapterCall(adapterId, 'run') : null),
        apply: t.apply || (adapterId ? makeAdapterCall(adapterId, 'apply') : null),
      }
      ai.tools.register(t.publicId, spec, { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { ai.tools.unregister(name, { owner: owner }) }
      }(t.publicId))
    }
  }

  function registerContextProviders(manifest, rollback) {
    const ai = aeditor.ai
    if (!ai || !ai.context) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.context
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      const adapterId = c.adapter || c.provider && c.provider.adapter
      const provider = Object.assign({}, c.provider || {})
      if (adapterId) {
        provider.match = provider.match || makeContextAdapterCall(adapterId, 'match')
        provider.capture = provider.capture || makeContextAdapterCall(adapterId, 'capture')
      }
      ai.context.register(c.publicId, provider)
      rollback.push(function (name) {
        return function () { ai.context.unregister(name) }
      }(c.publicId))
    }
  }

  function registerReferences(manifest, rollback) {
    const ai = aeditor.ai
    if (!ai || !ai.references) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.references
    for (let i = 0; i < list.length; i++) {
      const r = list[i]
      const adapterId = r.adapter
      const provider = Object.assign({}, r.provider || {})
      if (adapterId) {
        provider.describe = provider.describe || makeAdapterCall(adapterId, 'describe')
        provider.read = provider.read || makeAdapterCall(adapterId, 'read')
        provider.search = provider.search || makeAdapterCall(adapterId, 'search')
        provider.selection = provider.selection || makeAdapterCall(adapterId, 'selection')
        provider.schema = provider.schema || function () { return clone(r.schema || null) }
        provider.capabilities = provider.capabilities || function () { return clone(r.capabilities || []) }
      }
      ai.references.register(r.publicId, provider, { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { ai.references.unregister(name, { owner: owner }) }
      }(r.publicId))
    }
  }

  function registerOperations(manifest, rollback) {
    const ai = aeditor.ai
    if (!ai || !ai.operations) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.operations
    for (let i = 0; i < list.length; i++) {
      const o = list[i]
      const adapterId = o.adapter
      const spec = {
        title: o.title || o.id,
        risk: o.risk || 'edit',
        preview: o.preview || (adapterId ? makeAdapterCall(adapterId, 'preview') : null),
        apply: o.apply || (adapterId ? makeAdapterCall(adapterId, 'apply') : null),
      }
      ai.operations.register(o.publicId, spec, { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { ai.operations.unregister(name, { owner: owner }) }
      }(o.publicId))
    }
  }

  function registerCommands(manifest, rollback) {
    if (!aeditor.commands) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.commands
    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      const adapterId = c.adapter || c.run && c.run.adapter
      const spec = {
        title: c.title || c.label || c.id,
        label: c.label || c.title || c.id,
        icon: c.icon || '',
        kbd: c.kbd || '',
        danger: !!c.danger,
        run: c.run && typeof c.run === 'function'
          ? c.run
          : (adapterId ? makeAdapterCall(adapterId, 'run') : null),
      }
      aeditor.commands.register(c.publicId, spec, { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { aeditor.commands.unregister(name, { owner: owner }) }
      }(c.publicId))
    }
  }

  function registerMenus(manifest, rollback) {
    if (!aeditor.commands) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.menus
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      aeditor.commands.registerMenu(m.publicId, m, { owner: owner, layer: manifest.layer })
      rollback.push(function (name) {
        return function () { aeditor.commands.unregisterMenu(name, { owner: owner }) }
      }(m.publicId))
    }
  }

  function registerSettings(manifest, rollback) {
    if (!aeditor.settings) return
    const owner = ownerFor(manifest.id)
    const list = manifest.contributes.settings
    const meta = { owner: owner, layer: manifest.layer }
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      if (s.section) {
        const id = s.section.id || s.id || manifest.id
        aeditor.settings.registerSection(id, s.section, meta)
      }
      if (s.schemas) aeditor.settings.registerSchema(s.section && s.section.id || s.sectionId || s.id || manifest.id, s.schemas, meta)
      if (s.schema) aeditor.settings.registerSchema(s.section && s.section.id || s.sectionId || s.id || manifest.id, s.schema, meta)
      if (s.pages) {
        const pages = Array.isArray(s.pages) ? s.pages : [s.pages]
        for (let j = 0; j < pages.length; j++) aeditor.settings.registerPage(pages[j].id, pages[j], meta)
      }
      if (s.page) aeditor.settings.registerPage(s.page.id, s.page, meta)
    }
    rollback.push(function () { aeditor.settings.unregisterOwner(owner) })
  }

  function registerLayout(name, handle) {
    name = name || 'default'
    layouts[name] = handle
    applyPendingDockPanels()
    return function () {
      if (layouts[name] === handle) delete layouts[name]
    }
  }

  function firstLayout() {
    const names = keys(layouts)
    return names.length ? layouts[names[0]] : null
  }

  function resolveLayout(name) {
    if (name) return layouts[name] || null
    return layouts.default || firstLayout()
  }

  function panelDockTarget(input) {
    return input.dock || input.dockId || input.target || 'main'
  }

  function placePanel(input, opts) {
    opts = opts || {}
    input = input || {}
    const layout = resolveLayout(input.layout)
    if (!layout) {
      if (opts.deferLayout) return { pendingLayout: true }
      throw new Error('Layout not registered: ' + (input.layout || 'default'))
    }
    const component = resolveComponentRef(opts.componentMap || {}, input.component)
    const result = layout.addPanel(panelDockTarget(input), {
      component: component,
      title: input.title,
      icon: input.icon,
      props: clone(input.props || {}),
      owner: input.owner || opts.owner || null,
      extensionId: input.extensionId || opts.extensionId || null,
    }, { transient: !!input.transient })
    if (!result || !result.panelId) {
      if (opts.deferLayout) return { pendingLayout: true }
      throw new Error('Dock not found: ' + panelDockTarget(input))
    }
    if (opts.rollback) {
      opts.rollback.push(function (handle, panelId) {
        return function () { handle.removePanel(panelId) }
      }(layout, result.panelId))
    }
    const failure = panelHealthError(layout, result.panelId)
    if (failure) {
      layout.removePanel(result.panelId)
      throw new Error(failure)
    }
    return Object.assign({ component: component }, result)
  }

  function addDockPanels(manifest, rollback, opts) {
    opts = opts || {}
    const owner = ownerFor(manifest.id)
    const map = componentMap(manifest)
    const list = manifest.contributes.dockPanels
    const added = []
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      if (p.mode === 'manual') continue
      const placed = placePanel(p, {
        componentMap: map,
        owner: owner,
        extensionId: manifest.id,
        rollback: rollback,
        deferLayout: opts.deferLayout,
      })
      if (placed.pendingLayout) { added.pendingLayout = true; continue }
      added.push(placed.panelId)
    }
    return added
  }

  function panelHealthError(layout, panelId) {
    const info = layout.inspectPanel && layout.inspectPanel(panelId)
    if (!info) return ''
    if (info.textSample && /\{\{[\s\S]*?\}\}/.test(info.textSample)) return 'Panel rendered unresolved template text: {{...}}'
    if (info.status !== 'error') return ''
    return 'Panel failed to render: ' + info.component + ' (' + panelId + '): ' + (info.error && info.error.message || 'unknown error')
  }

  function panelSmokeError(layout, panelId) {
    const info = layout.inspectPanel && layout.inspectPanel(panelId)
    if (!info) return ''
    if (info.status === 'error') return panelHealthError(layout, panelId)
    if (info.textSample && /\{\{[\s\S]*?\}\}/.test(info.textSample)) return 'Panel rendered unresolved template text: {{...}}'
    return ''
  }

  function applyPendingDockPanels() {
    const ids = keys(extensions)
    for (let i = 0; i < ids.length; i++) {
      const entry = extensions[ids[i]]
      if (!entry.active || !entry.pendingLayout || entry.panels.length) continue
      const rollback = []
      try {
        const panels = addDockPanels(entry.manifest, rollback, { deferLayout: true })
        entry.panels = panels
        entry.pendingLayout = !!panels.pendingLayout
      } catch (err) {
        for (let j = rollback.length - 1; j >= 0; j--) rollback[j]()
        entry.lastError = String(err && err.message || err)
      }
    }
  }

  function removeExtensionPanels(entry) {
    const removed = []
    const names = keys(layouts)
    for (let i = 0; i < names.length; i++) {
      const layout = layouts[names[i]]
      const ids = panelsByExtension(layout.tree(), entry)
      for (let j = 0; j < ids.length; j++) {
        layout.removePanel(ids[j])
        removed.push(ids[j])
      }
    }
    return removed
  }

  function removeRecoveryPanels(extensionId) {
    const removed = []
    const names = keys(layouts)
    for (let i = 0; i < names.length; i++) {
      const layout = layouts[names[i]]
      const ids = recoveryPanels(layout.tree(), extensionId)
      for (let j = 0; j < ids.length; j++) {
        layout.removePanel(ids[j])
        removed.push(ids[j])
      }
    }
    return removed
  }

  function recoveryPanels(tree, extensionId) {
    const out = []
    function walk(n) {
      if (!n) return
      if (n.type === 'dock') {
        const panels = n.panels || []
        for (let i = 0; i < panels.length; i++) {
          const props = panels[i].props || {}
          if (panels[i].component === 'extension-disabled' && props.extensionId === extensionId) out.push(panels[i].id)
        }
      } else if (n.children) {
        for (let i = 0; i < n.children.length; i++) walk(n.children[i])
      }
    }
    walk(tree)
    return out
  }

  function panelsByExtension(tree, entry) {
    const out = []
    const owner = entry.owner
    const id = entry.manifest.id
    function walk(n) {
      if (!n) return
      if (n.type === 'dock') {
        const panels = n.panels || []
        for (let i = 0; i < panels.length; i++) {
          if (
            panels[i].owner === owner ||
            panels[i].extensionId === id ||
            matchesPrefix(panels[i].component || '', id + '/')
          ) out.push(panels[i].id)
        }
      } else if (n.children) {
        for (let i = 0; i < n.children.length; i++) walk(n.children[i])
      }
    }
    walk(tree)
    return out
  }

  function ownedComponents(manifest) {
    const out = {}
    const list = manifest.contributes.components || []
    for (let i = 0; i < list.length; i++) out[list[i].publicId] = true
    return out
  }

  function replaceExternalPanels(entry) {
    const owned = ownedComponents(entry.manifest)
    const names = keys(layouts)
    for (let i = 0; i < names.length; i++) {
      const layout = layouts[names[i]]
      if (!layout.setTree) continue
      const next = mapPanels(layout.tree(), function (panel) {
        if (!owned[panel.component] || panel.owner === entry.owner) return panel
        const props = {
          extensionId: entry.manifest.id,
          extensionTitle: entry.manifest.title,
          component: panel.component,
          previousPanel: clone(panel),
        }
        return Object.assign({}, panel, {
          component: 'extension-disabled',
          title: panel.title || 'Extension disabled',
          icon: 'alert-triangle',
          props: props,
        })
      })
      if (next !== layout.tree()) layout.setTree(next)
    }
  }

  function restoreRecoveryPanels(entry) {
    const names = keys(layouts)
    for (let i = 0; i < names.length; i++) {
      const layout = layouts[names[i]]
      if (!layout.setTree) continue
      const next = mapPanels(layout.tree(), function (panel) {
        const props = panel.props || {}
        if (panel.component !== 'extension-disabled' || props.extensionId !== entry.manifest.id || !props.previousPanel) return panel
        return props.previousPanel
      })
      if (next !== layout.tree()) layout.setTree(next)
    }
  }

  function mapPanels(node, fn) {
    if (!node) return node
    if (node.type === 'dock') {
      let changed = false
      const panels = (node.panels || []).map(function (panel) {
        const next = fn(panel)
        if (next !== panel) changed = true
        return next
      })
      return changed ? Object.assign({}, node, { panels: panels }) : node
    }
    if (!node.children) return node
    let changedChildren = false
    const children = node.children.map(function (child) {
      const next = mapPanels(child, fn)
      if (next !== child) changedChildren = true
      return next
    })
    return changedChildren ? Object.assign({}, node, { children: children }) : node
  }

  function previewExtension(input) {
    const manifest = normalizeManifest(input && input.manifest ? input.manifest : input)
    const errors = collectValidationErrors(manifest, input || {})
    const owner = ownerFor(manifest.id)
    const changes = []
    const c = manifest.contributes.components
    for (let i = 0; i < c.length; i++) changes.push({ type: 'component', id: c[i].publicId, owner: owner })
    const d = manifest.contributes.dockPanels
    for (let j = 0; j < d.length; j++) changes.push({ type: 'dockPanel', dock: d[j].dock || d[j].dockId || d[j].target || 'main', component: d[j].component })
    const tools = manifest.contributes.tools
    for (let t = 0; t < tools.length; t++) changes.push({ type: 'tool', id: tools[t].publicId, owner: owner })
    const context = manifest.contributes.context
    for (let q = 0; q < context.length; q++) changes.push({ type: 'context', id: context[q].publicId, owner: owner })
    const r = manifest.contributes.references
    for (let k = 0; k < r.length; k++) changes.push({ type: 'reference', id: r[k].publicId, owner: owner })
    const o = manifest.contributes.operations
    for (let x = 0; x < o.length; x++) changes.push({ type: 'operation', id: o[x].publicId, owner: owner })
    const cmds = manifest.contributes.commands
    for (let y = 0; y < cmds.length; y++) changes.push({ type: 'command', id: cmds[y].publicId, owner: owner })
    const menus = manifest.contributes.menus
    for (let z = 0; z < menus.length; z++) changes.push({ type: 'menu', id: menus[z].publicId, target: menus[z].target })
    const settings = manifest.contributes.settings
    for (let s = 0; s < settings.length; s++) changes.push({ type: 'settings', id: settings[s].id || settings[s].sectionId || manifest.id })
    return {
      ok: errors.length === 0,
      risk: 'edit',
      title: 'Install extension: ' + manifest.title,
      summary: changes.length + ' contribution(s)',
      manifest: manifest,
      input: clone(input || {}),
      changes: changes,
      permissions: extensionPermissions(manifest),
      requiresApproval: hasCodeContribution(manifest),
      errors: errors,
      warnings: hasCodeContribution(manifest) ? ['Code panel contribution requires explicit allowCode approval.'] : [],
    }
  }

  function reviewInstall(input, opts) {
    opts = opts || {}
    const preview = previewExtension(input)
    const manifest = preview.manifest
    const canInstall = preview.ok && checkExtensionPermission('install', manifest, opts)
    return Object.assign({}, preview, {
      canInstall: canInstall,
      canApply: canInstall && (!hasCodeContribution(manifest) || !!opts.allowCode),
      requiredConsent: hasCodeContribution(manifest) && !opts.allowCode ? 'allowCode' : null,
    })
  }

  function installWithReview(input, opts) {
    opts = opts || {}
    const review = reviewInstall(input, opts)
    if (!review.canInstall) return Promise.resolve(Object.assign({}, review, { installed: false, error: 'Permission denied' }))
    if (review.canApply && !opts.confirm) return Promise.resolve(installExtension(review.manifest, opts))
    if (!aeditor.ui || !aeditor.ui.confirm) return Promise.resolve(review)
    const lines = [
      review.title,
      review.summary,
      review.permissions.length ? 'Permissions: ' + review.permissions.join(', ') : '',
      review.requiredConsent ? 'Requires explicit consent: ' + review.requiredConsent : '',
    ].filter(Boolean)
    return aeditor.ui.confirm(lines.join('\n')).then(function (ok) {
      if (!ok) return Object.assign({}, review, { installed: false, cancelled: true })
      return installExtension(review.manifest, Object.assign({}, opts, { allowCode: opts.allowCode || review.requiredConsent === 'allowCode' }))
    })
  }

  function activateEntry(entry) {
    if (entry.active) return { ok: true, active: true, id: entry.manifest.id, panels: entry.panels || [] }
    if (!canActivateLayer(entry.manifest.layer)) return { ok: true, active: false, filtered: true, id: entry.manifest.id, layer: entry.manifest.layer }
    const rollback = []
    try {
      validateInstall(entry.manifest, { action: entry.action || 'install', allowCode: !!entry.allowCode, actor: entry.actor, agentId: entry.agentId, deferLayout: !!entry.deferLayout || keys(layouts).length === 0 })
      registerComponents(entry.manifest, rollback)
      registerTools(entry.manifest, rollback)
      registerContextProviders(entry.manifest, rollback)
      registerReferences(entry.manifest, rollback)
      registerOperations(entry.manifest, rollback)
      registerCommands(entry.manifest, rollback)
      registerMenus(entry.manifest, rollback)
      registerSettings(entry.manifest, rollback)
      restoreRecoveryPanels(entry)
      const panels = addDockPanels(entry.manifest, rollback, { deferLayout: !!entry.deferLayout || keys(layouts).length === 0 })
      entry.panels = panels
      entry.pendingLayout = !!panels.pendingLayout
      entry.active = true
      entry.lastError = null
      return { ok: true, active: true, id: entry.manifest.id, panels: entry.panels }
    } catch (err) {
      for (let i = rollback.length - 1; i >= 0; i--) rollback[i]()
      entry.active = false
      entry.panels = []
      entry.lastError = String(err && err.message || err)
      throw err
    }
  }

  function deactivateEntry(entry, opts) {
    opts = opts || {}
    const owner = entry.owner
    const prefix = entry.manifest.id
    if (opts.replaceExternal !== false) replaceExternalPanels(entry)
    const removedPanels = removeExtensionPanels(entry)
    if (aeditor.ai && aeditor.ai.tools && aeditor.ai.tools.unregisterPrefix) aeditor.ai.tools.unregisterPrefix(prefix)
    if (aeditor.ai && aeditor.ai.context && aeditor.ai.context.unregisterPrefix) aeditor.ai.context.unregisterPrefix(prefix)
    if (aeditor.ai && aeditor.ai.references && aeditor.ai.references.unregisterPrefix) aeditor.ai.references.unregisterPrefix(prefix)
    if (aeditor.ai && aeditor.ai.operations && aeditor.ai.operations.unregisterPrefix) aeditor.ai.operations.unregisterPrefix(prefix)
    if (aeditor.commands && aeditor.commands.unregisterPrefix) aeditor.commands.unregisterPrefix(prefix)
    if (aeditor.settings && aeditor.settings.unregisterPrefix) aeditor.settings.unregisterPrefix(prefix)
    if (aeditor.unregisterComponentPrefix) aeditor.unregisterComponentPrefix(prefix)
    entry.active = false
    entry.panels = []
    return removedPanels
  }

  function saveExtensions() {
    if (!storage) return
    const entries = keys(extensions).map(function (id) {
      const entry = extensions[id]
      return {
        manifest: clone(entry.manifest),
        enabled: entry.enabled !== false,
        allowCode: !!entry.allowCode,
        actor: entry.actor || null,
        agentId: entry.agentId || null,
        deferLayout: !!entry.deferLayout,
        installedAt: entry.installedAt,
        updatedAt: entry.updatedAt,
      }
    })
    storage.setItem(storageKey, JSON.stringify({ version: 1, entries: entries }))
  }

  function loadStoredEntries() {
    if (!storage) return []
    const raw = storage.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed && parsed.entries ? parsed.entries : []
  }

  function clearRuntimeEntries() {
    const ids = keys(extensions)
    for (let i = 0; i < ids.length; i++) {
      const entry = extensions[ids[i]]
      if (entry.active) deactivateEntry(entry)
      delete extensions[ids[i]]
    }
  }

  function installExtension(input, opts) {
    opts = opts || {}
    const manifest = normalizeManifest(input && input.manifest ? input.manifest : input)
    const owner = ownerFor(manifest.id)
    const previous = extensions[manifest.id] ? {
      manifest: clone(extensions[manifest.id].manifest),
      enabled: extensions[manifest.id].enabled !== false,
      active: !!extensions[manifest.id].active,
      allowCode: !!extensions[manifest.id].allowCode,
      action: extensions[manifest.id].action,
      actor: extensions[manifest.id].actor,
      agentId: extensions[manifest.id].agentId,
      installedAt: extensions[manifest.id].installedAt,
    } : null
    if (previous && extensions[manifest.id].active) deactivateEntry(extensions[manifest.id], { replaceExternal: false })
    try {
      const now = Date.now()
      const entry = {
        manifest: manifest,
        owner: owner,
        panels: [],
        enabled: opts.enabled === false ? false : true,
        allowCode: !!opts.allowCode,
        action: opts.action || 'install',
        deferLayout: !!opts.deferLayout,
        actor: opts.actor || 'user',
        agentId: opts.agentId || null,
        active: false,
        installedAt: previous ? previous.installedAt : now,
        updatedAt: now,
      }
      extensions[manifest.id] = entry
      if (entry.enabled) activateEntry(entry)
      if (opts.save !== false) saveExtensions()
      return { ok: true, installed: true, id: manifest.id, owner: owner, enabled: entry.enabled, active: entry.active, panels: entry.panels }
    } catch (err) {
      delete extensions[manifest.id]
      if (previous) {
        extensions[manifest.id] = {
          manifest: previous.manifest,
          owner: owner,
          panels: [],
          enabled: previous.enabled,
          allowCode: previous.allowCode,
          action: previous.action,
          deferLayout: previous.deferLayout,
          actor: previous.actor,
          agentId: previous.agentId,
          active: false,
          installedAt: previous.installedAt,
          updatedAt: Date.now(),
        }
        if (previous.active) activateEntry(extensions[manifest.id])
      }
      throw err
    }
  }

  function uninstallExtension(id, opts) {
    opts = opts || {}
    const entry = extensions[id]
    const owner = entry ? entry.owner : ownerFor(id)
    if (entry && !checkExtensionPermission('uninstall', entry.manifest, opts)) throw new Error('Extension uninstall permission denied: ' + id)
    const removedPanels = entry
      ? deactivateEntry(entry)
      : removeExtensionPanels({ owner: owner, manifest: { id: id } })
    const removedRecovery = removeRecoveryPanels(id)
    delete extensions[id]
    if (opts.save !== false) saveExtensions()
    return { ok: true, removed: true, id: id, owner: owner, panels: removedPanels.concat(removedRecovery) }
  }

  function updateExtension(id, manifest, opts) {
    manifest = normalizeManifest(manifest)
    if (manifest.id !== id) throw new Error('Extension update id mismatch: ' + id)
    return installExtension(manifest, Object.assign({}, opts || {}, { action: 'update' }))
  }

  function enableExtension(id, opts) {
    opts = opts || {}
    const entry = extensions[id]
    if (!entry) throw new Error('Extension not found: ' + id)
    if (!checkExtensionPermission('enable', entry.manifest, opts)) throw new Error('Extension enable permission denied: ' + id)
    entry.enabled = true
    const result = activateEntry(entry)
    if (opts.save !== false) saveExtensions()
    return Object.assign({ enabled: true }, result)
  }

  function disableExtension(id, opts) {
    opts = opts || {}
    const entry = extensions[id]
    if (!entry) throw new Error('Extension not found: ' + id)
    if (!checkExtensionPermission('disable', entry.manifest, opts)) throw new Error('Extension disable permission denied: ' + id)
    const panels = entry.active ? deactivateEntry(entry) : []
    entry.enabled = false
    if (opts.save !== false) saveExtensions()
    return { ok: true, disabled: true, id: id, panels: panels }
  }

  function setLayer(id, layer, opts) {
    opts = opts || {}
    const entry = extensions[id]
    if (!entry) throw new Error('Extension not found: ' + id)
    if (!checkExtensionPermission('promote', entry.manifest, opts)) throw new Error('Extension promote permission denied: ' + id)
    const manifest = clone(entry.manifest)
    manifest.layer = normalizeLayer(layer)
    return installExtension(manifest, {
      enabled: entry.enabled !== false,
      allowCode: !!entry.allowCode,
      save: opts.save,
    })
  }

  function removePanelFromDock(input) {
    input = input || {}
    const layout = resolveLayout(input.layout)
    if (!layout) throw new Error('Layout not registered: ' + (input.layout || 'default'))
    const ids = input.panelId ? [input.panelId] : findPanels(layout.tree(), input)
    for (let i = 0; i < ids.length; i++) layout.removePanel(ids[i])
    return { ok: true, removed: ids }
  }

  function findPanels(tree, input) {
    const out = []
    function walk(n) {
      if (!n) return
      if (n.type === 'dock') {
        if (input.dock && n.id !== input.dock && n.name !== input.dock) return
        const panels = n.panels || []
        for (let i = 0; i < panels.length; i++) {
          if (input.owner && panels[i].owner !== input.owner) continue
          if (input.extensionId && panels[i].extensionId !== input.extensionId) continue
          if (input.component && panels[i].component !== input.component) continue
          out.push(panels[i].id)
        }
      } else if (n.children) {
        for (let i = 0; i < n.children.length; i++) walk(n.children[i])
      }
    }
    walk(tree)
    return out
  }

  function setSafeMode(enable, opts) {
    opts = opts || {}
    safeModeEnabled = !!enable
    safeModeAllowApp = !!opts.allowApp
    const ids = keys(extensions)
    const results = []
    for (let i = 0; i < ids.length; i++) {
      const entry = extensions[ids[i]]
      if (!canActivateLayer(entry.manifest.layer) && entry.active) {
        results.push({ id: ids[i], panels: deactivateEntry(entry), active: false })
      } else if (canActivateLayer(entry.manifest.layer) && entry.enabled && !entry.active) {
        try {
          results.push(activateEntry(entry))
        } catch (err) {
          results.push({ ok: false, id: ids[i], error: String(err && err.message || err) })
        }
      }
    }
    if (opts.save !== false) saveExtensions()
    return { ok: true, safeMode: safeModeEnabled, allowApp: safeModeAllowApp, results: results }
  }

  function refreshActivation(opts) {
    opts = opts || {}
    const ids = keys(extensions)
    const results = []
    for (let i = 0; i < ids.length; i++) {
      const entry = extensions[ids[i]]
      if (!canActivateLayer(entry.manifest.layer) && entry.active) {
        results.push({ id: ids[i], panels: deactivateEntry(entry), active: false })
      } else if (canActivateLayer(entry.manifest.layer) && entry.enabled && !entry.active) {
        try {
          results.push(activateEntry(entry))
        } catch (err) {
          results.push({ ok: false, id: ids[i], error: String(err && err.message || err) })
        }
      }
    }
    if (opts.save !== false) saveExtensions()
    return results
  }

  function setMaxLayer(layer, opts) {
    maxLayer = normalizeLayer(layer)
    const results = refreshActivation(opts || {})
    return { ok: true, maxLayer: maxLayer, results: results }
  }

  function disableLayer(layer, opts) {
    layer = normalizeLayer(layer)
    disabledLayers[layer] = true
    const results = refreshActivation(opts || {})
    return { ok: true, layer: layer, disabled: true, results: results }
  }

  function enableLayer(layer, opts) {
    layer = normalizeLayer(layer)
    delete disabledLayers[layer]
    const results = refreshActivation(opts || {})
    return { ok: true, layer: layer, disabled: false, results: results }
  }

  function bootExtensions(opts) {
    opts = opts || {}
    safeModeEnabled = !!opts.safeMode
    safeModeAllowApp = !!opts.allowApp
    if (opts.maxLayer) maxLayer = normalizeLayer(opts.maxLayer)
    if (opts.disabledLayers) {
      keys(disabledLayers).forEach(function (layer) { delete disabledLayers[layer] })
      for (let i = 0; i < opts.disabledLayers.length; i++) disabledLayers[normalizeLayer(opts.disabledLayers[i])] = true
    }
    clearRuntimeEntries()
    const stored = loadStoredEntries()
    for (let i = 0; i < stored.length; i++) {
      const manifest = normalizeManifest(stored[i].manifest)
      const entry = {
        manifest: manifest,
        owner: ownerFor(manifest.id),
        panels: [],
        enabled: stored[i].enabled !== false,
        allowCode: !!stored[i].allowCode,
        actor: stored[i].actor || 'user',
        agentId: stored[i].agentId || null,
        deferLayout: true,
        active: false,
        installedAt: stored[i].installedAt || Date.now(),
        updatedAt: stored[i].updatedAt || Date.now(),
      }
      extensions[manifest.id] = entry
      if (entry.enabled) {
        try { activateEntry(entry) }
        catch (_) {}
      }
    }
    return { ok: true, booted: true, safeMode: safeModeEnabled, allowApp: safeModeAllowApp, maxLayer: maxLayer, count: keys(extensions).length }
  }

  function configureStorage(opts) {
    opts = opts || {}
    storageKey = opts.key || DEFAULT_STORAGE_KEY
    storage = opts.storage === null ? null : (opts.storage || defaultStorage())
    if (opts.load !== false) return bootExtensions({ safeMode: !!opts.safeMode })
    return { ok: true, configured: true, key: storageKey }
  }

  function clearStoredExtensions() {
    if (storage) storage.removeItem(storageKey)
  }

  function registerAdapter(id, spec) {
    adapters[id] = spec || {}
    return function () {
      if (adapters[id] === spec) delete adapters[id]
    }
  }

  function registerRecoveryComponent() {
    if (aeditor.componentRegistration && aeditor.componentRegistration('extension-disabled')) return
    aeditor.registerComponent('extension-disabled', {
      palette: false,
      title: 'Extension Disabled',
      icon: 'alert-triangle',
      defaults: function () {
        return { title: 'Extension disabled', icon: 'alert-triangle', props: {} }
      },
      factory: function (propsSig) {
        const el = document.createElement('div')
        el.className = 'aeditor-extension-disabled'
        const title = document.createElement('div')
        title.className = 'aeditor-extension-disabled-title'
        const body = document.createElement('div')
        body.className = 'aeditor-extension-disabled-body'
        el.appendChild(title)
        el.appendChild(body)
        const stop = aeditor.effect(function () {
          const p = propsSig() || {}
          title.textContent = 'Extension disabled'
          body.textContent = (p.extensionTitle || p.extensionId || 'Extension') + ' is disabled or unavailable. Component: ' + (p.component || 'unknown')
        })
        if (aeditor.ui && aeditor.ui.collect) aeditor.ui.collect(el, stop)
        return el
      },
    })
  }

  function listExtensions() {
    return keys(extensions).map(function (id) {
      const entry = extensions[id]
      return {
        id: id,
        manifest: clone(entry.manifest),
        enabled: entry.enabled !== false,
        active: !!entry.active,
        filtered: !canActivateLayer(entry.manifest.layer),
        owner: entry.owner,
        panels: clone(entry.panels || []),
        lastError: entry.lastError || null,
      }
    })
  }

  function getExtension(id) {
    if (!extensions[id]) return null
    const entry = extensions[id]
    return {
      id: id,
      manifest: clone(entry.manifest),
      enabled: entry.enabled !== false,
      active: !!entry.active,
      filtered: !canActivateLayer(entry.manifest.layer),
      owner: entry.owner,
      panels: clone(entry.panels || []),
      lastError: entry.lastError || null,
    }
  }

  function registerAiOperations() {
    if (!aeditor.ai || !aeditor.ai.operations) return
    aeditor.ai.operations.register('aeditor.installExtension', {
      title: 'Install Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input, ctx) { return reviewInstall(input, { actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id, allowCode: false }) },
      apply: function (preview, ctx) { return installExtension(preview.manifest || preview.input, { allowCode: false, actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id }) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.removeExtension', {
      title: 'Remove Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        return {
          ok: true,
          risk: 'edit',
          title: 'Remove extension: ' + input.id,
          input: clone(input),
          changes: [{ type: 'extension', id: input.id, action: 'remove' }],
        }
      },
      apply: function (preview, ctx) { return uninstallExtension(preview.input.id, { force: true, actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id }) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.updateExtension', {
      title: 'Update Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input, ctx) { return reviewInstall(input, { actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id, allowCode: false }) },
      apply: function (preview, ctx) {
        const manifest = preview.manifest || preview.input && preview.input.manifest
        return updateExtension(manifest.id, manifest, { allowCode: false, actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id })
      },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.promoteExtensionLayer', {
      title: 'Promote Extension Layer',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        return {
          ok: true,
          risk: 'edit',
          title: 'Promote extension: ' + input.id,
          input: clone(input),
          changes: [{ type: 'extension', id: input.id, action: 'setLayer', layer: input.layer }],
        }
      },
      apply: function (preview, ctx) { return setLayer(preview.input.id, preview.input.layer, { actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id }) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.enableExtension', {
      title: 'Enable Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        return {
          ok: true,
          risk: 'edit',
          title: 'Enable extension: ' + input.id,
          input: clone(input),
          changes: [{ type: 'extension', id: input.id, action: 'enable' }],
        }
      },
      apply: function (preview, ctx) { return enableExtension(preview.input.id, { actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id }) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.disableExtension', {
      title: 'Disable Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        return {
          ok: true,
          risk: 'edit',
          title: 'Disable extension: ' + input.id,
          input: clone(input),
          changes: [{ type: 'extension', id: input.id, action: 'disable' }],
        }
      },
      apply: function (preview, ctx) { return disableExtension(preview.input.id, { actor: ctx && ctx.actor, agentId: ctx && ctx.agent && ctx.agent.id }) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.addPanelToDock', {
      title: 'Add Panel To Dock',
      risk: 'edit',
      exposeToModel: false,
      preview: previewAddPanelToDock,
      apply: applyAddPanelToDock,
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
    aeditor.ai.operations.register('aeditor.removePanelFromDock', {
      title: 'Remove Panel From Dock',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        return {
          ok: true,
          risk: 'edit',
          title: 'Remove panel',
          input: clone(input),
          changes: [{ type: 'dockPanel', action: 'remove', panelId: input.panelId || null, dock: input.dock || null }],
        }
      },
      apply: function (preview) { return removePanelFromDock(preview.input) },
    }, { owner: 'aeditor.extensions', layer: 'builtin' })
  }

  function previewAddPanelToDock(input) {
    input = input || {}
    const errors = []
    const layoutName = input.layout || 'default'
    const dockName = input.dock || 'main'
    const component = input.component
    const layout = resolveLayout(input.layout)
    if (!layout) errors.push({ path: 'layout', message: 'Layout not registered: ' + layoutName })
    else if (!dockExists(layout.tree(), dockName)) errors.push({ path: 'dock', message: 'Dock not found: ' + dockName })
    if (!component) errors.push({ path: 'component', message: 'Component is required' })
    else if (!(aeditor.componentRegistration && aeditor.componentRegistration(component))) {
      errors.push({ path: 'component', message: 'Component not registered: ' + component })
    }
    return {
      ok: errors.length === 0,
      risk: 'edit',
      title: 'Add panel: ' + (component || ''),
      input: clone(input),
      changes: [{ type: 'dockPanel', dock: dockName, component: component }],
      errors: errors,
    }
  }

  function applyAddPanelToDock(preview) {
    if (preview && preview.ok === false) return { applied: false, ok: false, errors: preview.errors || [], preview: preview }
    const input = preview.input || {}
    try {
      const placed = placePanel(input)
      return Object.assign({ applied: true }, placed)
    } catch (err) {
      return { applied: false, ok: false, error: String(err && err.message || err) }
    }
  }

  function registerAiTools() {
    const ai = aeditor.ai
    if (!ai || !ai.tools) return
    ai.tools.register('aeditor.installExtension', {
      title: 'Install Editor Extension',
      description: 'Install a low-level AEditor extension manifest for commands, references, operations, settings, styles, or pre-registered component contributions. Agent-authored panels must be written as workspace files and added by registered component name.',
      schema: {
        type: 'object',
        required: ['manifest'],
        properties: {
          manifest: { type: 'object' },
        },
      },
      exposeToModel: false,
      preview: function (input, ctx) {
        return reviewInstall(input, {
          actor: ctx && ctx.actor,
          agentId: ctx && ctx.agent && ctx.agent.id,
          allowCode: false,
        })
      },
      apply: function (preview, ctx) {
        if (preview && preview.ok === false) return { applied: false, ok: false, errors: preview.errors || [], preview: preview }
        if (preview && preview.canApply === false) return { applied: false, ok: false, error: 'Extension install is not approved', preview: preview }
        return Object.assign({ applied: true }, installExtension(preview.manifest, {
          allowCode: false,
          actor: ctx && ctx.actor,
          agentId: ctx && ctx.agent && ctx.agent.id,
        }))
      },
    })
    ai.tools.register('aeditor.addPanelToDock', {
      title: 'Add Panel To Dock',
      description: 'Add an already registered component as a panel in a dock. This tool never accepts source code; create durable UI by registering a component from files, then add it here by component name.',
      schema: {
        type: 'object',
        required: ['dock', 'component'],
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit for the default layout.' },
          dock: { type: 'string', description: 'Dock name or id, for example editor, sidebar, properties, or bottom.' },
          component: { type: 'string', description: 'Registered component id.' },
          title: { type: 'string' },
          icon: { type: 'string' },
          props: { type: 'object' },
          transient: { type: 'boolean' },
        },
      },
      exposeToModel: false,
      preview: previewAddPanelToDock,
      apply: applyAddPanelToDock,
    })
  }

  aeditor.extensions = {
    preview: previewExtension,
    review: reviewInstall,
    installWithReview: installWithReview,
    install: installExtension,
    update: updateExtension,
    uninstall: uninstallExtension,
    enable: enableExtension,
    disable: disableExtension,
    setLayer: setLayer,
    setMaxLayer: setMaxLayer,
    disableLayer: disableLayer,
    enableLayer: enableLayer,
    removePanelFromDock: removePanelFromDock,
    safeMode: setSafeMode,
    boot: bootExtensions,
    list: listExtensions,
    get: getExtension,
    ownerFor: ownerFor,
    hashSource: sourceHash,
    permissions: extensionPermissions,
    configurePermissions: configurePermissions,
    configureStorage: configureStorage,
    save: saveExtensions,
    clearStored: clearStoredExtensions,
    registerLayout: registerLayout,
    registerAdapter: registerAdapter,
  }

  registerRecoveryComponent()
  registerAiOperations()
  registerAiTools()
})(window.aeditor = window.aeditor || {})
