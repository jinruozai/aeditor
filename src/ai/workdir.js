// aeditor.ai workspace - one optional bounded root shared by all agents.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  const version = aeditor.signal(0)
  let workspace = null
  let directory = null

  function bump() { version.set(version.peek() + 1) }

  function directoryId(kind, label) {
    return String(kind || 'workspace') + ':' + String(label || 'Project')
  }

  function normalizeWorkspaceMeta(ws, meta) {
    const m = meta || {}
    const kind = String(m.kind || (ws && ws.kind && ws.kind()) || 'workspace')
    const label = String(m.label || m.name || m.path || (ws && ws.rootId && ws.rootId()) || 'Workspace')
    return {
      id: String(m.id || m.path || directoryId(kind, label)),
      label: label,
      kind: kind,
    }
  }

  function setWorkspace(ws, meta) {
    if (!ws) throw new Error('AI workspace is required')
    workspace = ws
    directory = normalizeWorkspaceMeta(ws, meta)
    bump()
    return directory
  }

  function clearWorkspace() {
    workspace = null
    directory = null
    bump()
  }

  async function selectWorkspaceDirectory() {
    const ws = await aeditor.workspace.openDirectory({ mode: 'readwrite' })
    return setWorkspace(ws)
  }

  function currentWorkspace() { return workspace }
  function workspaceMeta() { return directory }
  function workspaceLabel() { return directory && directory.label ? directory.label : 'Untitled' }

  function requireWorkspace() {
    if (!workspace) throw new Error('AI workspace is not available. Set an AI workspace first.')
    return workspace
  }

  function compactText(text, opts) {
    const o = opts || {}
    let out = String(text == null ? '' : text)
    if (o.maxLines > 0) out = out.split(/\r?\n/).slice(0, o.maxLines).join('\n')
    const maxChars = o.full ? 0 : (o.maxChars || 20000)
    if (maxChars > 0 && out.length > maxChars) out = out.slice(0, maxChars) + '\n...[truncated]'
    return out
  }

  async function readFile(args) {
    const file = await requireWorkspace().read(args.path)
    return Object.assign({}, file, { text: compactText(file.text, args || {}) })
  }

  async function readFileRange(args) {
    const file = await requireWorkspace().read(args.path)
    const lines = file.text.split(/\r?\n/)
    const start = Math.max(1, args.startLine || 1)
    const end = Math.min(lines.length, args.endLine || start)
    return { path: file.path, hash: file.hash, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
  }

  function registerTools() {
    if (!ai.registerTool) return
    const owner = 'aeditor.ai.workdir'
    ai.registerTool('workspace.listFiles', {
      title: 'List Workspace Files',
      description: 'List files under the current AI workspace.',
      schema: { type: 'object', properties: { path: { type: 'string' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().list(args && args.path || '') },
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.searchFiles', {
      title: 'Search Workspace Files',
      description: 'Search text in the current AI workspace. Prefer this before reading whole files.',
      schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, path: { type: 'string' }, limit: { type: 'number' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().search(args.query || '', args || {}) },
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.readFile', {
      title: 'Read Workspace File',
      description: 'Read one file from the current AI workspace. Use readFileRange for large source files.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, full: { type: 'boolean' }, maxChars: { type: 'number' }, maxLines: { type: 'number' } } },
      permissions: ['tool.call'],
      run: readFile,
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.readFileRange', {
      title: 'Read Workspace File Range',
      description: 'Read a 1-based line range from one workspace file.',
      schema: { type: 'object', required: ['path', 'startLine', 'endLine'], properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } } },
      permissions: ['tool.call'],
      run: readFileRange,
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.writeFile', {
      title: 'Write Workspace File',
      description: 'Write one file inside the current AI workspace. Prefer patchFile for existing files when possible.',
      schema: { type: 'object', required: ['path', 'text'], properties: { path: { type: 'string' }, text: { type: 'string' }, baseHash: { type: 'string' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().write(args.path, args.text || '', { baseHash: args.baseHash }) },
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.patchFile', {
      title: 'Patch Workspace File',
      description: 'Patch a workspace file with 1-based line patches and a base hash.',
      schema: { type: 'object', required: ['path', 'baseHash', 'patches'], properties: { path: { type: 'string' }, baseHash: { type: 'string' }, patches: { type: 'array' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().patch(args.path, args.baseHash, args.patches || []) },
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.deleteFile', {
      title: 'Delete Workspace File',
      description: 'Delete one file from the current AI workspace.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().delete(args.path) },
    }, { owner: owner, layer: 'builtin' })
    ai.registerTool('workspace.stat', {
      title: 'Stat Workspace Path',
      description: 'Read metadata for one path in the current AI workspace.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      permissions: ['tool.call'],
      run: function (args) { return requireWorkspace().stat(args.path) },
    }, { owner: owner, layer: 'builtin' })
  }

  ai.setWorkspace = setWorkspace
  ai.clearWorkspace = clearWorkspace
  ai.selectWorkspaceDirectory = selectWorkspaceDirectory
  ai.currentWorkspace = currentWorkspace
  ai.workspaceMeta = workspaceMeta
  ai.workspaceLabel = workspaceLabel
  ai.workspaceVersion = function () { return version() }

  registerTools()
})(window.aeditor = window.aeditor || {})
