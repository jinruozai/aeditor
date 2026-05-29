// Built-in panel list: searchable palette for registered panel components.
;(function (aiditor) {
  'use strict'

  const ui = aiditor.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function cloneData(value) {
    if (value == null) return value
    if (typeof structuredClone === 'function') return structuredClone(value)
    return JSON.parse(JSON.stringify(value))
  }

  function titleOf(item) {
    return item.label || item.title || item.name
  }

  function iconOf(item) {
    const defaults = aiditor.componentDefaults(item.name)
    return item.icon || defaults.icon || 'columns'
  }

  function panelItems() {
    return aiditor.listComponents()
      .filter(function (item) { return item.category === 'panel' && item.palette !== false })
      .map(function (item) {
        const defaults = aiditor.componentDefaults(item.name)
        return {
          name: item.name,
          label: titleOf(item),
          icon: iconOf(item),
          title: defaults.title || titleOf(item),
          props: defaults.props || {},
          toolbarItems: defaults.toolbarItems || null,
          layer: item.layer || '',
          owner: item.owner || '',
        }
      })
      .sort(function (a, b) { return String(a.label).localeCompare(String(b.label)) })
  }

  function panelData(item) {
    const data = {
      component: item.name,
      title: item.title || item.label,
      icon: item.icon,
      props: cloneData(item.props || {}),
    }
    if (item.toolbarItems) data.toolbarItems = cloneData(item.toolbarItems)
    return data
  }

  function resolveDockId(layout, idOrName) {
    if (!layout || !idOrName) return null
    const tree = layout.treeSig ? layout.treeSig.peek() : null
    let hit = null
    function walk(node) {
      if (!node || hit) return
      if (node.type === 'dock') {
        if (node.id === idOrName || node.name === idOrName) hit = node.id
        return
      }
      for (let i = 0; node.children && i < node.children.length; i++) walk(node.children[i])
    }
    walk(tree)
    return hit
  }

  function addPanel(item, targetDock, ctx) {
    const partial = panelData(item)
    const layout = ctx._layout
    const targetId = resolveDockId(layout, targetDock)
    if (targetId) return { panelId: layout.addPanel(targetId, partial) }
    return ctx.dock.addPanel(partial)
  }

  function beginDrag(ev, item, ctx) {
    const fn = aiditor._dock && aiditor._dock.beginExternalPanelDrag
    if (fn) fn(ev, panelData(item), ctx._layout, { label: item.label })
  }

  function factory(propsSig, ctx) {
    const props = propsSig.peek() || {}
    const root = ui.h('div', 'aiditor-panel-list')
    const querySig = aiditor.signal('')
    const itemsSig = aiditor.signal(panelItems())
    const filteredSig = aiditor.signal(itemsSig.peek())

    const toolbar = ui.h('div', 'aiditor-panel-list-toolbar')
    toolbar.appendChild(ui.searchInput({
      value: querySig,
      placeholder: props.placeholder || 'Search panels...',
    }))
    root.appendChild(toolbar)

    const list = ui.list({
      items: filteredSig,
      rowHeight: props.rowHeight || 36,
      multi: false,
      render: function (item) {
        const row = ui.h('div', 'aiditor-panel-list-row', { title: item.name })
        row.appendChild(ui.icon({ name: item.icon, size: 'sm' }))
        const text = ui.h('span', 'aiditor-panel-list-text')
        text.appendChild(ui.h('span', 'aiditor-panel-list-name', { text: item.label }))
        text.appendChild(ui.h('span', 'aiditor-panel-list-id', { text: item.name }))
        row.appendChild(text)
        row.addEventListener('pointerdown', function (ev) { beginDrag(ev, item, ctx) })
        return row
      },
      onActivate: function (item) {
        addPanel(item, props.targetDock, ctx)
      },
    })
    root.appendChild(list)
    ui.collect(root, aiditor.effect(function () {
      if (aiditor.componentRegistryVersion) aiditor.componentRegistryVersion()
      itemsSig.set(panelItems())
    }))
    ui.collect(root, aiditor.effect(function () {
      const q = String(querySig() || '').trim().toLowerCase()
      const items = itemsSig()
      if (!q) {
        filteredSig.set(items)
        return
      }
      filteredSig.set(items.filter(function (item) {
        return [
          item.label,
          item.name,
          item.title,
          item.owner,
          item.layer,
        ].join(' ').toLowerCase().indexOf(q) >= 0
      }))
    }))
    return root
  }

  aiditor.registerComponent('panel-list', {
    category: 'panel',
    label: 'Panels',
    icon: 'columns',
    defaults: function () { return { title: 'Panels', icon: 'columns', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.aiditor = window.aiditor || {})
