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

  /**
   * @aeditorApi aeditor.inspector.registerProvider
   * @group inspector
   * @layer core-ui
   * @kind js-api
   * @signature aeditor.inspector.registerProvider(type, provider, meta?)
   * @summary Register the editor-owned provider that turns selected targets of one type into an inspector schema, values, and write handlers.
   * @param {string} type - Target type matched against target.type or target.kind.
   * @param {object} provider - Provider with inspect(targets, ctx), plus optional accept(targets).
   * @param {object} meta - Optional owner/layer metadata; pass { replace: true } only when intentionally replacing an existing provider.
   * @returns {Function} unregister callback.
   * @example
   * aeditor.inspector.registerProvider('cube', {
   *   inspect: function (targets) {
   *     return {
   *       schema: {
   *         x: { type: 'number', label: 'X', step: 0.1 },
   *         color: { type: 'color', label: 'Color' },
   *       },
   *       values: targets.map(function (target) { return target.value }),
   *       write: function (field, change, ctx) {
   *         ctx.targets.forEach(function (target, index) {
   *           target.value[field] = ctx.valueForChange(change, target, index)
   *         })
   *       },
   *     }
   *   },
   * })
   * @wrong
   * aeditor.inspector.registerProvider({
   *   id: 'cube',
   *   getProperties: function () {},
   *   patchProperties: function () {},
   * })
   * @related aeditor.inspector.select,aeditor.inspector.refresh,aeditor.ui.propertyForm
   */
  function registerProvider(type, provider, meta) {
    if (!type || typeof type !== 'string') throw new Error('inspector.registerProvider: type is required')
    if (!provider || typeof provider.inspect !== 'function') throw new Error('inspector.registerProvider: provider.inspect is required')
    const m = aeditor.runtime && aeditor.runtime.registrationMeta ? aeditor.runtime.registrationMeta(meta) : (meta || {})
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

  function emitSelection() {
    if (aeditor.bus && aeditor.bus.emit) aeditor.bus.emit('inspector:selection', selectionSig.peek())
  }

  /**
   * @aeditorApi aeditor.inspector.select
   * @group inspector
   * @layer core-ui
   * @kind js-api
   * @signature aeditor.inspector.select(targets, meta?)
   * @summary Set the ordered inspector selection. The first target is primary; multi-edit uses only fields present and writable on every target.
   * @param {object|object[]} targets - One target or ordered targets; each target should include type or kind.
   * @param {object} meta - Optional selection metadata for the host/editor.
   * @returns {void} No return value.
   * @example
   * aeditor.inspector.select([
   *   { type: 'cube', id: 'cube-1', value: cubeState },
   * ])
   * @related aeditor.inspector.registerProvider,aeditor.inspector.refresh
   */
  function select(targets, meta) {
    selectionSig.set(cloneTargets(targets))
    metaSig.set(meta || {})
    emitSelection()
  }

  /**
   * @aeditorApi aeditor.inspector.refresh
   * @group inspector
   * @layer core-ui
   * @kind js-api
   * @signature aeditor.inspector.refresh()
   * @summary Notify inspector panels to re-read the current selection after external state changes.
   * @returns {void} No return value.
   * @example
   * cubeState.color = '#ffcc00'
   * aeditor.inspector.refresh()
   * @related aeditor.inspector.select,aeditor.inspector.registerProvider
   */
  function refresh() {
    selectionSig.set(selectionSig.peek().slice())
    emitSelection()
  }

  function clear() {
    select([], {})
  }

  aeditor.inspector = {
    selection: selectionSig,
    meta: metaSig,
    select: select,
    refresh: refresh,
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
  if (aeditor.runtime && aeditor.runtime.registerOwnerCleanup) {
    aeditor.runtime.registerOwnerCleanup(function (owner) {
      return { inspector: unregisterOwner(owner) }
    })
  }
})(window.aeditor = window.aeditor || {})
