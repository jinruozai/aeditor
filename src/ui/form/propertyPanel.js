// EF.ui.propertyPanel — schema-driven form for editing one or more objects.
// One panel can edit a single object (length-1 targets) or batch-edit many;
// fields that disagree across targets render as MIXED with a visual cue,
// and a user edit fans out to every target.
//
// opts:
//   targets:  signal<T[]> | T[]                       required (single-edit = [obj])
//   schema:   signal<StructDef> | StructDef           field shape; rare changes rebuild rows
//   onChange?:(field, newValue, targets) => void      app persistence; if omitted writes are
//                                                     fan-out into `targets` directly
//   disabled?:signal<boolean> | boolean               toggles `inert` on the root
//   ctx?:     any                                     forwarded to editorFor
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  ui.propertyPanel = function (opts) {
    const o = opts || {}
    const targets   = ui.isSignal(o.targets) ? o.targets : EF.signal(o.targets || [])
    const schemaSig = ui.isSignal(o.schema)  ? o.schema  : EF.signal(o.schema  || {})
    const disabled  = ui.asSig(o.disabled != null ? o.disabled : false)
    const onChange  = typeof o.onChange === 'function' ? o.onChange : null
    const ctx       = o.ctx

    const root = ui.h('div', 'ef-ui-property-panel')
    ui.bind(root, disabled, function (v) { root.toggleAttribute('inert', !!v) })

    // Per-field composite: unanimous value, or MIXED when targets disagree.
    // Length-1 returns the single target verbatim so the ref stays stable
    // and slot derived signals don't notify spuriously.
    const composite = EF.derived(function () {
      const arr    = targets() || []
      const schema = schemaSig() || {}
      if (arr.length === 0) return {}
      if (arr.length === 1) return arr[0] || {}
      const out = {}
      Object.keys(schema).forEach(function (key) {
        const v0 = arr[0] ? arr[0][key] : undefined
        let mixed = false
        for (let i = 1; i < arr.length; i++) {
          if (!ui.equalValues(v0, arr[i] ? arr[i][key] : undefined)) { mixed = true; break }
        }
        out[key] = mixed ? ui.MIXED : v0
      })
      return out
    })
    ui.collect(root, composite.dispose)

    function fanOut(field, nv) {
      if (onChange) { onChange(field, nv, targets.peek()); return }
      const arr = (targets.peek() || []).map(function (t) {
        const next = Object.assign({}, t || {})
        next[field] = nv
        return next
      })
      targets.set(arr)
    }

    let current = null
    const stopSchema = EF.effect(function () {
      const schema = schemaSig() || {}
      EF.untracked(function () {
        if (current) ui.dispose(current)
        const fields = Object.keys(schema).map(function (fname) {
          const raw   = schema[fname]
          const subFd = ui.resolveFieldDef(typeof raw === 'string' ? { type: raw } : raw)
          return {
            key:    fname,
            label:  fname,
            editor: function (slotSig, write, innerCtx) { return slotEditor(slotSig, write, innerCtx, subFd) },
          }
        })
        current = ui.structInput({
          value:    composite,
          fields:   fields,
          onChange: function (_next, key, nv) { fanOut(key, nv) },
          ctx:      ctx,
        })
        root.appendChild(current)
      })
    })
    ui.collect(root, stopSchema)
    ui.collect(root, function () { if (current) ui.dispose(current) })

    return root
  }

  // Slot wrapper: hides MIXED from the editor (substitutes a type-blank) and
  // carries the `data-mixed` attribute so CSS can paint the indicator.
  function slotEditor(slotSig, write, innerCtx, fieldDef) {
    const editorSig = EF.derived(function () {
      const v = slotSig()
      return ui.isMixed(v) ? ui.blankFor(fieldDef) : v
    })
    const editorEl = ui.editorFor(fieldDef, editorSig, write, innerCtx)
    const slot = ui.h('div', 'ef-ui-slot')
    slot.appendChild(editorEl)
    ui.bind(slot, slotSig, function (v) { slot.toggleAttribute('data-mixed', ui.isMixed(v)) })
    ui.collect(slot, editorSig.dispose)
    ui.collect(slot, function () { ui.dispose(editorEl) })
    return slot
  }
})(window.EF = window.EF || {})
