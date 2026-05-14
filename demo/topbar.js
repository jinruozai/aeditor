;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui
  const LANG_KEY = 'aeditor.lang'
  const LAST_WORKSPACE_KEY = 'aeditor.demo.lastWorkspace'
  const RECENT_WORKSPACES_KEY = 'aeditor.demo.recentWorkspaces'

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

  function toast(kind, message) {
    if (ui.toast) ui.toast({ kind: kind || 'info', message: message })
  }

  function readRecentWorkspaces() {
    try {
      const list = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY) || '[]')
      return Array.isArray(list) ? list.filter(function (item) { return item && item.key && item.label }) : []
    } catch (_) {
      return []
    }
  }

  function writeRecentWorkspaces(list) {
    localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(list.slice(0, 8)))
  }

  function rememberWorkspace(key, ws) {
    const label = ws && ws.rootId ? ws.rootId() : 'Workspace'
    const next = readRecentWorkspaces().filter(function (item) { return item.key !== key && item.label !== label })
    next.unshift({ key: key, label: label, openedAt: Date.now() })
    writeRecentWorkspaces(next)
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
      const rememberKey = LAST_WORKSPACE_KEY + '.' + Date.now().toString(36)
      const ws = await aeditor.workspace.openDirectory({ mode: 'readwrite', rememberKey: rememberKey })
      rememberWorkspace(rememberKey, ws)
      return useWorkspace(ws, 'Open workspace folder')
    } catch (err) {
      report(err)
      if (aeditor.ai && aeditor.ai.clearWorkspace) aeditor.ai.clearWorkspace()
      return false
    }
  }

  async function restoreWorkspaceKey(key, source) {
    if (!aeditor.workspace || !aeditor.workspace.restoreDirectory || !key) return false
    const ws = await aeditor.workspace.restoreDirectory(key, { mode: 'readwrite' })
    if (!ws) return false
    rememberWorkspace(key, ws)
    return useWorkspace(ws, source || 'Open recent workspace')
  }

  async function restoreWorkspaceFolder() {
    if (!aeditor.workspace || !aeditor.workspace.restoreDirectory) return false
    try {
      const recent = readRecentWorkspaces()
      for (let i = 0; i < recent.length; i++) {
        if (await restoreWorkspaceKey(recent[i].key, 'Restore recent workspace')) return true
      }
      const ws = await aeditor.workspace.restoreDirectory(LAST_WORKSPACE_KEY, { mode: 'readwrite' })
      if (!ws) return false
      rememberWorkspace(LAST_WORKSPACE_KEY, ws)
      return useWorkspace(ws, 'Restore workspace folder')
    } catch (err) {
      report(err)
      return false
    }
  }

  async function saveProjectLayout(opts) {
    if (!window.Demo || !Demo.project || !Demo.project.current) return false
    const project = Demo.project.current()
    if (!project || !project.saveLayout) return false
    try {
      const result = await project.saveLayout(opts || {})
      toast('success', 'Layout saved: ' + result.layoutPath)
      return true
    } catch (err) {
      report(err)
      toast('error', 'Save failed')
      return false
    }
  }

  function saveProjectLayoutAs() {
    const project = window.Demo && Demo.project && Demo.project.current && Demo.project.current()
    const currentPath = project && project.descriptor && project.descriptor.layout || 'aeditor.layout.json'
    ui.prompt({
      title: 'Save Layout As',
      message: 'Workspace path',
      default: currentPath,
      okLabel: 'Save',
    }).then(function (path) {
      path = String(path || '').trim()
      if (path) saveProjectLayout({ layoutPath: path, updateDescriptor: true })
    })
  }

  function newWorkspaceSession() {
    if (window.Demo && Demo.project) {
      const projects = Demo.project.list ? Demo.project.list() : []
      for (let i = 0; i < projects.length; i++) {
        if (projects[i] && projects[i].close) projects[i].close()
      }
      if (!projects.length && Demo.project.current) {
        const project = Demo.project.current()
        if (project && project.close) project.close()
      }
    }
    if (aeditor.ai && aeditor.ai.clearWorkspace) aeditor.ai.clearWorkspace()
  }

  function recentWorkspaceItems(refreshTitle) {
    const recent = readRecentWorkspaces()
    if (!recent.length) return [{ label: 'No Recent Workspaces', disabled: true }]
    return recent.map(function (item) {
      return {
        label: item.label,
        onSelect: function () {
          restoreWorkspaceKey(item.key, 'Open recent workspace').then(function (opened) {
            if (opened) refreshTitle()
            else toast('warn', 'Recent workspace is unavailable')
          }).catch(function (err) {
            report(err)
            toast('error', 'Open recent failed')
          })
        },
      }
    })
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
      const projectOpen = !!(window.Demo && Demo.project && Demo.project.current && Demo.project.current())
      const refreshTitle = function () { titleTick.set(titleTick.peek() + 1) }
      toggleMenu(brandMenu, ev.currentTarget, {
        side: 'bottom',
        align: 'start',
        items: [
          { label: 'New', onSelect: function () { newWorkspaceSession(); refreshTitle() } },
          { label: 'Open', onSelect: function () {
            openWorkspaceFolder().then(function () {
              refreshTitle()
            })
          } },
          { label: 'Open Recent', items: recentWorkspaceItems(refreshTitle) },
          { type: 'divider' },
          { label: 'Save', disabled: !projectOpen, onSelect: function () { saveProjectLayout() } },
          { label: 'Save As', disabled: !projectOpen, onSelect: saveProjectLayoutAs },
          { type: 'divider' },
          { label: 'Settings', onSelect: openSettings },
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
