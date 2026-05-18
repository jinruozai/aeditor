// aiditor.ui.renderUITree — instantiate a tree of components from a spec.
//
//   ui.renderUITree(node, ctx) → HTMLElement
//
// Spec:
//   TreeNode = {
//     id?:       string,                       // editor-side stable id
//     component: string,                       // registered component name
//     props?:    object,                       // literal prop values
//     bindings?: { [propKey]: { source: 'field', field: string } },
//     layout?:   object,                       // parent container interprets
//     children?: TreeNode[],
//   }
//
//   ctx = {
//     data?: signal<object>,                   // bindings resolve against this
//   }
//
// Each node is materialized via spec.factory(propsSig, ctx). propsSig is a
// derived signal that merges literal props with values pulled from ctx.data
// according to `bindings`. If a bound field's data source is missing the
// prop is undefined (component decides whether to no-op or render blank).
//
// Every UI tree node may own children. Components only render their body;
// child layout is a node-level concern. Components that need a custom child
// layout provide `appendChild(parentEl, childEl, childLayout)`. Everything
// else gets the default overlay child layer.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  ui.renderUITree = function renderUITree(node, ctx) {
    if (!node) return ui.h('div', 'aiditor-ui-tree-empty')
    const spec = aiditor.resolveComponent(node.component)
    const propsSig = buildPropsSig(node, ctx)
    const bodyEl = spec.factory(propsSig, ctx || {})
    const el = ui.h('div', 'aiditor-ui-node')
    if (propsSig.dispose) ui.collect(el, propsSig.dispose)
    el.dataset.efNodeId = node.id || ''
    const body = ui.h('div', 'aiditor-ui-node-body')
    body.appendChild(bodyEl)
    ui.collect(el, function () { ui.dispose(bodyEl) })
    el.appendChild(body)

    if (node.children && node.children.length) {
      const append = typeof spec.appendChild === 'function'
        ? function (childEl, layout) { spec.appendChild(bodyEl, childEl, layout) }
        : function (childEl, layout) { appendOverlay(el, childEl, layout) }
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i]
        const childEl = renderUITree(child, ctx)
        append(childEl, child.layout || null)
        ui.collect(el, function (c) {
          return function () { ui.dispose(c) }
        }(childEl))
      }
    }
    return el
  }

  function buildPropsSig(node, ctx) {
    const literal  = node.props || {}
    const bindings = node.bindings || {}
    const bKeys    = Object.keys(bindings)
    const dataSig  = ctx && ctx.data
    if (bKeys.length === 0) return aiditor.signal(literal)
    return aiditor.derived(function () {
      const out = Object.assign({}, literal)
      const data = dataSig ? dataSig() : null
      for (let i = 0; i < bKeys.length; i++) {
        const k = bKeys[i]
        const b = bindings[k]
        if (b && b.source === 'field') {
          out[k] = data ? data[b.field] : undefined
        }
      }
      return out
    })
  }

  function appendOverlay(parent, child, layout) {
    let layer = parent.querySelector(':scope > .aiditor-ui-node-children')
    if (!layer) {
      layer = ui.h('div', 'aiditor-ui-node-children')
      parent.appendChild(layer)
    }
    const slot = ui.h('div', 'aiditor-ui-abs-slot')
    ui.layoutRect.applyToSlot(slot, layout || ui.layoutRect.identity())
    slot.appendChild(child)
    layer.appendChild(slot)
  }

  // Helper for component factories that wrap a ui.* primitive expecting
  // per-prop signals. Returns `{ key: derived(() => propsSig().key) }`.
  ui.liftProps = function liftProps(propsSig, keys) {
    const out = {}
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      out[k] = aiditor.derived(function () { const p = propsSig() || {}; return p[k] })
    }
    return out
  }
})(window.aiditor = window.aiditor || {})
