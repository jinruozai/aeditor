// demo component: panel-list
;(function (aiditor) {
  'use strict'

  const ui = aiditor.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
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
      .filter(function (item) { return item.category === 'panel' })
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
      props: structuredClone(item.props || {}),
    }
    if (item.toolbarItems) data.toolbarItems = structuredClone(item.toolbarItems)
    return data
  }

  function beginDrag(ev, item) {
    if (!Demo.layout || !aiditor._dock || !aiditor._dock.beginExternalPanelDrag) return
    aiditor._dock.beginExternalPanelDrag(ev, panelData(item), Demo.layout, { label: item.label })
  }

  function factory() {
    const root = ui.h('div', 'demo-panel-list')
    const querySig = aiditor.signal('')
    const itemsSig = aiditor.signal(panelItems())
    const filteredSig = aiditor.signal(itemsSig.peek())

    const toolbar = ui.h('div', 'demo-panel-list-toolbar')
    toolbar.appendChild(ui.searchInput({
      value: querySig,
      placeholder: 'Search panels...',
    }))
    root.appendChild(toolbar)

    const list = ui.list({
      items: filteredSig,
      rowHeight: 36,
      multi: false,
      render: function (item) {
        const row = ui.h('div', 'demo-panel-list-row', { title: item.name })
        row.appendChild(ui.icon({ name: item.icon, size: 'sm' }))
        const text = ui.h('span', 'demo-panel-list-text')
        text.appendChild(ui.h('span', 'demo-panel-list-name', { text: item.label }))
        text.appendChild(ui.h('span', 'demo-panel-list-id', { text: item.name }))
        row.appendChild(text)
        row.addEventListener('pointerdown', function (ev) { beginDrag(ev, item) })
        return row
      },
      onActivate: function (item) {
        if (Demo.layout) Demo.layout.addPanel('chat', panelData(item))
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
