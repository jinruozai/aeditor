// UI library scope ownership.
//
// A panel root can own transient UI that is mounted outside its DOM subtree
// (tooltips, popovers, menus in the portal layer). When that panel is
// detached or disposed, the scope closes those transient overlays at once.
;(function (aiditor) {
  'use strict'
  const ui = aiditor.ui = aiditor.ui || {}

  function makeScope(root) {
    const scope = {
      root: root,
      overlays: [],
      activeBound: false,
    }
    root.__aiditorUiScope = scope
    ui.collect(root, function () {
      ui.closeScope(scope)
      if (root.__aiditorUiScope === scope) root.__aiditorUiScope = null
    })
    return scope
  }

  function scopeOf(node) {
    let n = node
    while (n) {
      if (n.__aiditorUiScope) return n.__aiditorUiScope
      n = n.parentNode
    }
    return null
  }

  function removeEntry(entry) {
    const list = entry.scope.overlays
    const i = list.indexOf(entry)
    if (i >= 0) list.splice(i, 1)
  }

  function closeEntry(entry) {
    if (entry.closed) return
    entry.closed = true
    removeEntry(entry)
    entry.close()
  }

  ui.scope = function (root, opts) {
    const scope = root.__aiditorUiScope || makeScope(root)
    const o = opts || {}
    if (o.active && !scope.activeBound) {
      scope.activeBound = true
      ui.collect(root, aiditor.effect(function () {
        if (!o.active()) ui.closeScopeTransient(scope)
      }))
    }
    return scope
  }

  ui.scopeOf = scopeOf

  ui.registerScopedOverlay = function (anchor, close, opts) {
    const o = opts || {}
    const scope = o.scope || scopeOf(anchor)
    if (!scope) return function () {}
    const entry = {
      scope: scope,
      close: close,
      transient: o.transient !== false,
      closed: false,
    }
    scope.overlays.push(entry)
    return function () {
      if (entry.closed) return
      entry.closed = true
      removeEntry(entry)
    }
  }

  ui.closeScopeTransient = function (scopeOrRoot) {
    const scope = scopeOrRoot && scopeOrRoot.overlays ? scopeOrRoot : scopeOf(scopeOrRoot)
    if (!scope) return
    const list = scope.overlays.slice()
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].transient) closeEntry(list[i])
    }
  }

  ui.closeScope = function (scopeOrRoot) {
    const scope = scopeOrRoot && scopeOrRoot.overlays ? scopeOrRoot : scopeOf(scopeOrRoot)
    if (!scope) return
    const list = scope.overlays.slice()
    for (let i = list.length - 1; i >= 0; i--) closeEntry(list[i])
  }
})(window.aiditor = window.aiditor || {})
