// Dock Menu - context menu opened from a dock corner handle.
//
// This is dock-level editing surface: add registered panels, close/pin panels,
// and adjust toolbar position/tab style for the target dock.
;(function (EF) {
  'use strict'

  const findDock = EF.findDock

  function openDockMenu(pos, dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId)
    if (!dock) return
    const activeId = dock.node.activeId
    const active = activePanel(dock.node)
    const items = [
      { label: 'Add Panel', icon: 'plus', onSelect: function () { openAddPanelMenu(pos, dockId, layout) } },
      { type: 'divider' },
      {
        label: 'Panel',
        items: [
          { label: 'Close Active', icon: 'x', disabled: !activeId, onSelect: function () {
            if (activeId) layout.removePanel(activeId)
          } },
          { label: 'Close Others', icon: 'x', disabled: !activeId || dock.node.panels.length < 2, onSelect: function () {
            closeOtherPanels(dockId, activeId, layout)
          } },
          { label: 'Close All', icon: 'x', disabled: dock.node.panels.length === 0, onSelect: function () {
            closeAllPanels(dockId, layout)
          } },
          { type: 'divider' },
          { label: 'Pin Active', icon: active && active.transient ? 'pin' : 'check', disabled: !active || !active.transient, onSelect: function () {
            if (activeId) layout.promotePanel(activeId)
          } },
        ],
      },
      {
        label: 'Toolbar',
        items: [
          {
            label: 'Position',
            items: [
              toolbarPositionItem('Top', 'top', dockId, layout),
              toolbarPositionItem('Bottom', 'bottom', dockId, layout),
              toolbarPositionItem('Left', 'left', dockId, layout),
              toolbarPositionItem('Right', 'right', dockId, layout),
              { label: 'Hidden', icon: dock.node.toolbar ? '' : 'check', onSelect: function () { setDockToolbar(dockId, layout, null) } },
            ],
          },
          {
            label: 'Tabs',
            items: [
              tabsItem('Standard', 'tab-standard', dockId, layout),
              tabsItem('Compact', 'tab-compact', dockId, layout),
              tabsItem('Collapsible', 'tab-collapsible', dockId, layout),
              tabsItem('Sidebar', 'tab-sidebar', dockId, layout),
            ],
          },
          { type: 'divider' },
          { label: 'Show Toolbar', icon: dock.node.toolbar ? 'check' : '', onSelect: function () {
            ensureToolbar(dockId, layout)
          } },
          { label: 'Hide Toolbar', icon: dock.node.toolbar ? '' : 'check', onSelect: function () {
            setDockToolbar(dockId, layout, null)
          } },
        ],
      },
    ]
    EF.ui.contextMenu(pos, items)
  }

  function activePanel(dock) {
    if (!dock.activeId) return null
    for (let i = 0; i < dock.panels.length; i++) {
      if (dock.panels[i].id === dock.activeId) return dock.panels[i]
    }
    return null
  }

  function closeOtherPanels(dockId, activeId, layout) {
    if (!activeId) return
    const dock = findDock(layout.treeSig.peek(), dockId)
    if (!dock) return
    const ids = dock.node.panels
      .filter(function (p) { return p.id !== activeId })
      .map(function (p) { return p.id })
    for (let i = 0; i < ids.length; i++) layout.removePanel(ids[i])
  }

  function closeAllPanels(dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId)
    if (!dock) return
    const ids = dock.node.panels.map(function (p) { return p.id })
    for (let i = 0; i < ids.length; i++) layout.removePanel(ids[i])
  }

  function openAddPanelMenu(pos, dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId)
    if (!dock) return
    const items = EF.listComponents()
      .filter(function (spec) {
        return spec.category === 'panel' && accepts(dock.node, spec.name)
      })
      .sort(function (a, b) { return panelLabel(a).localeCompare(panelLabel(b)) })
      .map(function (spec) {
        return {
          label: panelLabel(spec),
          value: spec.name,
          icon: spec.icon || (spec.defaults && spec.defaults().icon) || 'square',
          group: spec.category || 'panel',
          onSelect: function () {
            const defaults = EF.componentDefaults(spec.name)
            layout.addPanel(dockId, Object.assign({}, defaults, { component: spec.name }))
          },
        }
      })
    EF.ui.searchMenu({
      pos: pos,
      items: items,
      placeholder: 'Add panel...',
      width: 320,
      maxHeight: 420,
    })
  }

  function panelLabel(spec) {
    const d = spec.defaults ? spec.defaults() : {}
    return spec.label || d.title || spec.name
  }

  function accepts(dock, component) {
    const a = dock.accept
    return !a || a === '*' || (Array.isArray(a) && a.indexOf(component) >= 0)
  }

  function toolbarPositionItem(label, direction, dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId).node
    const active = dock.toolbar && (dock.toolbar.direction || 'top') === direction
    return { label: label, icon: active ? 'check' : '', onSelect: function () {
      const tb = dock.toolbar || defaultToolbar(direction)
      setDockToolbar(dockId, layout, Object.assign({}, tb, { direction: direction }))
    } }
  }

  function tabsItem(label, component, dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId).node
    const current = currentTabComponent(dock.toolbar)
    return { label: label, icon: current === component ? 'check' : '', onSelect: function () {
      const tb = dock.toolbar || defaultToolbar('top')
      setDockToolbar(dockId, layout, withTabComponent(tb, component))
    } }
  }

  function ensureToolbar(dockId, layout) {
    const dock = findDock(layout.treeSig.peek(), dockId)
    if (!dock || dock.node.toolbar) return
    setDockToolbar(dockId, layout, defaultToolbar('top'))
  }

  function setDockToolbar(dockId, layout, toolbar) {
    layout.setTree(EF.updateDock(layout.treeSig.peek(), dockId, { toolbar: toolbar }))
  }

  function defaultToolbar(direction) {
    return {
      direction: direction || 'top',
      items: [{ component: 'tab-standard', props: {}, align: 'start' }],
    }
  }

  function currentTabComponent(toolbar) {
    const item = firstTabItem(toolbar)
    return item && item.component
  }

  function withTabComponent(toolbar, component) {
    const tb = Object.assign({}, toolbar, { items: (toolbar.items || []).slice() })
    const idx = tb.items.findIndex(function (item) { return isTabComponent(item.component) })
    const next = { component: component, props: {}, align: 'start' }
    if (idx >= 0) tb.items[idx] = Object.assign({}, tb.items[idx], { component: component })
    else tb.items.unshift(next)
    return tb
  }

  function firstTabItem(toolbar) {
    if (!toolbar || !toolbar.items) return null
    for (let i = 0; i < toolbar.items.length; i++) {
      if (isTabComponent(toolbar.items[i].component)) return toolbar.items[i]
    }
    return null
  }

  function isTabComponent(component) {
    return component === 'tab-standard' || component === 'tab-compact' ||
      component === 'tab-collapsible' || component === 'tab-sidebar'
  }

  EF._dock = EF._dock || {}
  EF._dock.openDockMenu = openDockMenu
})(window.EF = window.EF || {})
