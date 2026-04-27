// EF.ui.MIXED — sentinel for "selected targets disagree on this field".
// Used by ui.propertyPanel when editing N>1 objects through one form: a
// per-field composite is MIXED if its value differs across targets.
//
// Editors don't see MIXED — propertyPanel substitutes a type-appropriate
// blank (via ui.blankFor) before the value reaches the editor and carries
// the visual indicator on a wrapping `.ef-ui-slot[data-mixed]` element.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.MIXED = Symbol('ef.mixed')
  ui.isMixed = function (v) { return v === ui.MIXED }

  // Per-type "blank". Used by propertyPanel when feeding MIXED through a
  // normal editor: the editor needs a renderable value, not the sentinel.
  ui.blankFor = function (fieldDef) {
    const fd = fieldDef || {}
    if (fd.default !== undefined) return cloneJSON(fd.default)
    const base = fd.base_type
    if (base === 'int' || base === 'float') return 0
    if (base === 'array')                   return []
    if (base === 'struct')                  return {}
    if (base === 'var')                     return null
    return ''
  }

  // Structural equality for plain JSON-serializable values. § 4.8 mandates
  // panel/widget props are JSON-serializable, so JSON-compare is enough.
  ui.equalValues = function (a, b) {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== 'object' || typeof b !== 'object') return false
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function cloneJSON(v) {
    if (v == null || typeof v !== 'object') return v
    return JSON.parse(JSON.stringify(v))
  }
})(window.EF = window.EF || {})
