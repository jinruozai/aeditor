;(function (aeditor) {
  'use strict'

  const ui = aeditor.ui
  const LANG_KEY = 'aeditor.lang'
  const LAST_WORKSPACE_KEY = 'aeditor.demo.lastWorkspace'
  const RECENT_WORKSPACES_KEY = 'aeditor.demo.recentWorkspaces'
  const LAYOUT_PATH_KEY = 'aeditor.demo.layoutPath'

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

  function isMissingWorkspaceFile(err) {
    const text = String(err && (err.message || err) || '')
    return err && err.name === 'NotFoundError' || /file not found|path not found|not found/i.test(text)
  }

  function currentProject() {
    return window.Demo && Demo.project && Demo.project.current && Demo.project.current()
  }

  function currentWorkspace() {
    return aeditor.ai && aeditor.ai.currentWorkspace && aeditor.ai.currentWorkspace()
  }

  function currentWorkspaceLayoutKey() {
    const meta = aeditor.ai && aeditor.ai.workspaceMeta && aeditor.ai.workspaceMeta()
    const ws = currentWorkspace()
    const id = meta && meta.id || ws && ws.rootId && ws.rootId() || 'workspace'
    return LAYOUT_PATH_KEY + '.' + id
  }

  function currentWorkspaceLayoutPath() {
    return localStorage.getItem(currentWorkspaceLayoutKey()) || 'aeditor.layout.json'
  }

  function currentWorkspaceOwner() {
    const meta = aeditor.ai && aeditor.ai.workspaceMeta && aeditor.ai.workspaceMeta()
    return 'workspace:' + String(meta && meta.id || meta && meta.label || 'current')
  }

  async function readFileOrNull(ws, path) {
    try {
      return await ws.read(path)
    } catch (err) {
      if (isMissingWorkspaceFile(err)) return null
      throw err
    }
  }

  function canSaveLayout() {
    const project = currentProject()
    if (project && project.saveLayout) return true
    return !!(currentWorkspace() && window.Demo && Demo.layout && Demo.layout.tree)
  }

  function htmlAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function scriptJson(value) {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c')
  }

  function assetUrl(path) {
    return new URL(path, document.baseURI).href
  }

  async function fetchText(path) {
    const res = await fetch(assetUrl(path), { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed to read runtime asset: ' + path)
    return res.text()
  }

  async function writeTextFile(ws, path, text) {
    const previous = await readFileOrNull(ws, path)
    return ws.write(path, text, previous ? { baseHash: previous.hash } : {})
  }

  function isStandaloneAssetPath(path) {
    path = String(path || '').replace(/\\/g, '/')
    const lower = path.toLowerCase()
    if (!lower || lower === 'index.html') return false
    if (lower.indexOf('aeditor-runtime/') === 0) return false
    if (lower.indexOf('node_modules/') === 0 || lower.indexOf('.git/') === 0) return false
    return /\.js$/.test(lower) || /\.css$/.test(lower)
  }

  async function collectStandaloneAssets(ws) {
    const scripts = []
    const styles = []
    const seen = {}
    async function walk(path) {
      let entries = []
      try { entries = await ws.list(path || '') } catch (_) { return }
      for (let i = 0; i < entries.length; i++) {
        const item = entries[i]
        const itemPath = String(item.path || '').replace(/\\/g, '/')
        const lower = itemPath.toLowerCase()
        if (!itemPath || seen[itemPath]) continue
        seen[itemPath] = true
        if (item.kind === 'directory') {
          if (lower === 'aeditor-runtime' || lower === 'node_modules' || lower === '.git') continue
          await walk(itemPath)
          continue
        }
        if (!isStandaloneAssetPath(itemPath)) continue
        if (/\.css$/i.test(itemPath)) styles.push(itemPath)
        else scripts.push(itemPath)
      }
    }
    await walk('')
    scripts.sort()
    styles.sort()
    return { scripts: scripts, styles: styles }
  }

  function walkPanels(node, fn) {
    if (!node) return
    if (node.type === 'dock') {
      const panels = node.panels || []
      for (let i = 0; i < panels.length; i++) fn(panels[i])
      return
    }
    for (let j = 0; node.children && j < node.children.length; j++) walkPanels(node.children[j], fn)
  }

  function registrationPattern(component) {
    const escaped = String(component || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(
      '(aeditor\\s*\\.\\s*registerComponent|registerComponent|Demo\\s*\\.\\s*project\\s*\\.\\s*component)' +
      '\\s*\\(\\s*[\'"]' + escaped + '[\'"]'
    )
  }

  function layoutRoot(raw) {
    if (!raw || typeof raw !== 'object') return null
    if (raw.root) return raw.root
    if (raw.type === 'dock' || raw.type === 'split') return raw
    return null
  }

  async function loadWorkspaceScript(ws, path) {
    const file = await ws.read(path)
    if (!aeditor.runtime || !aeditor.runtime.loadScript) throw new Error('aeditor.runtime.loadScript is not available')
    await aeditor.runtime.loadScript({
      id: path,
      path: path,
      source: file.text,
      type: 'script',
      owner: currentWorkspaceOwner(),
      layer: 'workspace',
      replace: true,
    })
    return file
  }

  async function loadLayoutPanelScripts(ws, root) {
    const needed = {}
    const paths = {}
    walkPanels(root, function (panel) {
      const component = panel && panel.component
      if (!component || aeditor.componentRegistration && aeditor.componentRegistration(component)) return
      needed[component] = true
      const sourcePath = panel.sourcePath || panel.path || panel.entryPath
      if (sourcePath) paths[sourcePath] = true
    })
    let names = Object.keys(needed)
    if (!names.length) return []

    const loaded = []
    const pathList = Object.keys(paths)
    for (let i = 0; i < pathList.length; i++) {
      await loadWorkspaceScript(ws, pathList[i])
      loaded.push(pathList[i])
    }
    names = names.filter(function (component) {
      return !(aeditor.componentRegistration && aeditor.componentRegistration(component))
    })
    if (!names.length) return loaded

    const assets = await collectStandaloneAssets(ws)
    for (let j = 0; j < assets.scripts.length && names.length; j++) {
      const path = assets.scripts[j]
      if (paths[path]) continue
      const file = await readFileOrNull(ws, path)
      if (!file) continue
      const matches = names.filter(function (component) { return registrationPattern(component).test(file.text) })
      if (!matches.length) continue
      await aeditor.runtime.loadScript({
        id: path,
        path: path,
        source: file.text,
        type: 'script',
        owner: currentWorkspaceOwner(),
        layer: 'workspace',
        replace: true,
      })
      loaded.push(path)
      names = names.filter(function (component) {
        return !(aeditor.componentRegistration && aeditor.componentRegistration(component))
      })
    }
    return loaded
  }

  async function restoreWorkspaceLayout(ws) {
    const layout = window.Demo && Demo.layout
    if (!ws || !layout || !layout.setTree) return false
    const primaryPath = currentWorkspaceLayoutPath()
    let file = await readFileOrNull(ws, primaryPath)
    let layoutPath = primaryPath
    if (!file && primaryPath !== 'aeditor.layout.json') {
      file = await readFileOrNull(ws, 'aeditor.layout.json')
      layoutPath = 'aeditor.layout.json'
    }
    if (!file) return false
    const root = layoutRoot(JSON.parse(file.text))
    if (!root) throw new Error('Invalid workspace layout: ' + layoutPath)
    const loaded = await loadLayoutPanelScripts(ws, root)
    layout.setTree(root)
    localStorage.setItem(currentWorkspaceLayoutKey(), layoutPath)
    info('Workspace layout restored', { layoutPath: layoutPath, scripts: loaded })
    return true
  }

  function standaloneHtml(root, assets) {
    const styles = (assets.styles || []).map(function (path) {
      return '  <link rel="stylesheet" href="./' + htmlAttr(path) + '">'
    }).join('\n')
    const scripts = (assets.scripts || []).map(function (path) {
      return '  <script src="./' + htmlAttr(path) + '"></script>'
    }).join('\n')
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <title>AEditor Workspace</title>',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <link rel="stylesheet" href="./aeditor-runtime/aeditor-full.css">',
      styles,
      '  <style>',
      '    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: var(--aeditor-bg-0, #07070a); }',
      '    #app { width: 100vw; height: 100dvh; }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div id="app"></div>',
      '  <script src="./aeditor-runtime/aeditor-full.js"></script>',
      scripts,
      '  <script>',
      '    ;(function () {',
      '      var saved = ' + scriptJson({ root: root }) + ';',
      '      var layout = aeditor.createDockLayout(document.getElementById("app"), {',
      '        tree: saved.root,',
      '        lru: { max: -1 },',
      '        dockMenu: true',
      '      });',
      '      window.aeditorDebug = {',
      '        layout: layout,',
      '        tree: function () { return layout.tree(); }',
      '      };',
      '    })()',
      '  </script>',
      '</body>',
      '</html>',
      '',
    ].filter(function (line) { return line != null && line !== '' }).join('\n')
  }

  async function writeStandaloneWorkspace(ws, root) {
    const assets = await collectStandaloneAssets(ws)
    const css = await fetchText('./dist/aeditor-full.css?v=13')
    const js = await fetchText('./dist/aeditor-full.js?v=13')
    await writeTextFile(ws, 'aeditor-runtime/aeditor-full.css', css)
    await writeTextFile(ws, 'aeditor-runtime/aeditor-full.js', js)
    await writeTextFile(ws, 'index.html', standaloneHtml(root, assets))
    return { ok: true, indexPath: 'index.html', scripts: assets.scripts.length, styles: assets.styles.length }
  }

  async function tryWriteStandaloneWorkspace(ws, root) {
    try {
      return await writeStandaloneWorkspace(ws, root)
    } catch (err) {
      report(err)
      toast('warn', 'Layout saved, standalone index export failed')
      return null
    }
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
    try {
      await restoreWorkspaceLayout(ws)
    } catch (err) {
      report(err)
      toast('warn', 'Workspace opened, layout restore failed')
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
    const project = currentProject()
    try {
      let result = null
      let standalone = null
      if (project && project.saveLayout) {
        result = await project.saveLayout(opts || {})
        if (project.workspace && project.handle && project.handle.tree) {
          standalone = await tryWriteStandaloneWorkspace(project.workspace, project.handle.tree())
        }
      } else {
        result = await saveWorkspaceLayout(opts || {})
        standalone = result && result.standalone
      }
      if (!result) return false
      toast('success', 'Layout saved: ' + result.layoutPath + (standalone ? ' + index.html' : ''))
      return true
    } catch (err) {
      report(err)
      toast('error', 'Save failed')
      return false
    }
  }

  async function saveWorkspaceLayout(opts) {
    const ws = currentWorkspace()
    const layout = window.Demo && Demo.layout
    if (!ws || !layout || !layout.tree) return null
    const o = opts || {}
    const layoutPath = String(o.path || o.layoutPath || currentWorkspaceLayoutPath()).trim() || 'aeditor.layout.json'
    const previous = await readFileOrNull(ws, layoutPath)
    const saved = await ws.write(
      layoutPath,
      JSON.stringify({ root: layout.tree() }, null, 2),
      previous ? { baseHash: previous.hash } : {}
    )
    localStorage.setItem(currentWorkspaceLayoutKey(), layoutPath)
    const standalone = await tryWriteStandaloneWorkspace(ws, layout.tree())
    return { ok: true, layoutPath: layoutPath, layout: saved, standalone: standalone }
  }

  function saveProjectLayoutAs() {
    const project = currentProject()
    const currentPath = project && project.descriptor && project.descriptor.layout || currentWorkspaceLayoutPath()
    ui.prompt({
      title: 'Save Layout As',
      message: 'Workspace path',
      default: currentPath,
      okLabel: 'Save',
    }).then(function (path) {
      path = String(path || '').trim()
      if (path) saveProjectLayout({ layoutPath: path, updateDescriptor: !!project })
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
    const project = currentProject()
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
      const saveReady = canSaveLayout()
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
          { label: 'Save', disabled: !saveReady, onSelect: function () { saveProjectLayout() } },
          { label: 'Save As', disabled: !saveReady, onSelect: saveProjectLayoutAs },
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
