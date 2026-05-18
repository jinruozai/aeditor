// aiditor.workspace - bounded file access adapters.
;(function (aiditor) {
  'use strict'

  const workspace = {}
  const HANDLE_DB = 'aiditor.workspace.handles'
  const HANDLE_STORE = 'handles'

  function hashText(text) {
    text = String(text == null ? '' : text)
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return 'aiditor-fnv1a-' + h.toString(16)
  }

  function normalizePath(path) {
    path = String(path || '').replace(/\\/g, '/')
    const raw = path.split('/')
    const out = []
    for (let i = 0; i < raw.length; i++) {
      const part = raw[i]
      if (!part || part === '.') continue
      if (part === '..') throw new Error('workspace: path escapes root: ' + path)
      out.push(part)
    }
    return out.join('/')
  }

  function parentPath(path) {
    const i = path.lastIndexOf('/')
    return i < 0 ? '' : path.slice(0, i)
  }

  function fileName(path) {
    const i = path.lastIndexOf('/')
    return i < 0 ? path : path.slice(i + 1)
  }

  function textResult(path, text) {
    text = String(text == null ? '' : text)
    return { path: path, text: text, hash: hashText(text), size: text.length }
  }

  function workspaceError(code, message, extra) {
    const err = new Error(message)
    err.code = code
    if (extra) Object.keys(extra).forEach(function (key) { err[key] = extra[key] })
    return err
  }

  function diffSummary(before, after) {
    before = String(before == null ? '' : before)
    after = String(after == null ? '' : after)
    const a = before.split(/\r?\n/)
    const b = after.split(/\r?\n/)
    let prefix = 0
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
    let suffix = 0
    while (
      suffix + prefix < a.length &&
      suffix + prefix < b.length &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    ) suffix++
    const removed = Math.max(0, a.length - prefix - suffix)
    const added = Math.max(0, b.length - prefix - suffix)
    return {
      beforeHash: hashText(before),
      afterHash: hashText(after),
      beforeSize: before.length,
      afterSize: after.length,
      beforeLines: a.length,
      afterLines: b.length,
      startLine: prefix + 1,
      removedLines: removed,
      addedLines: added,
      changed: before !== after,
    }
  }

  function extensionOf(path) {
    const name = fileName(normalizePath(path)).toLowerCase()
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.slice(i) : ''
  }

  function hasTruncationMarker(text) {
    return String(text || '').indexOf('...[truncated]') >= 0
  }

  function isClassicScript(text) {
    return !/(^|\n)\s*(import\s+[\w*{(]|export\s+)/.test(String(text || ''))
  }

  function validateText(path, text, opts) {
    const o = opts || {}
    const mode = o.validate || 'auto'
    if (mode === false || mode === 'none') return true
    text = String(text == null ? '' : text)
    if (hasTruncationMarker(text)) throw new Error('workspace.validate: text contains a truncation marker: ' + path)
    const ext = extensionOf(path)
    const jsonLike = mode === 'json' || (mode === 'auto' && (ext === '.json' || ext === '.jsonc'))
    const jsLike = mode === 'javascript' || (mode === 'auto' && ['.js', '.mjs', '.cjs'].indexOf(ext) >= 0)
    if (jsonLike) {
      try { JSON.parse(text) } catch (err) {
        throw new Error('workspace.validate: invalid JSON in ' + path + ': ' + (err && err.message || err))
      }
    }
    if (jsLike) {
      if (mode === 'javascript' || isClassicScript(text)) {
        try { ;(new Function(text)) } catch (err) {
          throw new Error('workspace.validate: invalid JavaScript in ' + path + ': ' + (err && err.message || err))
        }
      }
    }
    return true
  }

  function applyLinePatches(text, baseHash, patches) {
    if (baseHash && hashText(text) !== baseHash) throw new Error('workspace.patch: baseHash mismatch')
    const lines = String(text || '').split(/\r?\n/)
    const list = (patches || []).slice().sort(function (a, b) {
      return (b.startLine || b.start || 1) - (a.startLine || a.start || 1)
    })
    for (let i = 0; i < list.length; i++) {
      const p = list[i]
      const start = (p.startLine || p.start || 1) - 1
      const end = (p.endLine || p.end || p.startLine || p.start || 1) - 1
      const replacement = String(p.replacement == null ? '' : p.replacement)
      const next = replacement === '' ? [] : replacement.split(/\r?\n/)
      lines.splice.apply(lines, [start, Math.max(0, end - start + 1)].concat(next))
    }
    return lines.join('\n')
  }

  function countText(text, needle) {
    if (!needle) return 0
    let count = 0
    let at = 0
    while (true) {
      const index = text.indexOf(needle, at)
      if (index < 0) return count
      count++
      at = index + needle.length
    }
  }

  function applyTextEdits(text, baseHash, edits) {
    text = String(text == null ? '' : text)
    if (!baseHash) throw workspaceError('MISSING_BASE_HASH', 'workspace.edit: baseHash is required')
    const currentHash = hashText(text)
    if (currentHash !== baseHash) {
      throw workspaceError('STALE_FILE', 'workspace.edit: baseHash mismatch', {
        expectedHash: baseHash,
        currentHash: currentHash,
      })
    }
    const list = edits || []
    if (!list.length) throw workspaceError('NO_EDITS', 'workspace.edit: edits is required')
    let next = text
    for (let i = 0; i < list.length; i++) {
      const edit = list[i] || {}
      const oldText = String(edit.oldText == null ? '' : edit.oldText)
      const newText = String(edit.newText == null ? '' : edit.newText)
      if (!oldText) throw workspaceError('EMPTY_OLD_TEXT', 'workspace.edit: oldText is required', { editIndex: i })
      const count = countText(next, oldText)
      if (count === 0) {
        throw workspaceError('OLD_TEXT_NOT_FOUND', 'workspace.edit: oldText was not found', {
          editIndex: i,
          hint: 'Read the current range and copy the exact oldText from the latest file content.',
        })
      }
      if (!edit.replaceAll && count > 1) {
        throw workspaceError('AMBIGUOUS_MATCH', 'workspace.edit: oldText matched more than once', {
          editIndex: i,
          matchCount: count,
          hint: 'Include more surrounding context in oldText so it matches exactly once.',
        })
      }
      next = edit.replaceAll ? next.split(oldText).join(newText) : next.replace(oldText, newText)
    }
    if (next === text) throw workspaceError('NO_CHANGE', 'workspace.edit: edits did not change the file')
    return next
  }

  function wildcardToRegExp(pattern) {
    pattern = String(pattern || '')
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\u0000/g, '.*')
    return new RegExp('^' + escaped + '$')
  }

  function patternList(value) {
    if (!value) return []
    return Array.isArray(value) ? value : [value]
  }

  function pathAllowed(path, opts) {
    const o = opts || {}
    const include = patternList(o.include)
    const exclude = patternList(o.exclude)
    if (include.length) {
      let ok = false
      for (let i = 0; i < include.length; i++) if (wildcardToRegExp(include[i]).test(path)) ok = true
      if (!ok) return false
    }
    for (let i = 0; i < exclude.length; i++) if (wildcardToRegExp(exclude[i]).test(path)) return false
    return true
  }

  function searchText(path, text, query, opts) {
    const o = opts || {}
    const max = o.maxPerFile || 20
    const before = o.before != null ? o.before : 2
    const after = o.after != null ? o.after : 2
    const sourceQuery = String(query || '')
    const caseSensitive = !!o.caseSensitive
    const needle = caseSensitive ? sourceQuery : sourceQuery.toLowerCase()
    const regex = o.mode === 'regex'
      ? new RegExp(sourceQuery, caseSensitive ? 'g' : 'gi')
      : null
    const lines = String(text || '').split(/\r?\n/)
    const out = []
    const fileHash = hashText(text)
    for (let i = 0; i < lines.length && out.length < max; i++) {
      const line = lines[i]
      const haystack = caseSensitive ? line : line.toLowerCase()
      let index = -1
      let matchText = ''
      if (regex) {
        regex.lastIndex = 0
        const m = regex.exec(line)
        if (m) {
          index = m.index
          matchText = m[0]
        }
      } else {
        index = needle ? haystack.indexOf(needle) : 0
        if (index >= 0) matchText = needle ? line.slice(index, index + sourceQuery.length) : ''
      }
      if (index >= 0) {
        const s = Math.max(0, i - before)
        const e = Math.min(lines.length - 1, i + after)
        out.push({
          path: path,
          fileHash: fileHash,
          line: i + 1,
          column: index + 1,
          matchText: matchText,
          text: line,
          previewStartLine: s + 1,
          previewEndLine: e + 1,
          preview: lines.slice(s, e + 1).join('\n'),
        })
      }
    }
    return out
  }

  function memory(files) {
    const data = {}
    const input = files || {}
    Object.keys(input).forEach(function (path) {
      data[normalizePath(path)] = String(input[path] == null ? '' : input[path])
    })

    function allPaths(prefix) {
      prefix = normalizePath(prefix || '')
      return Object.keys(data).filter(function (path) {
        return !prefix || path === prefix || path.indexOf(prefix + '/') === 0
      }).sort()
    }

    return {
      rootId: function () { return 'memory' },
      kind: function () { return 'memory' },
      list: function (path) {
        path = normalizePath(path || '')
        const seen = {}
        const out = []
        const prefix = path ? path + '/' : ''
        allPaths(path).forEach(function (item) {
          if (path && item === path) return
          const rest = item.slice(prefix.length)
          const slash = rest.indexOf('/')
          const child = slash < 0 ? item : prefix + rest.slice(0, slash)
          if (seen[child]) return
          seen[child] = true
          out.push({
            path: child,
            name: fileName(child),
            kind: slash < 0 ? 'file' : 'directory',
            size: slash < 0 ? data[child].length : 0,
          })
        })
        return Promise.resolve(out)
      },
      read: function (path) {
        path = normalizePath(path)
        if (!Object.prototype.hasOwnProperty.call(data, path)) throw new Error('workspace.read: file not found: ' + path)
        return Promise.resolve(textResult(path, data[path]))
      },
      write: function (path, text, opts) {
        path = normalizePath(path)
        const o = opts || {}
        if (o.baseHash && Object.prototype.hasOwnProperty.call(data, path) && hashText(data[path]) !== o.baseHash) {
          throw new Error('workspace.write: baseHash mismatch')
        }
        data[path] = String(text == null ? '' : text)
        return Promise.resolve(textResult(path, data[path]))
      },
      patch: function (path, baseHash, patches) {
        path = normalizePath(path)
        if (!Object.prototype.hasOwnProperty.call(data, path)) throw new Error('workspace.patch: file not found: ' + path)
        data[path] = applyLinePatches(data[path], baseHash, patches || [])
        return Promise.resolve(textResult(path, data[path]))
      },
      delete: function (path) {
        path = normalizePath(path)
        delete data[path]
        return Promise.resolve({ path: path, deleted: true })
      },
      search: function (query, opts) {
        const o = opts || {}
        const root = normalizePath(o.path || '')
        const limit = o.limit || 50
        const out = []
        const paths = allPaths(root)
        for (let i = 0; i < paths.length && out.length < limit; i++) {
          if (!pathAllowed(paths[i], o)) continue
          const matches = searchText(paths[i], data[paths[i]], query, o)
          for (let j = 0; j < matches.length && out.length < limit; j++) out.push(matches[j])
        }
        return Promise.resolve(out)
      },
      stat: function (path) {
        path = normalizePath(path)
        if (Object.prototype.hasOwnProperty.call(data, path)) {
          return Promise.resolve({ path: path, name: fileName(path), kind: 'file', size: data[path].length, hash: hashText(data[path]) })
        }
        const prefix = path ? path + '/' : ''
        const isDir = Object.keys(data).some(function (p) { return p.indexOf(prefix) === 0 })
        if (isDir) return Promise.resolve({ path: path, name: fileName(path), kind: 'directory' })
        throw new Error('workspace.stat: path not found: ' + path)
      },
      watch: function () { return function () {} },
      resolveUrl: function (path) { return normalizePath(path) },
      _files: function () { return Object.assign({}, data) },
    }
  }

  function openHandleDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(HANDLE_DB, 1)
      req.onupgradeneeded = function () {
        req.result.createObjectStore(HANDLE_STORE)
      }
      req.onsuccess = function () { resolve(req.result) }
      req.onerror = function () { reject(req.error) }
    })
  }

  async function withHandleStore(mode, task) {
    const db = await openHandleDb()
    if (!db) return null
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(HANDLE_STORE, mode)
      const store = tx.objectStore(HANDLE_STORE)
      let done = false
      tx.oncomplete = function () {
        db.close()
        if (!done) resolve(null)
      }
      tx.onerror = function () {
        db.close()
        reject(tx.error)
      }
      task(store, function (value) {
        done = true
        resolve(value)
      }, reject)
    })
  }

  async function saveDirectoryHandle(key, handle) {
    if (!key || !handle) return false
    await withHandleStore('readwrite', function (store, resolve, reject) {
      const req = store.put(handle, String(key))
      req.onsuccess = function () { resolve(true) }
      req.onerror = function () { reject(req.error) }
    })
    return true
  }

  async function loadDirectoryHandle(key) {
    if (!key) return null
    return withHandleStore('readonly', function (store, resolve, reject) {
      const req = store.get(String(key))
      req.onsuccess = function () { resolve(req.result || null) }
      req.onerror = function () { reject(req.error) }
    })
  }

  async function permissionState(handle, mode) {
    if (!handle || !handle.queryPermission) return 'granted'
    return handle.queryPermission({ mode: mode || 'readwrite' })
  }

  async function openDirectory(opts) {
    if (!window.showDirectoryPicker) throw new Error('aiditor.workspace.openDirectory: File System Access API is not available')
    opts = opts || {}
    const pickerOpts = Object.assign({}, opts)
    const rememberKey = pickerOpts.rememberKey || ''
    delete pickerOpts.rememberKey
    const handle = await window.showDirectoryPicker(pickerOpts)
    if (rememberKey) await saveDirectoryHandle(rememberKey, handle)
    return fromHandle(handle)
  }

  async function restoreDirectory(key, opts) {
    opts = opts || {}
    const handle = await loadDirectoryHandle(key)
    if (!handle) return null
    const mode = opts.mode || 'readwrite'
    const permission = await permissionState(handle, mode)
    if (permission !== 'granted') return null
    return fromHandle(handle)
  }

  function fromHandle(rootHandle) {
    async function dirHandle(path, create) {
      path = normalizePath(path)
      if (!path) return rootHandle
      const parts = path.split('/')
      let dir = rootHandle
      for (let i = 0; i < parts.length; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: !!create })
      }
      return dir
    }

    async function fileHandle(path, create) {
      path = normalizePath(path)
      const dir = await dirHandle(parentPath(path), create)
      return dir.getFileHandle(fileName(path), { create: !!create })
    }

    async function handleFor(path) {
      path = normalizePath(path)
      if (!path) return rootHandle
      const parent = await dirHandle(parentPath(path), false)
      const name = fileName(path)
      try {
        return await parent.getDirectoryHandle(name)
      } catch (_) {
        return parent.getFileHandle(name)
      }
    }

    async function walkAt(path, out) {
      path = normalizePath(path || '')
      const start = await handleFor(path)
      if (start.kind === 'file') {
        out.push({ path: path, name: fileName(path), kind: 'file' })
        return
      }
      await walk(start, path, out)
    }

    async function walk(dir, prefix, out) {
      for await (const entry of dir.values()) {
        const path = prefix ? prefix + '/' + entry.name : entry.name
        out.push({ path: path, name: entry.name, kind: entry.kind })
        if (entry.kind === 'directory') await walk(entry, path, out)
      }
    }

    return {
      rootId: function () { return rootHandle.name || 'directory' },
      kind: function () { return 'browser-fsa' },
      list: async function (path) {
        path = normalizePath(path || '')
        const dir = await dirHandle(path, false)
        const out = []
        for await (const entry of dir.values()) out.push({ path: path ? path + '/' + entry.name : entry.name, name: entry.name, kind: entry.kind })
        return out
      },
      read: async function (path) {
        path = normalizePath(path)
        const h = await fileHandle(path, false)
        const file = await h.getFile()
        return textResult(path, await file.text())
      },
      write: async function (path, text, opts) {
        path = normalizePath(path)
        const h = await fileHandle(path, true)
        if (opts && opts.baseHash) {
          const old = await h.getFile()
          if (hashText(await old.text()) !== opts.baseHash) throw new Error('workspace.write: baseHash mismatch')
        }
        const w = await h.createWritable()
        await w.write(String(text == null ? '' : text))
        await w.close()
        return textResult(path, String(text == null ? '' : text))
      },
      delete: async function (path) {
        path = normalizePath(path)
        const dir = await dirHandle(parentPath(path), false)
        await dir.removeEntry(fileName(path), { recursive: false })
        return { path: path, deleted: true }
      },
      patch: async function (path, baseHash, patches) {
        const current = await this.read(path)
        const next = applyLinePatches(current.text, baseHash, patches || [])
        return this.write(path, next, { baseHash: baseHash })
      },
      search: async function (query, opts) {
        const out = []
        const entries = []
        await walkAt(opts && opts.path || '', entries)
        const limit = opts && opts.limit || 50
        for (let i = 0; i < entries.length && out.length < limit; i++) {
          if (entries[i].kind !== 'file' || !pathAllowed(entries[i].path, opts || {})) continue
          const read = await this.read(entries[i].path)
          const matches = searchText(entries[i].path, read.text, query, opts || {})
          for (let j = 0; j < matches.length && out.length < limit; j++) out.push(matches[j])
        }
        return out
      },
      stat: async function (path) {
        path = normalizePath(path)
        const h = await handleFor(path)
        if (h.kind === 'directory') return { path: path, name: fileName(path), kind: 'directory' }
        const file = await h.getFile()
        const text = await file.text()
        return { path: path, name: fileName(path), kind: 'file', size: text.length, hash: hashText(text) }
      },
      watch: function () { return function () {} },
      resolveUrl: function (path) { return normalizePath(path) },
    }
  }

  function fromBridge(bridge) {
    return bridge
  }

  workspace.hashText = hashText
  workspace.diffSummary = diffSummary
  workspace.validateText = validateText
  workspace.applyLinePatches = applyLinePatches
  workspace.applyTextEdits = applyTextEdits
  workspace.normalizePath = normalizePath
  workspace.parentPath = parentPath
  workspace.memory = memory
  workspace.openDirectory = openDirectory
  workspace.restoreDirectory = restoreDirectory
  workspace.saveDirectoryHandle = saveDirectoryHandle
  workspace.fromHandle = fromHandle
  workspace.fromBridge = fromBridge

  aiditor.workspace = workspace
})(window.aiditor = window.aiditor || {})
