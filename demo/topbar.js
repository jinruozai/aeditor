;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui
  const LANG_KEY = 'aeditor.lang'
  const LAST_WORKSPACE_KEY = 'aeditor.demo.lastWorkspace'

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

  function info(message, meta) {
    let suffix = ''
    try { suffix = meta ? ' ' + JSON.stringify(meta) : '' } catch (_) { suffix = ' [unserializable meta]' }
    if (aeditor.log && aeditor.log.push) aeditor.log.push('info', { scope: 'demo', component: 'topbar' }, message + suffix)
  }

  function isMissingProjectDescriptor(err) {
    const text = String(err && (err.message || err) || '')
    return (
      err && err.name === 'NotFoundError' ||
      /aeditor\.project\.json|Invalid project descriptor|Project descriptor|could not be found|not found/i.test(text)
    )
  }

  async function useWorkspace(ws, source) {
    const label = ws && ws.rootId ? ws.rootId() : 'Workspace'
    const kind = ws && ws.kind ? ws.kind() : 'workspace'
    info(source + ': workspace ready', { label: label, kind: kind })
    if (window.Demo && Demo.project && Demo.project.open) {
      try {
        await Demo.project.open(ws, { mount: {} })
        info(source + ': opened as AEditor project', { label: label })
        return true
      } catch (err) {
        if (!isMissingProjectDescriptor(err)) throw err
        info(source + ': no project descriptor, using directory as AI workspace', { label: label })
      }
    }
    if (aeditor.ai && aeditor.ai.setWorkspace) {
      aeditor.ai.setWorkspace(ws, { id: 'workspace:' + label, label: label, kind: kind })
      info(source + ': AI workspace set', { label: label, kind: kind })
    }
    return true
  }

  async function openWorkspaceFolder() {
    if (!aeditor.workspace || !aeditor.workspace.openDirectory) return false
    try {
      info('Open workspace folder: requesting directory permission')
      const ws = await aeditor.workspace.openDirectory({ mode: 'readwrite', rememberKey: LAST_WORKSPACE_KEY })
      return useWorkspace(ws, 'Open workspace folder')
    } catch (err) {
      report(err)
      if (aeditor.ai && aeditor.ai.clearWorkspace) aeditor.ai.clearWorkspace()
      return false
    }
  }

  async function restoreWorkspaceFolder() {
    if (!aeditor.workspace || !aeditor.workspace.restoreDirectory) return false
    try {
      const ws = await aeditor.workspace.restoreDirectory(LAST_WORKSPACE_KEY, { mode: 'readwrite' })
      if (!ws) return false
      return useWorkspace(ws, 'Restore workspace folder')
    } catch (err) {
      report(err)
      return false
    }
  }

  function currentTitle() {
    const project = window.Demo && Demo.project && Demo.project.current && Demo.project.current()
    if (project && project.title) return project.title
    if (aeditor.ai && aeditor.ai.workspaceLabel) return aeditor.ai.workspaceLabel()
    return 'Untitled'
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
    const titleTick = aeditor.signal(0)
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
            openWorkspaceFolder().then(function () {
              titleTick.set(titleTick.peek() + 1)
            })
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
        titleTick()
        project.textContent = currentTitle()
      })
    } else {
      project.textContent = currentTitle()
    }

    restoreWorkspaceFolder().then(function (restored) {
      if (restored) titleTick.set(titleTick.peek() + 1)
    })
  }

  window.AEditorTopBar = { mount: mount }
})(window.aeditor = window.aeditor || {})
