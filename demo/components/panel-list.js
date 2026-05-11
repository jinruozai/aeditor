// demo component: panel-list
;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function titleOf(item) {
    return item.label || item.title || item.name
  }

  function iconOf(item) {
    const defaults = aeditor.componentDefaults(item.name)
    return item.icon || defaults.icon || 'columns'
  }

  function panelItems() {
    return aeditor.listComponents()
      .filter(function (item) { return item.category === 'panel' })
      .map(function (item) {
        const defaults = aeditor.componentDefaults(item.name)
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
    if (!Demo.layout || !aeditor._dock || !aeditor._dock.beginExternalPanelDrag) return
    aeditor._dock.beginExternalPanelDrag(ev, panelData(item), Demo.layout, { label: item.label })
  }

  function factory() {
    const root = ui.h('div', 'demo-panel-list')
    const scroll = ui.scrollArea()
    const list = ui.h('div', 'demo-panel-list-items')
    scroll.appendChild(list)
    root.appendChild(scroll)

    const items = panelItems()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const row = ui.h('button', 'demo-panel-list-row', { type: 'button', title: item.name })
      row.appendChild(ui.icon({ name: item.icon, size: 'sm' }))
      const text = ui.h('span', 'demo-panel-list-text')
      text.appendChild(ui.h('span', 'demo-panel-list-name', { text: item.label }))
      text.appendChild(ui.h('span', 'demo-panel-list-id', { text: item.name }))
      row.appendChild(text)
      row.addEventListener('pointerdown', function (ev) { beginDrag(ev, item) })
      row.addEventListener('dblclick', function () {
        if (Demo.layout) Demo.layout.addPanel('chat', panelData(item))
      })
      list.appendChild(row)
    }

    return root
  }

  aeditor.registerComponent('panel-list', {
    category: 'panel',
    label: 'Panels',
    icon: 'columns',
    defaults: function () { return { title: 'Panels', icon: 'columns', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.aeditor = window.aeditor || {})
