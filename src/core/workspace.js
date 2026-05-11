// aeditor.workspace - bounded file access adapters.
;(function (aeditor) {
  'use strict'

  const workspace = {}

  function hashText(text) {
    text = String(text == null ? '' : text)
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619) >>> 0
    }
    return 'aeditor-fnv1a-' + h.toString(16)
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

  function searchText(path, text, query, opts) {
    const o = opts || {}
    const max = o.maxPerFile || 20
    const before = o.before != null ? o.before : 2
    const after = o.after != null ? o.after : 2
    const needle = String(query || '').toLowerCase()
    const lines = String(text || '').split(/\r?\n/)
    const out = []
    for (let i = 0; i < lines.length && out.length < max; i++) {
      if (!needle || lines[i].toLowerCase().indexOf(needle) >= 0) {
        const s = Math.max(0, i - before)
        const e = Math.min(lines.length - 1, i + after)
        out.push({
          path: path,
          line: i + 1,
          text: lines[i],
          previewStartLine: s + 1,
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

  async function openDirectory(opts) {
    if (!window.showDirectoryPicker) throw new Error('aeditor.workspace.openDirectory: File System Access API is not available')
    const handle = await window.showDirectoryPicker(opts || {})
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
        return this.write(path, next)
      },
      search: async function (query, opts) {
        const out = []
        const entries = []
        await walkAt(opts && opts.path || '', entries)
        const limit = opts && opts.limit || 50
        for (let i = 0; i < entries.length && out.length < limit; i++) {
          if (entries[i].kind !== 'file') continue
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
  workspace.normalizePath = normalizePath
  workspace.parentPath = parentPath
  workspace.memory = memory
  workspace.openDirectory = openDirectory
  workspace.fromHandle = fromHandle
  workspace.fromBridge = fromBridge

  aeditor.workspace = workspace
})(window.aeditor = window.aeditor || {})
