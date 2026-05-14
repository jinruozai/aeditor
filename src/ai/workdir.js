// aeditor.ai workspace - one optional bounded root shared by all agents.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai = aeditor.ai || {}
  const version = aeditor.signal(0)
  let workspace = null
  let directory = null

  function bump() { version.set(version.peek() + 1) }

  function clone(value) {
    return value == null ? value : (ai.serialize && ai.serialize.clone ? ai.serialize.clone(value) : JSON.parse(JSON.stringify(value)))
  }

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

  function workspaceAvailable() {
    return !!workspace
  }

  function compactText(text, opts) {
    const o = opts || {}
    const source = String(text == null ? '' : text)
    const sourceLines = source.split(/\r?\n/)
    let out = source
    if (o.maxLines > 0) out = sourceLines.slice(0, o.maxLines).join('\n')
    const maxChars = o.full ? 0 : (o.maxChars || 20000)
    if (maxChars > 0 && out.length > maxChars) out = out.slice(0, maxChars)
    return {
      text: out,
      truncated: out.length < source.length,
      originalSize: source.length,
      originalLines: sourceLines.length,
      previewLines: out ? out.split(/\r?\n/).length : 0,
    }
  }

  async function readFile(args) {
    const file = await requireWorkspace().read(args.path)
    return Object.assign({}, file, compactText(file.text, args || {}))
  }

  async function readFileRange(args) {
    const file = await requireWorkspace().read(args.path)
    const lines = file.text.split(/\r?\n/)
    const start = Math.max(1, args.startLine || 1)
    const end = Math.min(lines.length, args.endLine || start)
    return { path: file.path, hash: file.hash, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
  }

  async function fileSummary(args) {
    args = args || {}
    const ws = requireWorkspace()
    const root = args.path || ''
    const maxFiles = Math.max(1, args.maxFiles || 200)
    const maxDepth = args.maxDepth == null ? 4 : Math.max(0, args.maxDepth)
    const files = []
    const directories = []
    let truncated = false

    async function walk(path, depth) {
      if (files.length >= maxFiles) {
        truncated = true
        return
      }
      const entries = await ws.list(path || '')
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        if (entry.kind === 'directory') {
          directories.push({ path: entry.path, name: entry.name || entry.path.split('/').pop() })
          if (depth < maxDepth) await walk(entry.path, depth + 1)
          else truncated = true
        } else {
          files.push({
            path: entry.path,
            name: entry.name || entry.path.split('/').pop(),
            size: entry.size == null ? null : entry.size,
          })
          if (files.length >= maxFiles) {
            truncated = true
            return
          }
        }
      }
    }

    await walk(root, 0)
    return {
      root: root,
      files: files,
      directories: directories,
      fileCount: files.length,
      directoryCount: directories.length,
      truncated: truncated,
    }
  }

  function editFailurePreview(args, before, err) {
    return Object.assign(basePreview('edit', args, before, before && before.text || ''), {
      ok: false,
      code: err && err.code || 'EDIT_FAILED',
      error: String(err && err.message || err),
      hint: err && err.hint || recoveryHint(err && err.code),
      expectedHash: err && err.expectedHash || args && args.baseHash || null,
      currentHash: err && err.currentHash || before && before.hash || null,
      editIndex: err && err.editIndex != null ? err.editIndex : null,
      matchCount: err && err.matchCount != null ? err.matchCount : null,
    })
  }

  function recoveryHint(code) {
    if (code === 'STALE_FILE') return 'The file changed after it was read. Search or read the current range again and retry with the new hash.'
    if (code === 'OLD_TEXT_NOT_FOUND') return 'Read the current range and copy the exact oldText from the latest file content.'
    if (code === 'AMBIGUOUS_MATCH') return 'Include more surrounding context in oldText so it matches exactly once.'
    if (code === 'VALIDATION_FAILED') return 'Inspect the edited range and repair the syntax or data shape before retrying.'
    return null
  }

  function previewFileChange(action, args) {
    args = args || {}
    return readExistingFileState(args.path).then(function (before) {
      let after = args.text || ''
      if (action === 'edit') {
        if (!before.exists) {
          return Object.assign(basePreview(action, args, before, ''), {
            ok: false,
            code: 'FILE_NOT_FOUND',
            error: 'workspace.edit: file not found: ' + args.path,
          })
        }
        try {
          after = aeditor.workspace.applyTextEdits(before.text, args.baseHash, args.edits || [])
        } catch (err) {
          return editFailurePreview(args, before, err)
        }
      }
      if (action === 'patch') {
        if (!before.exists) {
          return Object.assign(basePreview(action, args, before, ''), {
            ok: false,
            code: 'FILE_NOT_FOUND',
            error: 'workspace.patch: file not found: ' + args.path,
          })
        }
        try {
          after = aeditor.workspace.applyLinePatches(before.text, args.baseHash, args.patches || [])
        } catch (err) {
          return Object.assign(basePreview(action, args, before, before.text), {
            ok: false,
            code: err && err.code || 'PATCH_FAILED',
            error: String(err && err.message || err),
          })
        }
      }
      if (action === 'delete') after = ''
      if (action === 'delete' && !before.exists) {
        return Object.assign(basePreview(action, args, before, after), {
          ok: false,
          code: 'FILE_NOT_FOUND',
          error: 'workspace.delete: file not found: ' + args.path,
        })
      }
      if (args.baseHash && before.exists && before.hash !== args.baseHash && action !== 'patch') {
        return Object.assign(basePreview(action, args, before, after), {
          ok: false,
          code: 'STALE_FILE',
          error: 'workspace.' + action + ': baseHash mismatch',
        })
      }
      if (action === 'write' || action === 'patch' || action === 'edit') {
        try {
          aeditor.workspace.validateText(args.path, after, args || {})
        } catch (err) {
          return Object.assign(basePreview(action, args, before, after), {
            ok: false,
            code: 'VALIDATION_FAILED',
            error: String(err && err.message || err),
          })
        }
      }
      return basePreview(action, args, before, after)
    })
  }

  function basePreview(action, args, before, after) {
    const baseHash = before && before.exists ? before.hash : aeditor.workspace.hashText('')
    return {
      ok: true,
      risk: action === 'delete' ? 'delete' : 'edit',
      title: action + ': ' + args.path,
      input: clone(args),
      resourceVersion: { type: 'workspaceFile', path: args.path, version: baseHash },
      changes: [{
        type: 'workspaceFile',
        action: action,
        path: args.path,
        baseHash: baseHash,
        baseVersion: baseHash,
        patchCount: args.patches ? args.patches.length : null,
        editCount: args.edits ? args.edits.length : null,
        diff: aeditor.workspace.diffSummary(before && before.text || '', after),
      }],
      diff: aeditor.workspace.diffSummary(before && before.text || '', after),
      before: before && before.exists ? { hash: before.hash, size: before.text.length } : null,
    }
  }

  function readExistingFileState(path) {
    return Promise.resolve().then(function () {
      return requireWorkspace().read(path)
    }).then(function (file) {
      return { exists: true, text: file.text, hash: file.hash }
    }, function () {
      return { exists: false, text: '', hash: aeditor.workspace.hashText('') }
    })
  }

  function readExistingFile(path) {
    return readExistingFileState(path).then(function (file) { return file.text })
  }

  function attachDiff(result, before, after) {
    return Object.assign({}, result, {
      diff: aeditor.workspace.diffSummary(before, after),
    })
  }

  function omitWrittenText(result) {
    if (!result || !Object.prototype.hasOwnProperty.call(result, 'text')) return result
    const next = Object.assign({}, result)
    delete next.text
    next.textOmitted = true
    return next
  }

  function writeFile(args) {
    const ws = requireWorkspace()
    return readExistingFile(args.path).then(function (before) {
      const text = String(args.text == null ? '' : args.text)
      aeditor.workspace.validateText(args.path, text, args || {})
      return ws.write(args.path, text, { baseHash: args.baseHash }).then(function (result) {
        return omitWrittenText(attachDiff(result, before, result.text))
      })
    })
  }

  function patchFile(args) {
    const ws = requireWorkspace()
    return readExistingFileState(args.path).then(function (file) {
      if (!file.exists) throw new Error('workspace.patch: file not found: ' + args.path)
      const before = file.text
      const text = aeditor.workspace.applyLinePatches(before, args.baseHash, args.patches || [])
      aeditor.workspace.validateText(args.path, text, args || {})
      return ws.write(args.path, text, { baseHash: args.baseHash }).then(function (result) {
        return omitWrittenText(attachDiff(result, before, result.text))
      })
    })
  }

  function editFile(args) {
    const ws = requireWorkspace()
    return readExistingFileState(args.path).then(function (file) {
      if (!file.exists) throw new Error('workspace.edit: file not found: ' + args.path)
      const before = file.text
      let text
      try {
        text = aeditor.workspace.applyTextEdits(before, args.baseHash, args.edits || [])
      } catch (err) {
        if (!err.hint) err.hint = recoveryHint(err.code)
        throw err
      }
      aeditor.workspace.validateText(args.path, text, args || {})
      return ws.write(args.path, text, { baseHash: args.baseHash }).then(function (result) {
        return omitWrittenText(attachDiff(result, before, result.text))
      })
    })
  }

  function deleteFile(args) {
    const ws = requireWorkspace()
    return readExistingFileState(args.path).then(function (file) {
      if (!file.exists) throw new Error('workspace.delete: file not found: ' + args.path)
      if (args.baseHash && file.hash !== args.baseHash) throw new Error('workspace.delete: baseHash mismatch')
      const before = file.text
      return ws.delete(args.path).then(function (result) {
        return attachDiff(result, before, '')
      })
    })
  }

  function baseHashFromPreview(preview) {
    const changes = preview && preview.changes || []
    return changes[0] && (changes[0].baseHash || changes[0].baseVersion) || preview && preview.baseHash || null
  }

  function inputWithPreviewBase(preview) {
    const input = Object.assign({}, preview.input || preview || {})
    if (!input.baseHash) input.baseHash = baseHashFromPreview(preview)
    return input
  }

  function applyWriteFile(preview) {
    return Promise.resolve(writeFile(inputWithPreviewBase(preview))).then(function (result) {
      return Object.assign({ applied: true, resultVersion: result.hash || null }, result)
    })
  }

  function applyPatchFile(preview) {
    return Promise.resolve(patchFile(inputWithPreviewBase(preview))).then(function (result) {
      return Object.assign({ applied: true, resultVersion: result.hash || null }, result)
    })
  }

  function applyEditFile(preview) {
    return Promise.resolve(editFile(inputWithPreviewBase(preview))).then(function (result) {
      return Object.assign({ applied: true, resultVersion: result.hash || null }, result)
    })
  }

  function applyDeleteFile(preview) {
    return Promise.resolve(deleteFile(inputWithPreviewBase(preview))).then(function (result) {
      return Object.assign({ applied: true, resultVersion: null }, result)
    })
  }

  function registerTools() {
    const owner = 'aeditor.ai.workdir'
    ai.tools.register('workspace.listFiles', {
      title: 'List Workspace Files',
      description: 'List files under the current AI workspace.',
      schema: { type: 'object', properties: { path: { type: 'string' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
      run: function (args) { return requireWorkspace().list(args && args.path || '') },
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.fileSummary', {
      title: 'Workspace File Summary',
      description: 'Read a compact recursive file tree summary. Use this before reading many files.',
      schema: { type: 'object', properties: { path: { type: 'string' }, maxFiles: { type: 'number' }, maxDepth: { type: 'number' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
      run: fileSummary,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.searchFiles', {
      title: 'Search Workspace Files',
      description: 'Search text in the current AI workspace. Results include fileHash, line, column, and preview ranges for precise follow-up reads.',
      schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, path: { type: 'string' }, include: { type: 'array' }, exclude: { type: 'array' }, mode: { type: 'string', enum: ['literal', 'regex'] }, caseSensitive: { type: 'boolean' }, before: { type: 'number' }, after: { type: 'number' }, limit: { type: 'number' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
      run: function (args) { return requireWorkspace().search(args.query || '', args || {}) },
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.readFile', {
      title: 'Read Workspace File',
      description: 'Read one file from the current AI workspace. Use readFileRange for large source files.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, full: { type: 'boolean' }, maxChars: { type: 'number' }, maxLines: { type: 'number' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
      run: readFile,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.readFileRange', {
      title: 'Read Workspace File Range',
      description: 'Read a 1-based line range from one workspace file.',
      schema: { type: 'object', required: ['path', 'startLine', 'endLine'], properties: { path: { type: 'string' }, startLine: { type: 'number' }, endLine: { type: 'number' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
      run: readFileRange,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.editFile', {
      title: 'Edit Workspace File',
      description: 'Precisely edit an existing workspace file with baseHash and exact oldText/newText replacements. Prefer this for existing source files.',
      schema: {
        type: 'object',
        required: ['path', 'baseHash', 'edits'],
        properties: {
          path: { type: 'string' },
          baseHash: { type: 'string' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              required: ['oldText', 'newText'],
              properties: {
                oldText: { type: 'string' },
                newText: { type: 'string' },
                replaceAll: { type: 'boolean' },
              },
            },
          },
          validate: { type: 'string', enum: ['auto', 'none', 'javascript', 'json'] },
        },
      },
      permissions: ['tool.call', 'tool.apply'],
      available: workspaceAvailable,
      preview: function (args) { return previewFileChange('edit', args) },
      apply: applyEditFile,
      run: editFile,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.writeFile', {
      title: 'Write Workspace File',
      description: 'Write one complete file inside the current AI workspace. JS/JSON writes are validated before commit; prefer editFile for existing source files.',
      schema: { type: 'object', required: ['path', 'text'], properties: { path: { type: 'string' }, text: { type: 'string' }, baseHash: { type: 'string' }, validate: { type: 'string', enum: ['auto', 'none', 'javascript', 'json'] } } },
      permissions: ['tool.call', 'tool.apply'],
      available: workspaceAvailable,
      preview: function (args) { return previewFileChange('write', args) },
      apply: applyWriteFile,
      run: writeFile,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.patchFile', {
      title: 'Patch Workspace File',
      description: 'Patch a workspace file with 1-based line patches and a base hash. JS/JSON results are validated before commit.',
      schema: { type: 'object', required: ['path', 'baseHash', 'patches'], properties: { path: { type: 'string' }, baseHash: { type: 'string' }, patches: { type: 'array' }, validate: { type: 'string', enum: ['auto', 'none', 'javascript', 'json'] } } },
      permissions: ['tool.call', 'tool.apply'],
      available: workspaceAvailable,
      preview: function (args) { return previewFileChange('patch', args) },
      apply: applyPatchFile,
      run: patchFile,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.deleteFile', {
      title: 'Delete Workspace File',
      description: 'Delete one file from the current AI workspace.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, baseHash: { type: 'string' } } },
      permissions: ['tool.call', 'tool.apply'],
      available: workspaceAvailable,
      preview: function (args) { return previewFileChange('delete', args) },
      apply: applyDeleteFile,
      run: deleteFile,
    }, { owner: owner, layer: 'builtin' })
    ai.tools.register('workspace.stat', {
      title: 'Stat Workspace Path',
      description: 'Read metadata for one path in the current AI workspace.',
      schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      permissions: ['tool.call'],
      available: workspaceAvailable,
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
