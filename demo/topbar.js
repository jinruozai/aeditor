;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui
  const LANG_KEY = 'aeditor.lang'

  function savedLang() {
    return localStorage.getItem(LANG_KEY) || document.documentElement.lang || 'en'
  }

  function setLanguage(lang) {
    const next = lang === 'zh' ? 'zh' : 'en'
    localStorage.setItem(LANG_KEY, next)
    document.documentElement.lang = next
    window.dispatchEvent(new CustomEvent('aeditor-language-change', { detail: { language: next } }))
  }

  function report(err) {
    if (aeditor.reportError) aeditor.reportError({ scope: 'demo', component: 'topbar' }, err)
    else console.error(err)
  }

  function findPanelByComponent(node, component) {
    if (!node) return null
    if (node.type === 'dock') {
      for (let i = 0; i < (node.panels || []).length; i++) {
        if (node.panels[i].component === component) return node.panels[i]
      }
      return null
    }
    for (let j = 0; j < (node.children || []).length; j++) {
      const found = findPanelByComponent(node.children[j], component)
      if (found) return found
    }
    return null
  }

  function openSettings() {
    const layout = window.Demo && window.Demo.layout
    if (!layout) return
    const existing = findPanelByComponent(layout.tree(), 'settings')
    if (existing) {
      layout.activatePanel(existing.id)
      return
    }
    layout.addPanel('chat', { component: 'settings', title: 'Settings', icon: 'settings', props: {} })
  }

  function toggleMenu(slot, anchor, opts) {
    if (slot.handle) {
      slot.handle.close()
      slot.handle = null
      return
    }
    slot.handle = ui.menu(Object.assign({}, opts, {
      anchor: anchor,
      onDismiss: function () {
        slot.handle = null
        if (opts && opts.onDismiss) opts.onDismiss()
      },
    }))
  }

  function mount(host) {
    const lang = aeditor.signal(savedLang())
    const brandMenu = { handle: null }
    const languageMenu = { handle: null }
    setLanguage(lang.peek())

    host.innerHTML = ''

    const brand = ui.h('button', 'aed-brand')
    brand.type = 'button'
    brand.appendChild(ui.h('span', 'aed-brand-icon'))
    brand.appendChild(ui.h('span', 'aed-brand-name', { text: 'AEditor' }))
    brand.appendChild(ui.icon({ name: 'chevron-down', size: 'sm' }))

    const project = ui.h('div', 'aed-project-name')
    const spacer = ui.h('div', 'aed-topbar-spacer')
    const languageText = aeditor.derived(function () { return lang() === 'zh' ? 'ZH' : 'EN' })
    const language = ui.button({
      text: languageText,
      kind: 'ghost',
      size: 'sm',
      icon: ui.icon({ name: 'type', size: 'sm' }),
      onClick: function (ev) {
        toggleMenu(languageMenu, ev.currentTarget, {
          side: 'bottom',
          align: 'end',
          items: [
            { label: 'English', checked: lang.peek() === 'en', onSelect: function () { lang.set('en'); setLanguage('en') } },
            { label: 'Chinese', checked: lang.peek() === 'zh', onSelect: function () { lang.set('zh'); setLanguage('zh') } },
          ],
        })
      },
    })
    language.classList.add('aed-lang-btn')

    brand.addEventListener('click', function (ev) {
      toggleMenu(brandMenu, ev.currentTarget, {
        side: 'bottom',
        align: 'start',
        items: [
          { label: 'New Workspace', icon: 'file', onSelect: function () { if (aeditor.ai.clearWorkspace) aeditor.ai.clearWorkspace() } },
          { label: 'Open Workspace Folder', icon: 'folder', onSelect: function () {
            if (!aeditor.ai.selectWorkspaceDirectory) return
            aeditor.ai.selectWorkspaceDirectory().catch(report)
          } },
          { type: 'divider' },
          { label: 'Settings', icon: 'settings', onSelect: openSettings },
        ],
      })
    })

    host.appendChild(brand)
    host.appendChild(project)
    host.appendChild(spacer)
    host.appendChild(language)

    if (aeditor.ai.workspaceVersion) {
      aeditor.effect(function () {
        aeditor.ai.workspaceVersion()
        project.textContent = aeditor.ai.workspaceLabel ? aeditor.ai.workspaceLabel() : 'Untitled'
      })
    } else {
      project.textContent = 'Untitled'
    }
  }

  window.AEditorTopBar = { mount: mount }
})(window.aeditor = window.aeditor || {})
