// Demo.project - demo-only file-backed editor project runtime.
// This is product/demo behavior, not part of the AEditor framework bundle.
;(function (aeditor, Demo) {
  'use strict'

  const projects = {}
  const definitions = []
  const DEFAULT_PREVIEW_CHARS = 24000
  const DEFAULT_PREVIEW_LINES = 240
  let activeId = null
  let nextVersion = 1

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function keys(obj) { return Object.keys(obj || {}) }

  function stableOwner(id) { return 'project:' + id }

  function runtimeOwner(id, versioned) {
    return stableOwner(id) + (versioned ? '@' + (nextVersion++) : '')
  }

  function define(spec) {
    if (!spec || !spec.id) throw new Error('Demo.project.define: spec.id is required')
    definitions.push(spec)
    return spec
  }

  function normalizeEntry(entry) {
    if (typeof entry === 'string') return { type: 'script', src: entry }
    return Object.assign({ type: 'script' }, entry || {})
  }

  async function readJson(workspace, path) {
    const file = await workspace.read(path)
    return JSON.parse(file.text)
  }

  function normalizeDescriptor(raw) {
    const d = clone(raw || {})
    if (d.type !== 'aeditor-project') throw new Error('Invalid project descriptor type')
    if (!d.id) throw new Error('Project descriptor requires id')
    d.schemaVersion = d.schemaVersion || 1
    d.kind = d.kind || 'app'
    d.entry = normalizeEntry(d.entry)
    d.styles = d.styles || []
    d.permissions = d.permissions || {}
    return d
  }

  function hasPermission(runtime, key) {
    if (runtime.options && runtime.options.fullAccess) return true
    const p = runtime.descriptor.permissions || {}
    if (p[key] === true) return true
    if (key === 'workspace.read' && p.workspace === 'read') return true
    if ((key === 'workspace.read' || key === 'workspace.write') && p.workspace === 'readwrite') return true
    return false
  }

  function requirePermission(runtime, key) {
    if (!hasPermission(runtime, key)) throw new Error('Project permission denied: ' + key)
  }

  function workspaceFor(runtime) {
    const ws = runtime.workspace
    return {
      rootId: ws.rootId,
      kind: ws.kind,
      resolveUrl: ws.resolveUrl,
      list: function (path) { requirePermission(runtime, 'workspace.read'); return ws.list(path || '') },
      read: function (path) { requirePermission(runtime, 'workspace.read'); return ws.read(path) },
      write: function (path, text, opts) { requirePermission(runtime, 'workspace.write'); return ws.write(path, text, opts || {}) },
      patch: function (path, baseHash, patches) { requirePermission(runtime, 'workspace.write'); return ws.patch(path, baseHash, patches || []) },
      search: function (query, opts) { requirePermission(runtime, 'workspace.read'); return ws.search(query, opts || {}) },
      stat: function (path) { requirePermission(runtime, 'workspace.read'); return ws.stat(path) },
      watch: function (path, handler) { return ws.watch ? ws.watch(path, handler) : function () {} },
      delete: function (path) { requirePermission(runtime, 'workspace.delete'); return ws.delete(path) },
    }
  }

  function cleanupOwner(owner) {
    if (aeditor.ai && aeditor.ai.unregisterToolOwner) aeditor.ai.unregisterToolOwner(owner)
    if (aeditor.ai && aeditor.ai.references && aeditor.ai.references.unregisterOwner) aeditor.ai.references.unregisterOwner(owner)
    if (aeditor.ai && aeditor.ai.operations && aeditor.ai.operations.unregisterOwner) aeditor.ai.operations.unregisterOwner(owner)
    if (aeditor.commands && aeditor.commands.unregisterOwner) aeditor.commands.unregisterOwner(owner)
    if (aeditor.settings && aeditor.settings.unregisterOwner) aeditor.settings.unregisterOwner(owner)
    if (aeditor.unregisterComponentOwner) aeditor.unregisterComponentOwner(owner)
  }

  function wrapOperation(runtime, spec) {
    const op = Object.assign({}, spec || {})
    if (typeof op.apply === 'function') {
      const apply = op.apply
      op.apply = function (preview, ctx) {
        requirePermission(runtime, 'ai.operations.apply')
        return apply(preview, ctx)
      }
    }
    return op
  }

  function makeContext(runtime) {
    const meta = { owner: runtime.owner, layer: 'project' }
    const ctx = {
      projectId: runtime.id,
      owner: runtime.owner,
      stableOwner: stableOwner(runtime.id),
      descriptor: clone(runtime.descriptor),
      workspace: workspaceFor(runtime),
      layout: runtime.layoutData,
      bus: {
        emit: aeditor.bus.emit,
        on: function (topic, handler) {
          const off = aeditor.bus.on(topic, handler)
          runtime.cleanups.push(off)
          return off
        },
      },
      component: function (id, spec) {
        return aeditor.registerComponent(id, spec, meta)
      },
      command: function (id, spec) {
        return aeditor.commands.register(id, spec, meta)
      },
      menu: function (id, spec) {
        return aeditor.commands.registerMenu(id, spec, meta)
      },
      tool: function (id, spec) {
        if (!aeditor.ai || !aeditor.ai.registerTool) throw new Error('Project tool registry is not available')
        requirePermission(runtime, 'ai.tools.register')
        return aeditor.ai.registerTool(id, spec, meta)
      },
      reference: function (id, spec) {
        if (!aeditor.ai || !aeditor.ai.references) throw new Error('Project reference registry is not available')
        return aeditor.ai.references.register(id, spec, meta)
      },
      operation: function (id, spec) {
        if (!aeditor.ai || !aeditor.ai.operations) throw new Error('Project operation registry is not available')
        return aeditor.ai.operations.register(id, wrapOperation(runtime, spec), meta)
      },
      settingsSection: function (id, spec) {
        return aeditor.settings.registerSection(id, spec, meta)
      },
      settingsSchema: function (sectionId, schema) {
        return aeditor.settings.registerSchema(sectionId, schema, meta)
      },
      settingsPage: function (id, spec) {
        return aeditor.settings.registerPage(id, spec, meta)
      },
      style: function (path) {
        return installStyle(runtime, path)
      },
      createDockLayout: function (container, config) {
        config = Object.assign({ name: runtime.id }, config || {})
        return aeditor.createDockLayout(container, config)
      },
      onCleanup: function (fn) {
        runtime.cleanups.push(fn)
      },
    }
    return ctx
  }

  async function textUrl(runtime, path, mime) {
    requirePermission(runtime, 'workspace.read')
    const file = await runtime.workspace.read(path)
    if (typeof Blob === 'undefined' || !window.URL || !URL.createObjectURL) {
      throw new Error('Project loader requires object URLs for file-backed entries')
    }
    const url = URL.createObjectURL(new Blob([file.text], { type: mime || 'text/plain' }))
    runtime.objectUrls.push(url)
    return url
  }

  async function loadScript(runtime, path) {
    if (!path) return
    if (typeof document === 'undefined' || !document.createElement) throw new Error('Project script loading requires document')
    const src = await textUrl(runtime, path, 'text/javascript')
    await new Promise(function (resolve, reject) {
      const el = document.createElement('script')
      el.src = src
      el.onload = function () { resolve() }
      el.onerror = function () { reject(new Error('Failed to load project script: ' + path)) }
      document.head.appendChild(el)
      runtime.entryNodes.push(el)
    })
  }

  async function loadModule(runtime, path, exportName) {
    const url = await textUrl(runtime, path, 'text/javascript')
    const mod = await import(url)
    return exportName ? mod[exportName] : (mod.default || mod)
  }

  async function installStyle(runtime, path) {
    if (typeof document === 'undefined' || !document.createElement) return null
    requirePermission(runtime, 'workspace.read')
    const file = await runtime.workspace.read(path)
    const el = document.createElement('style')
    el.setAttribute('data-aeditor-project-style', runtime.id)
    el.textContent = file.text
    document.head.appendChild(el)
    runtime.styleNodes.push(el)
    return el
  }

  function findDefinedSpec(id, fromIndex) {
    for (let i = definitions.length - 1; i >= fromIndex; i--) {
      if (definitions[i] && definitions[i].id === id) return definitions[i]
    }
    return null
  }

  async function loadSpec(runtime) {
    const entry = runtime.descriptor.entry || {}
    const start = definitions.length
    requirePermission(runtime, 'project.code.load')
    if (entry.type === 'module') {
      return loadModule(runtime, entry.src, entry.export || 'default')
    }
    if (entry.src) await loadScript(runtime, entry.src)
    if (entry.symbol && window[entry.symbol]) return window[entry.symbol]
    const defined = findDefinedSpec(runtime.id, start)
    if (defined) return defined
    throw new Error('Project entry did not provide a spec: ' + runtime.id)
  }

  async function activateRuntime(runtime, spec, mountTarget) {
    runtime.spec = spec
    runtime.ctx = makeContext(runtime)
    for (let i = 0; i < runtime.descriptor.styles.length; i++) {
      await installStyle(runtime, runtime.descriptor.styles[i])
    }
    if (spec.setup) await Promise.resolve(spec.setup(runtime.ctx))
    if (spec.mount && mountTarget) {
      runtime.handle = await Promise.resolve(spec.mount(mountTarget, runtime.ctx))
    }
    return runtime
  }

  async function prepareRuntime(workspace, descriptor, options, spec) {
    const runtime = {
      id: descriptor.id,
      owner: runtimeOwner(descriptor.id, !!(options && options.versionedOwner)),
      workspace: workspace,
      descriptor: descriptor,
      options: options || {},
      cleanups: [],
      styleNodes: [],
      entryNodes: [],
      objectUrls: [],
      layoutData: null,
      handle: null,
      spec: spec || null,
      ctx: null,
      openedAt: Date.now(),
    }
    if (descriptor.layout) {
      requirePermission(runtime, 'workspace.read')
      const layout = await workspace.read(descriptor.layout)
      const parsed = JSON.parse(layout.text)
      runtime.layoutData = parsed.root || parsed
    }
    runtime.spec = spec || await loadSpec(runtime)
    return runtime
  }

  async function createRuntime(workspace, descriptor, options, spec) {
    const runtime = await prepareRuntime(workspace, descriptor, options, spec)
    return activateRuntime(runtime, runtime.spec, options && options.mount)
  }

  async function open(workspace, options) {
    options = options || {}
    const descriptor = normalizeDescriptor(await readJson(workspace, 'aeditor.project.json'))
    const old = projects[descriptor.id] || null
    const runtime = await prepareRuntime(workspace, descriptor, options)
    if (old) close(descriptor.id)
    try {
      await activateRuntime(runtime, runtime.spec, options && options.mount)
    } catch (err) {
      disposeRuntime(runtime)
      if (old) {
        const restored = await createRuntime(old.workspace, old.descriptor, old.options, old.spec)
        projects[old.id] = restored
        activeId = old.id
      }
      throw err
    }
    projects[descriptor.id] = runtime
    activeId = descriptor.id
    return publicRuntime(runtime)
  }

  function disposeRuntime(runtime) {
    if (!runtime) return
    if (runtime.handle && runtime.handle.destroy) runtime.handle.destroy()
    for (let i = runtime.cleanups.length - 1; i >= 0; i--) runtime.cleanups[i]()
    runtime.cleanups.length = 0
    cleanupOwner(runtime.owner)
    for (let s = runtime.styleNodes.length - 1; s >= 0; s--) if (runtime.styleNodes[s].parentNode) runtime.styleNodes[s].parentNode.removeChild(runtime.styleNodes[s])
    for (let e = runtime.entryNodes.length - 1; e >= 0; e--) if (runtime.entryNodes[e].parentNode) runtime.entryNodes[e].parentNode.removeChild(runtime.entryNodes[e])
    for (let u = runtime.objectUrls.length - 1; u >= 0; u--) if (window.URL && URL.revokeObjectURL) URL.revokeObjectURL(runtime.objectUrls[u])
  }

  function close(id) {
    id = id || activeId
    const runtime = projects[id]
    if (!runtime) return false
    disposeRuntime(runtime)
    delete projects[id]
    if (activeId === id) activeId = keys(projects)[0] || null
    return true
  }

  async function reload(id, options) {
    id = id || activeId
    const old = projects[id]
    if (!old) throw new Error('Project not open: ' + id)
    requirePermission(old, 'project.reload')
    const workspace = old.workspace
    const mount = options && Object.prototype.hasOwnProperty.call(options, 'mount') ? options.mount : (old.options && old.options.mount)
    const nextOptions = Object.assign({}, old.options || {}, options || {}, { mount: mount })
    const descriptor = normalizeDescriptor(await readJson(workspaceFor(old), 'aeditor.project.json'))
    const candidate = await prepareRuntime(workspace, descriptor, nextOptions)
    close(id)
    try {
      await activateRuntime(candidate, candidate.spec, mount)
      projects[candidate.id] = candidate
      activeId = candidate.id
      return publicRuntime(candidate)
    } catch (err) {
      disposeRuntime(candidate)
      const restored = await createRuntime(workspace, old.descriptor, Object.assign({}, old.options || {}, { mount: mount }), old.spec)
      projects[id] = restored
      activeId = id
      throw err
    }
  }

  function current() {
    return activeId ? publicRuntime(projects[activeId]) : null
  }

  function list() {
    return keys(projects).map(function (id) { return publicRuntime(projects[id]) })
  }

  function publicRuntime(runtime) {
    if (!runtime) return null
    return {
      id: runtime.id,
      title: runtime.descriptor.title || runtime.id,
      kind: runtime.descriptor.kind,
      owner: runtime.owner,
      descriptor: clone(runtime.descriptor),
      workspace: runtime.workspace,
      handle: runtime.handle,
      ctx: runtime.ctx,
      close: function () { return close(runtime.id) },
      reload: function (options) { return reload(runtime.id, options || {}) },
      inspectPanel: function (panelId) {
        return runtime.handle && runtime.handle.inspectPanel ? runtime.handle.inspectPanel(panelId) : null
      },
    }
  }

  function projectForTool(projectId) {
    const p = projectId ? projects[projectId] : projects[activeId]
    if (!p) throw new Error('No open AEditor project')
    return p
  }

  function textPreview(file, options) {
    const o = options || {}
    const maxChars = o.maxChars || DEFAULT_PREVIEW_CHARS
    const maxLines = o.maxLines || DEFAULT_PREVIEW_LINES
    const text = String(file.text || '')
    const lines = text.split(/\r?\n/)
    const previewLines = lines.slice(0, maxLines)
    let preview = previewLines.join('\n')
    if (preview.length > maxChars) preview = preview.slice(0, maxChars)
    return {
      path: file.path,
      hash: file.hash,
      size: file.size,
      lines: lines.length,
      truncated: text.length > preview.length || lines.length > previewLines.length,
      previewStartLine: 1,
      previewEndLine: Math.min(lines.length, previewLines.length),
      preview: preview,
    }
  }

  async function readProjectFile(runtime, path, options) {
    const file = await workspaceFor(runtime).read(path)
    if (options && options.full === true) return file
    const max = options && options.maxChars || DEFAULT_PREVIEW_CHARS
    if (file.size <= max) return file
    return textPreview(file, options)
  }

  function safeId(value) {
    return String(value || 'panel').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'panel'
  }

  function jsString(value) {
    return JSON.stringify(String(value == null ? '' : value))
  }

  function findDraftSource(input) {
    if (input.source) return String(input.source)
    if (!input.extensionId || !aeditor.extensions || !aeditor.extensions.get) return ''
    const ext = aeditor.extensions.get(input.extensionId)
    const components = ext && ext.manifest && ext.manifest.contributes && ext.manifest.contributes.components || []
    for (let i = 0; i < components.length; i++) {
      if (components[i].source) return String(components[i].source)
    }
    return ''
  }

  function promotedPanelFile(input, componentId, source) {
    const title = input.title || componentId
    const icon = input.icon || ''
    const props = clone(input.props || {})
    return [
      '// AEditor project panel: ' + componentId,
      ';(function (aeditor) {',
      "  'use strict'",
      '',
      '  aeditor.registerComponent(' + jsString(componentId) + ', {',
      '    title: ' + jsString(title) + ',',
      '    icon: ' + jsString(icon) + ',',
      '    defaults: function () {',
      '      return { title: ' + jsString(title) + ', icon: ' + jsString(icon) + ', props: ' + JSON.stringify(props) + ' }',
      '    },',
      '    factory: ' + source + ',',
      '    dispose: function (el) {',
      '      if (aeditor.ui && aeditor.ui.dispose) aeditor.ui.dispose(el)',
      '    },',
      '  })',
      '})(window.aeditor = window.aeditor || {})',
      '',
    ].join('\n')
  }

  function addPanelToLayoutTree(node, dock, panel) {
    if (!node) return node
    if (node.type === 'dock') {
      if (node.id !== dock && node.name !== dock) return node
      const panels = (node.panels || []).slice()
      panels.push(panel)
      return Object.assign({}, node, { panels: panels, activeId: panel.id })
    }
    if (!node.children) return node
    let changed = false
    const children = node.children.map(function (child) {
      const next = addPanelToLayoutTree(child, dock, panel)
      if (next !== child) changed = true
      return next
    })
    return changed ? Object.assign({}, node, { children: children }) : node
  }

  async function promotePanel(input) {
    input = input || {}
    const runtime = projectForTool(input.projectId)
    const ws = workspaceFor(runtime)
    requirePermission(runtime, 'workspace.write')
    const id = safeId(input.id || input.extensionId || input.title)
    const componentId = input.componentId || (runtime.id + '.' + id)
    const path = input.path || ('src/panels/' + id + '.panel.js')
    const source = findDraftSource(input)
    if (!source) throw new Error('project.promotePanel: source or extensionId is required')
    const file = await ws.write(path, promotedPanelFile(input, componentId, source), input.baseHash ? { baseHash: input.baseHash } : {})
    let layout = null
    const layoutPath = input.layoutPath || runtime.descriptor.layout || ''
    if (layoutPath && input.dock) {
      const current = await ws.read(layoutPath)
      const parsed = JSON.parse(current.text)
      const root = parsed.root || parsed
      const panel = {
        id: input.panelId || ('panel-' + id),
        component: componentId,
        title: input.title || id,
        icon: input.icon || '',
        props: clone(input.props || {}),
        owner: stableOwner(runtime.id),
      }
      const nextRoot = addPanelToLayoutTree(root, input.dock, panel)
      const nextLayout = parsed.root ? Object.assign({}, parsed, { root: nextRoot }) : nextRoot
      layout = await ws.write(layoutPath, JSON.stringify(nextLayout, null, 2), { baseHash: current.hash })
    }
    return { ok: true, projectId: runtime.id, componentId: componentId, path: file.path, hash: file.hash, layout: layout }
  }

  async function readSourceProjection(runtime, path, options) {
    const o = options || {}
    const projection = o.projection || 'summary'
    const ws = workspaceFor(runtime)
    if (projection === 'search') {
      return { path: path, projection: projection, matches: await ws.search(o.query || '', { path: path, limit: o.limit || 20 }) }
    }
    const file = await ws.read(path)
    const lines = file.text.split(/\r?\n/)
    if (projection === 'range') {
      const start = Math.max(1, o.startLine || o.page && o.page.startLine || 1)
      const end = Math.min(lines.length, o.endLine || o.page && o.page.endLine || start)
      return { path: path, projection: projection, hash: file.hash, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
    }
    if (projection === 'full') return Object.assign({ projection: projection }, file)
    if (projection === 'outline' || projection === 'events') {
      const out = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (projection === 'outline' && /^\s*(function|const|let|var)\s+[\w$]+|aeditor\.registerComponent|Demo\.project\.define/.test(line)) {
          out.push({ line: i + 1, text: line.trim() })
        }
        if (projection === 'events' && /ctx\.bus|aeditor\.bus|addEventListener|removeEventListener|onCleanup|registerScopedOverlay/.test(line)) {
          out.push({ line: i + 1, text: line.trim() })
        }
      }
      return { path: path, projection: projection, hash: file.hash, size: file.size, lines: lines.length, entries: out }
    }
    return {
      id: runtime.id,
      title: runtime.descriptor.title || runtime.id,
      path: path,
      projection: 'summary',
      hash: file.hash,
      size: file.size,
      lines: lines.length,
      panels: runtime.handle && runtime.handle.inspectPanels ? runtime.handle.inspectPanels() : [],
    }
  }

  function registerAiTools() {
    if (!aeditor.ai || !aeditor.ai.registerTool) return
    const owner = 'demo.project'
    aeditor.ai.registerTool('demo.project.readDescriptor', {
      title: 'Read Project Descriptor',
      description: 'Read the current AEditor project descriptor.',
      schema: { type: 'object', properties: { projectId: { type: 'string' } } },
      run: function (args) { return clone(projectForTool(args && args.projectId).descriptor) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.searchFiles', {
      title: 'Search Project Files',
      description: 'Search files in the current project workspace. Prefer this before reading whole files.',
      schema: { type: 'object', required: ['query'], properties: { projectId: { type: 'string' }, query: { type: 'string' }, path: { type: 'string' }, limit: { type: 'number' } } },
      run: function (args) { return workspaceFor(projectForTool(args && args.projectId)).search(args.query || '', args || {}) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.readFile', {
      title: 'Read Project File',
      description: 'Read one project file. Use readFileRange for large source files.',
      schema: { type: 'object', required: ['path'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, full: { type: 'boolean' }, maxChars: { type: 'number' }, maxLines: { type: 'number' } } },
      run: function (args) { return readProjectFile(projectForTool(args && args.projectId), args.path, args || {}) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.readFileRange', {
      title: 'Read Project File Range',
      description: 'Read a 1-based line range from one project file.',
      schema: { type: 'object', required: ['path', 'startLine', 'endLine'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } } },
      run: async function (args) {
        const file = await workspaceFor(projectForTool(args && args.projectId)).read(args.path)
        const lines = file.text.split(/\r?\n/)
        const start = Math.max(1, args.startLine || 1)
        const end = Math.min(lines.length, args.endLine || start)
        return { path: file.path, hash: file.hash, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
      },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.readSource', {
      title: 'Read Project Source Projection',
      description: 'Read a source file projection: summary, outline, events, search, range, or full.',
      schema: { type: 'object', required: ['path'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, projection: { type: 'string' }, query: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' }, limit: { type: 'number' } } },
      run: function (args) { return readSourceProjection(projectForTool(args && args.projectId), args.path, args || {}) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.writeFile', {
      title: 'Write Project File',
      description: 'Write one project file. Broad rewrites are high risk; prefer patchFile when possible.',
      schema: { type: 'object', required: ['path', 'text'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, text: { type: 'string' }, baseHash: { type: 'string' } } },
      run: function (args) { return workspaceFor(projectForTool(args && args.projectId)).write(args.path, args.text || '', { baseHash: args.baseHash }) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.createFile', {
      title: 'Create Project File',
      description: 'Create or overwrite one project file in the authorized workspace.',
      schema: { type: 'object', required: ['path', 'text'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, text: { type: 'string' } } },
      run: function (args) { return workspaceFor(projectForTool(args && args.projectId)).write(args.path, args.text || '') },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.patchFile', {
      title: 'Patch Project File',
      description: 'Patch a project file with 1-based line patches and a base hash.',
      schema: { type: 'object', required: ['path', 'baseHash', 'patches'], properties: { projectId: { type: 'string' }, path: { type: 'string' }, baseHash: { type: 'string' }, patches: { type: 'array' } } },
      run: function (args) { return workspaceFor(projectForTool(args && args.projectId)).patch(args.path, args.baseHash, args.patches || []) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.deleteFile', {
      title: 'Delete Project File',
      description: 'Delete one project file from the authorized workspace.',
      schema: { type: 'object', required: ['path'], properties: { projectId: { type: 'string' }, path: { type: 'string' } } },
      run: function (args) { return workspaceFor(projectForTool(args && args.projectId)).delete(args.path) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.promotePanel', {
      title: 'Promote Draft Panel',
      description: 'Write a session draft panel to project files and optionally add it to layout.json.',
      schema: {
        type: 'object',
        required: ['id'],
        properties: {
          projectId: { type: 'string' },
          extensionId: { type: 'string' },
          id: { type: 'string' },
          componentId: { type: 'string' },
          title: { type: 'string' },
          icon: { type: 'string' },
          dock: { type: 'string' },
          path: { type: 'string' },
          layoutPath: { type: 'string' },
          source: { type: 'string' },
          props: { type: 'object' },
        },
      },
      run: function (args) { return promotePanel(args || {}) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.updateDescriptor', {
      title: 'Update Project Descriptor',
      description: 'Update aeditor.project.json in the current project.',
      schema: { type: 'object', required: ['descriptor'], properties: { projectId: { type: 'string' }, descriptor: { type: 'object' }, baseHash: { type: 'string' } } },
      run: function (args) {
        return workspaceFor(projectForTool(args && args.projectId)).write('aeditor.project.json', JSON.stringify(args.descriptor || {}, null, 2), { baseHash: args.baseHash })
      },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.reload', {
      title: 'Reload Project',
      description: 'Reload the current AEditor project after file edits.',
      schema: { type: 'object', properties: { projectId: { type: 'string' } } },
      run: function (args) { return reload(args && args.projectId) },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.inspectPanel', {
      title: 'Inspect Project Panel',
      description: 'Inspect runtime health for a mounted project panel.',
      schema: { type: 'object', required: ['panelId'], properties: { projectId: { type: 'string' }, panelId: { type: 'string' } } },
      run: function (args) {
        const p = projectForTool(args && args.projectId)
        return p.handle && p.handle.inspectPanel ? p.handle.inspectPanel(args.panelId) : null
      },
    }, { owner: owner, layer: 'builtin' })
    aeditor.ai.registerTool('demo.project.runCheck', {
      title: 'Run Project Check',
      description: 'Run the current project check hook when the project provides one.',
      schema: { type: 'object', properties: { projectId: { type: 'string' } } },
      run: function (args) {
        const p = projectForTool(args && args.projectId)
        if (p.spec && p.spec.check) return p.spec.check(p.ctx)
        return { ok: true, checked: false, reason: 'Project has no check hook' }
      },
    }, { owner: owner, layer: 'builtin' })
  }

  Demo.project = {
    define: define,
    open: open,
    close: close,
    reload: reload,
    current: current,
    list: list,
    promotePanel: promotePanel,
    stableOwner: stableOwner,
  }

  registerAiTools()
})(window.aeditor = window.aeditor || {}, window.Demo = window.Demo || {})
