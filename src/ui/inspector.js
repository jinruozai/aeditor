// aeditor.inspector — ordered selection + provider registry for generic inspectors.
;(function (aeditor) {
  'use strict'

  const providers = {}
  const providerMeta = {}
  const selectionSig = aeditor.signal([])
  const metaSig = aeditor.signal({})
  let formulaEvaluator = null

  function cloneTargets(targets) {
    if (targets == null) return []
    const list = Array.isArray(targets) ? targets : [targets]
    return list.filter(Boolean)
  }

  function targetType(target) {
    return target && (target.type || target.kind)
  }

  function registerProvider(type, provider, meta) {
    if (!type || typeof type !== 'string') throw new Error('inspector.registerProvider: type is required')
    if (!provider || typeof provider.inspect !== 'function') throw new Error('inspector.registerProvider: provider.inspect is required')
    const m = meta || {}
    if (providers[type] && !m.replace) throw new Error('inspector.registerProvider: duplicate provider "' + type + '"')
    providers[type] = provider
    providerMeta[type] = Object.assign({}, m)
    return function () { unregisterProvider(type, { owner: m.owner }) }
  }

  function unregisterProvider(type, meta) {
    const m = meta || {}
    if (!providers[type]) return false
    if (m.owner && providerMeta[type] && providerMeta[type].owner !== m.owner) {
      throw new Error('inspector.unregisterProvider: owner mismatch for "' + type + '"')
    }
    delete providers[type]
    delete providerMeta[type]
    return true
  }

  function unregisterOwner(owner) {
    const removed = []
    Object.keys(providerMeta).forEach(function (type) {
      if (providerMeta[type].owner === owner) {
        unregisterProvider(type, { owner: owner })
        removed.push(type)
      }
    })
    return removed
  }

  function providerFor(targets) {
    const list = cloneTargets(targets)
    if (!list.length) return null
    const primaryType = targetType(list[0])
    if (!primaryType) return null
    const provider = providers[primaryType]
    if (!provider) return null
    if (typeof provider.accept === 'function') {
      return safe('accept', primaryType, function () { return provider.accept(list) }) ? provider : null
    }
    for (let i = 1; i < list.length; i++) {
      if (targetType(list[i]) !== primaryType) return null
    }
    return provider
  }

  function inspect(targets, ctx) {
    const list = cloneTargets(targets)
    const provider = providerFor(list)
    if (!provider) return null
    const type = targetType(list[0])
    const raw = safe('inspect', type, function () { return provider.inspect(list, Object.assign({
      targets: list,
      primary: list[0],
      valueForChange: valueForChange,
    }, ctx || {})) })
    if (!raw) return null
    const out = Object.assign({}, raw)
    out.provider = provider
    out.type = type
    out.targets = list
    out.values = valuesFor(out, list)
    return out
  }

  function valuesFor(inspection, targets) {
    if (inspection.values) return inspection.values
    if (typeof inspection.read === 'function') {
      return targets.map(function (target, index) { return inspection.read(target, index, targets) })
    }
    return targets.map(function (target) { return target.value || target.data || target })
  }

  function hasField(inspection, field, value, index) {
    if (typeof inspection.hasField === 'function') {
      return !!safe('hasField', inspection.type, function () {
        return inspection.hasField(inspection.targets[index], field, value, index)
      })
    }
    return !!value && Object.prototype.hasOwnProperty.call(value, field)
  }

  function canWrite(inspection, field, value, index, rawField) {
    if (inspection.readonly || !inspection.write) return false
    if (rawField && rawField.disabled === true) return false
    if (typeof inspection.canWrite === 'function') {
      return !!safe('canWrite', inspection.type, function () {
        return inspection.canWrite(inspection.targets[index], field, value, index)
      })
    }
    return true
  }

  function safe(action, type, fn) {
    const source = { scope: 'inspector', action: action, type: type }
    return aeditor.safeCall ? aeditor.safeCall(source, fn) : fn()
  }

  function canEditField(inspection, field, values, rawField) {
    const list = values || []
    if (!list.length) return false
    for (let i = 0; i < list.length; i++) {
      if (!hasField(inspection, field, list[i], i)) return false
      if (!canWrite(inspection, field, list[i], i, rawField)) return false
    }
    return true
  }

  function literalChange(field, value) {
    return { field: field, mode: 'literal', value: value }
  }

  function valueForChange(change, target, index, ctx) {
    if (!change || change.mode === 'literal') return change ? change.value : undefined
    if (change.mode === 'formula' && formulaEvaluator) return formulaEvaluator(change, target, index, ctx || {})
    throw new Error('inspector.valueForChange: unsupported change mode "' + change.mode + '"')
  }

  function select(targets, meta) {
    selectionSig.set(cloneTargets(targets))
    metaSig.set(meta || {})
    if (aeditor.bus && aeditor.bus.emit) aeditor.bus.emit('inspector:selection', selectionSig.peek())
  }

  function clear() {
    select([], {})
  }

  aeditor.inspector = {
    selection: selectionSig,
    meta: metaSig,
    select: select,
    clear: clear,
    registerProvider: registerProvider,
    unregisterProvider: unregisterProvider,
    unregisterOwner: unregisterOwner,
    providerFor: providerFor,
    inspect: inspect,
    listProviders: function () { return Object.keys(providers).sort() },
    providerMeta: function (type) { return Object.assign({}, providerMeta[type] || {}) },
    canEditField: canEditField,
    literalChange: literalChange,
    valueForChange: valueForChange,
    setFormulaEvaluator: function (fn) { formulaEvaluator = fn || null },
  }
})(window.aeditor = window.aeditor || {})
