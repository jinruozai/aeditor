// aeditor.ai Reference / Operation protocol.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  const referenceProviders = {}
  const referenceProviderMeta = {}
  const operations = {}
  const operationMeta = {}
  const previews = {}
  let transactionDriver = null
  let nextPreviewId = 1

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function keys(obj) { return Object.keys(obj) }

  function inferResolver(uri, kind) {
    const text = String(uri || '')
    const idx = text.indexOf('://')
    if (idx > 0) return text.slice(0, idx)
    const dot = String(kind || '').indexOf('.')
    return dot > 0 ? String(kind).slice(0, dot) : (kind || 'reference')
  }

  function normalizeReference(ref) {
    if (!ref) return null
    if (typeof ref === 'string') ref = { uri: ref }
    const uri = String(ref.uri || ref.id || '')
    if (!uri) return null
    const kind = ref.kind || ref.type || inferResolver(uri, ref.kind)
    return {
      resolver: ref.resolver || inferResolver(uri, kind),
      uri: uri,
      kind: kind,
      title: ref.title || ref.label || uri,
      summary: ref.summary || '',
      meta: clone(ref.meta || {}),
      schema: clone(ref.schema || null),
      capabilities: clone(ref.capabilities || []),
      tools: clone(ref.tools || []),
    }
  }

  function normalizeReferences(value) {
    if (!value) return []
    const list = Array.isArray(value) ? value : [value]
    const out = []
    for (let i = 0; i < list.length; i++) {
      const ref = normalizeReference(list[i])
      if (ref) out.push(ref)
    }
    return out
  }

  function providerFor(ref) {
    const r = normalizeReference(ref)
    return r ? referenceProviders[r.resolver] || null : null
  }

  function withRefContext(ctx) {
    return Object.assign({ ai: ai, actor: 'user' }, ctx || {})
  }

  function safeProviderCall(ref, name, args, ctx) {
    const provider = providerFor(ref)
    const fn = provider && provider[name]
    if (!fn) return null
    return fn.apply(provider, args.concat([withRefContext(ctx)]))
  }

  function resourceResolverRead(ref, options, ctx) {
    const r = normalizeReference(ref)
    const resolver = r && ai.getResourceResolver && ai.getResourceResolver(r.resolver || r.kind)
    if (!resolver || !resolver.resolve) return null
    return resolver.resolve(r, Object.assign({ options: options || {} }, ctx || {}))
  }

  function normalizeMeta(meta) {
    meta = meta || {}
    const out = {}
    if (meta.owner != null) out.owner = String(meta.owner)
    if (meta.layer != null) out.layer = String(meta.layer)
    return out
  }

  function registerReferenceProvider(name, provider, meta) {
    referenceProviders[name] = Object.assign({ id: name }, provider || {})
    referenceProviderMeta[name] = normalizeMeta(meta)
    return referenceProviders[name]
  }

  function getReferenceProvider(name) {
    return referenceProviders[name] || null
  }

  function unregisterReferenceProvider(name, meta) {
    if (!referenceProviders[name]) return false
    const existing = referenceProviderMeta[name] || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('unregisterReferenceProvider: owner mismatch for "' + name + '"')
    delete referenceProviders[name]
    delete referenceProviderMeta[name]
    return true
  }

  function unregisterReferenceProviderOwner(owner) {
    const removed = []
    keys(referenceProviderMeta).forEach(function (name) {
      if (referenceProviderMeta[name].owner === owner) {
        delete referenceProviders[name]
        delete referenceProviderMeta[name]
        removed.push(name)
      }
    })
    return removed
  }

  function describeReference(ref, ctx) {
    const r = normalizeReference(ref)
    if (!r) return null
    const described = safeProviderCall(r, 'describe', [r], ctx)
    return described == null ? r : described
  }

  function readReference(ref, options, ctx) {
    const r = normalizeReference(ref)
    if (!r) return null
    const providerRead = safeProviderCall(r, 'read', [r, options || {}], ctx)
    if (providerRead != null) return providerRead
    const resolved = resourceResolverRead(r, options || {}, ctx)
    return resolved != null ? resolved : r
  }

  function referenceSchema(ref, ctx) {
    const r = normalizeReference(ref)
    if (!r) return null
    const schema = safeProviderCall(r, 'schema', [r], ctx)
    return schema != null ? schema : r.schema
  }

  function referenceCapabilities(ref, ctx) {
    const r = normalizeReference(ref)
    if (!r) return []
    const caps = safeProviderCall(r, 'capabilities', [r], ctx)
    return caps != null ? caps : (r.capabilities || [])
  }

  function snapshotReference(ref, ctx) {
    const r = normalizeReference(ref)
    if (!r) return null
    return safeProviderCall(r, 'snapshot', [r], ctx)
  }

  function searchReferences(query, ctx) {
    const out = []
    const names = keys(referenceProviders)
    for (let i = 0; i < names.length; i++) {
      const provider = referenceProviders[names[i]]
      if (!provider.search) continue
      const found = provider.search(query || {}, withRefContext(ctx)) || []
      const refs = normalizeReferences(found)
      for (let j = 0; j < refs.length; j++) out.push(refs[j])
    }
    return out
  }

  function selectedReferences(ctx) {
    const out = []
    const names = keys(referenceProviders)
    for (let i = 0; i < names.length; i++) {
      const provider = referenceProviders[names[i]]
      if (!provider.selection) continue
      const refs = normalizeReferences(provider.selection(withRefContext(ctx)))
      for (let j = 0; j < refs.length; j++) out.push(refs[j])
    }
    return out
  }

  function registerOperation(name, spec, meta) {
    operations[name] = Object.assign({ id: name }, spec || {})
    operationMeta[name] = normalizeMeta(meta)
    return operations[name]
  }

  function getOperation(name) {
    return operations[name] || null
  }

  function unregisterOperation(name, meta) {
    if (!operations[name]) return false
    const existing = operationMeta[name] || {}
    if (meta && meta.owner != null && existing.owner !== meta.owner)
      throw new Error('unregisterOperation: owner mismatch for "' + name + '"')
    delete operations[name]
    delete operationMeta[name]
    return true
  }

  function unregisterOperationOwner(owner) {
    const removed = []
    keys(operationMeta).forEach(function (name) {
      if (operationMeta[name].owner === owner) {
        delete operations[name]
        delete operationMeta[name]
        removed.push(name)
      }
    })
    return removed
  }

  function operationRisk(op, input, ctx) {
    const spec = getOperation(op)
    if (!spec) return 'edit'
    if (typeof spec.risk === 'function') return spec.risk(input || {}, withOperationContext(op, ctx))
    return spec.risk || 'edit'
  }

  function makePreviewId() {
    return 'opv_' + Date.now().toString(36) + '_' + nextPreviewId++
  }

  function normalizePreview(op, input, raw, ctx) {
    const obj = raw && typeof raw === 'object' ? raw : { result: raw }
    const id = obj.id || makePreviewId()
    const risk = obj.risk || operationRisk(op, input, ctx)
    const preview = Object.assign({}, obj, {
      id: id,
      op: op,
      input: clone(input || {}),
      ok: obj.ok !== false,
      risk: risk,
      title: obj.title || (getOperation(op) && getOperation(op).title) || op,
      summary: obj.summary || '',
      createdAt: obj.createdAt || Date.now(),
    })
    previews[id] = preview
    return preview
  }

  function runTransaction(label, fn, meta) {
    if (transactionDriver && typeof transactionDriver.run === 'function') {
      return transactionDriver.run(label || 'AI operation', fn, meta || {})
    }
    return fn()
  }

  function withOperationContext(op, ctx) {
    return Object.assign({
      ai: ai,
      actor: 'user',
      op: op,
      transaction: runTransaction,
      readReference: readReference,
      schema: referenceSchema,
      capabilities: referenceCapabilities,
    }, ctx || {})
  }

  function previewOperation(opOrSpec, inputArg, ctx) {
    const specInput = typeof opOrSpec === 'object' && opOrSpec
      ? opOrSpec
      : { op: opOrSpec, input: inputArg }
    const op = specInput.op || specInput.operation
    const input = specInput.input || specInput.args || {}
    const spec = getOperation(op)
    if (!spec) throw new Error('Operation not found: ' + op)
    const fn = spec.preview || spec.plan || spec.run
    if (!fn) throw new Error('Operation has no preview: ' + op)
    const raw = fn(input, withOperationContext(op, ctx))
    return normalizePreview(op, input, raw, ctx)
  }

  function resolvePreview(spec) {
    if (!spec) return null
    if (typeof spec === 'string') return previews[spec] || null
    if (spec.previewId) return previews[spec.previewId] || null
    if (spec.id && previews[spec.id]) return previews[spec.id]
    return spec
  }

  function applyOperation(previewOrSpec, ctx) {
    let preview = resolvePreview(previewOrSpec)
    if (!preview && previewOrSpec && (previewOrSpec.op || previewOrSpec.operation)) {
      preview = previewOperation(previewOrSpec, null, ctx)
    }
    if (!preview) throw new Error('Operation preview not found')
    if (preview.ok === false) return { applied: false, ok: false, error: 'Preview is not valid', preview: preview }
    const op = preview.op || preview.operation
    const spec = getOperation(op)
    if (!spec || !spec.apply) throw new Error('Operation has no apply: ' + op)
    const opCtx = withOperationContext(op, ctx)
    const apply = function () { return spec.apply(preview, opCtx) }
    const result = spec.transaction === false
      ? apply()
      : runTransaction(preview.title || op, apply, { source: 'aeditor.ai', op: op, previewId: preview.id, risk: preview.risk })
    if (result && typeof result === 'object') return Object.assign({ applied: true, previewId: preview.id }, result)
    return { applied: true, previewId: preview.id, result: result }
  }

  function configureTransactions(driver) {
    transactionDriver = driver || null
    return transactionDriver
  }

  function canUseOperation(actor, agentId, op, phase, details) {
    if (ai.canUseOperation) return ai.canUseOperation(actor, agentId, op, phase, details || {})
    if (ai.canUseTool) return ai.canUseTool(actor, agentId, 'editor.' + (phase === 'apply' ? 'applyOperation' : 'previewOperation'), phase === 'apply' ? 'apply' : 'call')
    return true
  }

  function registerEditorTools() {
    if (!ai.registerTool) return
    ai.registerTool('aeditor.readReference', {
      title: 'Read Editor Reference',
      description: 'Read a referenced editor object. Use this before editing so schemas, values, and summaries are grounded in the host editor.',
      schema: {
        type: 'object',
        required: ['uri'],
        properties: {
          uri: { type: 'string' },
          kind: { type: 'string' },
          projection: { type: 'string' },
          page: { type: 'object' },
        },
      },
      run: function (args, ctx) {
        return readReference(args, args, ctx)
      },
    })
    ai.registerTool('aeditor.searchReferences', {
      title: 'Search Editor References',
      description: 'Search host-provided editor references by query and optional kind.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          kind: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      run: function (args, ctx) {
        return searchReferences(args || {}, ctx)
      },
    })
    ai.registerTool('aeditor.getSelection', {
      title: 'Get Editor Selection',
      description: 'Return current host editor selection as references.',
      schema: { type: 'object', properties: {} },
      run: function (args, ctx) {
        return selectedReferences(ctx)
      },
    })
    ai.registerTool('aeditor.getCapabilities', {
      title: 'Get Reference Capabilities',
      description: 'Return schemas and operations available for a reference.',
      schema: {
        type: 'object',
        required: ['uri'],
        properties: {
          uri: { type: 'string' },
          kind: { type: 'string' },
        },
      },
      run: function (args, ctx) {
        const ref = normalizeReference(args)
        return {
          ref: ref,
          schema: referenceSchema(ref, ctx),
          capabilities: referenceCapabilities(ref, ctx),
        }
      },
    })
    ai.registerTool('aeditor.previewOperation', {
      title: 'Preview Editor Operation',
      description: 'Preview a registered editor operation. Never apply invalid previews; repair input from returned validation errors.',
      schema: {
        type: 'object',
        required: ['op', 'input'],
        properties: {
          op: { type: 'string' },
          input: { type: 'object' },
        },
      },
      run: function (args, ctx) {
        const op = args && (args.op || args.operation)
        if (!canUseOperation(ctx && ctx.actor || 'user', ctx && ctx.agent && ctx.agent.id, op, 'preview', { input: args && args.input })) {
          return { ok: false, error: 'Operation preview not allowed: ' + op }
        }
        return previewOperation(args, null, ctx)
      },
    })
    ai.registerTool('aeditor.applyOperation', {
      title: 'Apply Editor Operation',
      description: 'Preview and apply a registered editor operation through the host transaction bridge.',
      schema: {
        type: 'object',
        required: ['op', 'input'],
        properties: {
          op: { type: 'string' },
          input: { type: 'object' },
          previewId: { type: 'string' },
        },
      },
      preview: function (args, ctx) {
        const op = args && (args.op || args.operation)
        if (args && args.previewId && previews[args.previewId]) return previews[args.previewId]
        if (!canUseOperation(ctx && ctx.actor || 'user', ctx && ctx.agent && ctx.agent.id, op, 'preview', { input: args && args.input })) {
          return { ok: false, op: op, error: 'Operation preview not allowed: ' + op }
        }
        return previewOperation(args, null, ctx)
      },
      apply: function (preview, ctx) {
        const op = preview && (preview.op || preview.operation)
        if (!canUseOperation(ctx && ctx.actor || 'user', ctx && ctx.agent && ctx.agent.id, op, 'apply', { preview: preview, risk: preview && preview.risk })) {
          return { applied: false, ok: false, error: 'Operation apply not allowed: ' + op, preview: preview }
        }
        return applyOperation(preview, ctx)
      },
    })
  }

  ai.references = {
    register: registerReferenceProvider,
    unregister: unregisterReferenceProvider,
    unregisterOwner: unregisterReferenceProviderOwner,
    get: getReferenceProvider,
    list: function (filter) {
      const names = keys(referenceProviders)
      if (!filter) return names
      return names.filter(function (name) {
        const meta = referenceProviderMeta[name] || {}
        if (filter.owner != null && meta.owner !== filter.owner) return false
        if (filter.layer != null && meta.layer !== filter.layer) return false
        return true
      })
    },
    meta: function (name) { return clone(referenceProviderMeta[name] || {}) },
    normalize: normalizeReference,
    normalizeAll: normalizeReferences,
    describe: describeReference,
    read: readReference,
    schema: referenceSchema,
    capabilities: referenceCapabilities,
    snapshot: snapshotReference,
    search: searchReferences,
    selection: selectedReferences,
  }
  ai.operations = {
    register: registerOperation,
    unregister: unregisterOperation,
    unregisterOwner: unregisterOperationOwner,
    get: getOperation,
    list: function (filter) {
      const names = keys(operations)
      if (!filter) return names
      return names.filter(function (name) {
        const meta = operationMeta[name] || {}
        if (filter.owner != null && meta.owner !== filter.owner) return false
        if (filter.layer != null && meta.layer !== filter.layer) return false
        return true
      })
    },
    meta: function (name) { return clone(operationMeta[name] || {}) },
    risk: operationRisk,
    preview: previewOperation,
    apply: applyOperation,
    getPreview: function (id) { return previews[id] || null },
  }
  ai.transactions = {
    configure: configureTransactions,
    run: runTransaction,
  }

  ai.normalizeReference = normalizeReference
  ai.normalizeReferences = normalizeReferences
  ai.registerReferenceProvider = registerReferenceProvider
  ai.unregisterReferenceProvider = unregisterReferenceProvider
  ai.unregisterReferenceProviderOwner = unregisterReferenceProviderOwner
  ai.getReferenceProvider = getReferenceProvider
  ai.readReference = readReference
  ai.referenceSchema = referenceSchema
  ai.referenceCapabilities = referenceCapabilities
  ai.registerOperation = registerOperation
  ai.unregisterOperation = unregisterOperation
  ai.unregisterOperationOwner = unregisterOperationOwner
  ai.getOperation = getOperation
  ai.previewOperation = previewOperation
  ai.applyOperation = applyOperation
  ai.configureTransactions = configureTransactions

  registerEditorTools()
})(window.aeditor = window.aeditor || {})
