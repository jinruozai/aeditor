// Built-in settings panel: schema pages + custom pages.
;(function (EF) {
  'use strict'

  const ui = EF.ui

  function disposeTree(el) {
    if (!el) return
    while (el.firstChild) disposeTree(el.firstChild)
    ui.dispose(el)
  }

  function activeInitial(items) {
    return items.length ? items[0].id : null
  }

  function pageId(kind, id) {
    return kind + ':' + id
  }

  function sectionNodes() {
    const sections = EF.settings.sections()
    const pages = EF.settings.pages()
    const schemas = EF.settings.schemas()
    const out = []
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const children = []
      const hasSchema = schemas.some(function (s) { return s.section === section.id })
      const pageReplacesSchema = pages.some(function (p) { return p.section === section.id && p.replacesSchema })
      if (hasSchema && !pageReplacesSchema) {
        const sectionSchemas = schemas.filter(function (s) { return s.section === section.id })
        children.push({
          id: pageId('schema', section.id),
          label: section.title,
          icon: section.icon || 'settings',
          kind: 'schema',
          sectionId: section.id,
          searchText: [section.title, section.description].concat(sectionSchemas.map(function (s) {
            return [s.key, s.label, s.description].join(' ')
          })).join(' '),
        })
      }
      for (let j = 0; j < pages.length; j++) {
        if (pages[j].section !== section.id) continue
        children.push({
          id: pageId('page', pages[j].id),
          label: pages[j].title,
          icon: pages[j].icon || section.icon || 'settings',
          kind: 'page',
          pageId: pages[j].id,
          sectionId: section.id,
          order: pages[j].order,
          searchText: [pages[j].title, section.title, typeof pages[j].searchText === 'function' ? pages[j].searchText() : pages[j].searchText].join(' '),
        })
      }
      children.sort(function (a, b) { return (a.order || 0) - (b.order || 0) })
      out.push({
        id: 'section:' + section.id,
        label: section.title,
        icon: section.icon || 'settings',
        kind: 'section',
        sectionId: section.id,
        searchText: [section.title, section.description].join(' '),
        children: children,
      })
    }
    return out
  }

  function schemaFor(sectionId) {
    const schemas = EF.settings.schemas().filter(function (s) { return s.section === sectionId })
    schemas.sort(function (a, b) { return (a.order || 0) - (b.order || 0) })
    const out = {}
    for (let i = 0; i < schemas.length; i++) {
      out[schemas[i].key] = fieldDefFor(schemas[i])
    }
    return out
  }

  function fieldDefFor(setting) {
    const t = setting.type
    const base = { label: setting.label, mem: setting.description }
    if (t === 'bool') return Object.assign(base, { type: 'bool' })
    if (t === 'number' || t === 'float') return Object.assign(base, { type: 'float' })
    if (t === 'int') return Object.assign(base, { type: 'int' })
    if (t === 'select') return {
      label: setting.label,
      type: 'enum_string',
      mem: setting.description,
      type_agv: { options: EF.settings.resolveOptions(setting.options) || [] },
    }
    if (t === 'color') return Object.assign(base, { type: 'color' })
    if (t === 'text') return Object.assign(base, { type: 'string', type_render: 'textarea' })
    if (t === 'password') return Object.assign(base, { type: 'string', type_agv: { password: true } })
    return base.type ? base : { type: 'string', mem: setting.description }
  }

  function valuesForSection(sectionId) {
    const values = {}
    const schemas = EF.settings.schemas().filter(function (s) { return s.section === sectionId })
    for (let i = 0; i < schemas.length; i++) values[schemas[i].key] = EF.settings.get(schemas[i].key)
    return values
  }

  function renderSchemaPage(sectionId) {
    const root = ui.h('div', 'ef-settings-page')
    const section = findSection(sectionId)
    root.appendChild(pageHeader(section ? section.title : 'Settings', section ? section.description : ''))
    const schemaSig = EF.signal(schemaFor(sectionId))
    const targetsSig = EF.signal([valuesForSection(sectionId)])
    const panel = ui.propertyPanel({
      targets: targetsSig,
      schema: schemaSig,
      onChange: function (key, value) {
        EF.settings.set(key, value)
        targetsSig.set([valuesForSection(sectionId)])
      },
    })
    root.appendChild(panel)
    ui.collect(root, EF.effect(function () {
      schemaSig.set(schemaFor(sectionId))
      targetsSig.set([valuesForSection(sectionId)])
    }))
    return root
  }

  function pageHeader(title, desc) {
    const head = ui.h('div', 'ef-settings-page-head')
    head.appendChild(ui.h('div', 'ef-settings-page-title', { text: title || 'Settings' }))
    if (desc) head.appendChild(ui.h('div', 'ef-settings-page-desc', { text: desc }))
    return head
  }

  function findPage(id) {
    const pages = EF.settings.pages.peek()
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].id === id) return pages[i]
    }
    return null
  }

  function findSection(id) {
    const sections = EF.settings.sections.peek()
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].id === id) return sections[i]
    }
    return null
  }

  function factory(propsSig, ctx) {
    const root = ui.h('div', 'ef-settings-panel')
    const savedNavWidth = Number(EF.settings.get('settings.navWidth') || 240)
    root.style.setProperty('--ef-settings-nav-w', Math.max(132, Math.min(420, savedNavWidth)) + 'px')
    const navItems = EF.signal([])
    const selected = EF.signal([])
    const expanded = EF.signal(new Set())
    const search = EF.signal('')
    const content = ui.scrollArea({ children: [] })
    content.classList.add('ef-settings-content')

    const navWrap = ui.h('div', 'ef-settings-nav')
    navWrap.appendChild(ui.searchInput({
      value: search,
      placeholder: 'Search settings...',
      onChange: function (v) { search.set(v) },
    }))
    const nav = ui.tree({
      items: navItems,
      selected: selected,
      expanded: expanded,
      search: search,
      matchNode: function (node, q) {
        const hay = String(node.searchText || node.label || node.id).toLowerCase()
        return hay.indexOf(String(q).toLowerCase()) >= 0
      },
      multi: false,
      rowHeight: 26,
      showArrow: 'always',
      onRowClick: function (node) { return node.kind === 'section' ? 'select-and-toggle' : 'select' },
      onSelect: function (ids) {
        if (!ids.length) return
        mount(ids[0])
      },
    })
    nav.classList.add('ef-settings-tree')
    navWrap.appendChild(nav)
    const splitter = ui.h('div', 'ef-settings-splitter ef-splitter ef-splitter-horizontal')
    root.appendChild(navWrap)
    root.appendChild(splitter)
    root.appendChild(content)

    splitter.addEventListener('pointerdown', function (ev) {
      ev.preventDefault()
      const rect = root.getBoundingClientRect()
      splitter.setPointerCapture(ev.pointerId)
      splitter.classList.add('ef-splitter-active')
      document.body.classList.add('ef-dragging', 'ef-dragging-horizontal')
      function move(e) {
        const max = Math.max(132, Math.min(420, rect.width - 320))
        const w = Math.max(132, Math.min(max, e.clientX - rect.left))
        root.style.setProperty('--ef-settings-nav-w', w + 'px')
      }
      function up(e) {
        move(e)
        splitter.releasePointerCapture(ev.pointerId)
        splitter.classList.remove('ef-splitter-active')
        document.body.classList.remove('ef-dragging', 'ef-dragging-horizontal')
        EF.settings.set('settings.navWidth', Math.round(parseFloat(root.style.getPropertyValue('--ef-settings-nav-w')) || 240))
        splitter.removeEventListener('pointermove', move)
        splitter.removeEventListener('pointerup', up)
        splitter.removeEventListener('pointercancel', up)
      }
      splitter.addEventListener('pointermove', move)
      splitter.addEventListener('pointerup', up)
      splitter.addEventListener('pointercancel', up)
    })

    function mount(id) {
      const items = navItems.peek()
      const node = findNode(items, id)
      if (!node || node.kind === 'section') return
      selected.set([id])
      while (content.firstChild) disposeTree(content.firstChild)
      let pageEl
      if (node.kind === 'schema') pageEl = renderSchemaPage(node.sectionId)
      else {
        const page = findPage(node.pageId)
        const section = findSection(node.sectionId)
        pageEl = page && page.factory ? page.factory({ settings: EF.settings, section: section, page: page }) : ui.h('div')
      }
      content.appendChild(pageEl)
    }

    function findNode(nodes, id) {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return nodes[i]
        const found = findNode(nodes[i].children || [], id)
        if (found) return found
      }
      return null
    }

    ui.collect(root, EF.effect(function () {
      const items = sectionNodes()
      navItems.set(items)
      const exp = new Set()
      for (let i = 0; i < items.length; i++) exp.add(items[i].id)
      expanded.set(exp)
      const current = selected.peek()[0]
      if (!current || !findNode(items, current)) {
        const first = items.length && items[0].children.length ? items[0].children[0].id : activeInitial(items)
        if (first) mount(first)
      }
    }))

    return root
  }

  EF.registerComponent('settings', {
    defaults: function () { return { title: 'Settings', icon: 'settings', props: {} } },
    factory: factory,
    dispose: disposeTree,
  })
})(window.EF = window.EF || {})
