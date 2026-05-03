// EF.ui.assetBrowser 鈥?generic file-manager style asset browser.
//
// The component is intentionally storage-agnostic. It renders entries and
// interactions; callers provide an adapter for listing, importing, moving,
// renaming, deleting, preview URL resolution, and persistence side effects.
;(function (EF) {
  'use strict'
  const ui = EF.ui = EF.ui || {}

  const VIEW = [
    ['sm', 'assetBrowser.view.small', 'Small icons'],
    ['md', 'assetBrowser.view.medium', 'Medium icons'],
    ['lg', 'assetBrowser.view.large', 'Large icons'],
    ['xl', 'assetBrowser.view.extraLarge', 'Extra large icons'],
    ['list', 'assetBrowser.view.list', 'List'],
  ]
  const SORT = [
    ['name', 'assetBrowser.sort.name', 'Name'],
    ['mtime', 'assetBrowser.sort.modified', 'Modified'],
    ['kind', 'assetBrowser.sort.type', 'Type'],
    ['size', 'assetBrowser.sort.size', 'Size'],
    ['ctime', 'assetBrowser.sort.created', 'Created'],
  ]

  function tr(key, fallback, vars) {
    if (!EF.i18n) return fallback
    const value = EF.i18n.t(key, vars)
    return value === key ? fallback : value
  }

  ui.assetBrowser = function (opts) {
    const o = opts || {}
    const storageKey = o.storageKey || ''
    const version = o.version || EF.signal(0)
    const searchSig = EF.signal('')
    const selectedSig = EF.signal([])
    let dir = o.initialDir || ''
    let query = ''
    let last = -1
    let view = load('view', o.view || 'md')
    let sortBy = load('sortBy', o.sortBy || 'name')
    let sortDir = load('sortDir', o.sortDir || 'asc')

    const root = ui.h('div', 'ef-ui-asset-browser')
    const bar = ui.h('div', 'ef-ui-assetbar')
    const crumb = ui.h('div', 'ef-ui-assetcrumb')
    const search = ui.searchInput({ value: searchSig, placeholder: o.placeholder || (EF.i18n ? EF.i18n.text('assetBrowser.search') : 'Search assets...') })
    const viewBtn = ui.iconButton({ icon: 'grid', title: EF.i18n ? EF.i18n.text('assetBrowser.view') : 'View', size: 'sm', onClick: openViewMenu })
    const sortBtn = ui.iconButton({ icon: 'arrow-up-down', title: EF.i18n ? EF.i18n.text('assetBrowser.sort') : 'Sort', size: 'sm', onClick: openSortMenu })
    const grid = ui.h('div', 'ef-ui-assetgrid')
    let menuHandle = null
    let suppressGridClick = false
    bar.appendChild(crumb)
    bar.appendChild(search)
    bar.appendChild(viewBtn)
    bar.appendChild(sortBtn)
    root.appendChild(bar)
    root.appendChild(grid)

    ui.bind(root, searchSig, function (v) {
      query = v || ''
      selectedSig.set([])
      paint()
    })
    ui.bind(root, version, paint)
    if (EF.i18n) ui.bind(root, EF.i18n.locale, paint)
    ui.bind(root, selectedSig, paintSelection)

    grid.addEventListener('click', function (ev) {
      if (suppressGridClick) {
        suppressGridClick = false
        return
      }
      if (ev.target.closest && ev.target.closest('.ef-ui-assetitem')) return
      closeContextMenu()
      selectedSig.set([])
      last = -1
    })
    grid.addEventListener('contextmenu', function (ev) {
      if (ev.target.closest && ev.target.closest('.ef-ui-assetitem')) return
      ev.preventDefault()
      openContextMenu(ev.clientX, ev.clientY, null)
    })
    ui.dropzone(grid, {
      accept: ['Files', 'application/ef.asset.entry+json'],
      canDrop: function () { return true },
      onDrop: function (d) { handleDrop(d, dir) },
    })

    function paint() {
      version()
      if (o.existsDir && dir && !o.existsDir(dir)) {
        dir = ''
        selectedSig.set([])
        last = -1
      }
      renderCrumb()
      const rows = sorted(o.children ? (o.children(dir, query) || []) : [])
      grid.className = 'ef-ui-assetgrid ef-ui-assetgrid-' + view
      grid.dataset.view = view
      ui.disposeChildren ? ui.disposeChildren(grid) : clear(grid)
      if (!rows.length) {
        grid.appendChild(ui.h('div', 'ef-ui-asset-empty', { text: query ? tr('assetBrowser.empty.search', 'No matching assets.') : tr('assetBrowser.empty.drop', 'Drop files here.') }))
        return
      }
      rows.forEach(function (item, idx) {
        grid.appendChild(tile(item, idx, rows))
      })
      paintSelection()
    }

    function tile(item, idx, rows) {
      const el = ui.h('div', 'ef-ui-assetitem')
      el.dataset.key = keyFor(item)
      el.dataset.kind = item.kind || 'file'

      const thumb = ui.h('div', 'ef-ui-assetthumb')
      if (item.kind === 'folder') {
        thumb.appendChild(ui.icon({ name: 'folder', size: view === 'list' ? 'sm' : 'lg' }))
      } else if (item.kind === 'image') {
        const img = document.createElement('img')
        img.draggable = false
        img.src = o.resolveUrl ? (o.resolveUrl(item) || item.url || '') : (item.url || '')
        thumb.appendChild(img)
      } else {
        thumb.appendChild(ui.icon({ name: item.kind === 'audio' ? 'music' : 'file', size: view === 'list' ? 'sm' : 'lg' }))
      }

      const name = ui.h('div', 'ef-ui-assetname', { text: item.name || item.path || item.url || '' })
      el.appendChild(thumb)
      el.appendChild(name)
      if (view === 'list') {
        el.appendChild(ui.h('div', 'ef-ui-assetmeta', { text: typeLabel(item) }))
        el.appendChild(ui.h('div', 'ef-ui-assetmeta', { text: sizeLabel(item.size) }))
        el.appendChild(ui.h('div', 'ef-ui-assetmeta', { text: dateLabel(item.mtime || item.ctime) }))
      }

      el.addEventListener('click', function (ev) { select(item, idx, rows, ev) })
      el.addEventListener('dblclick', function () {
        if (item.kind === 'folder') {
          dir = item.path || ''
          selectedSig.set([])
          paint()
        } else if (o.onActivate) {
          o.onActivate(item)
        }
      })
      el.addEventListener('contextmenu', function (ev) {
        ev.preventDefault()
        if (selectedSig.peek().indexOf(keyFor(item)) < 0) selectedSig.set([keyFor(item)])
        openContextMenu(ev.clientX, ev.clientY, item)
      })

      ui.dragsource(el, {
        effect: 'copyMove',
        getData: function () {
          const entries = selectedEntries()
          const payload = entries.length && entries.some(function (e) { return keyFor(e) === keyFor(item) })
            ? entries
            : [item]
          const data = {
            'application/ef.asset.entry+json': JSON.stringify(payload.map(serializableEntry)),
            'text/plain': item.url || item.path || '',
          }
          if (item.kind !== 'folder' && item.url) {
            data['text/uri-list'] = item.url
            data['application/ef.asset+json'] = JSON.stringify({ kind: item.kind, value: item.url })
            data['application/ef.asset.' + (item.kind || 'file') + '+json'] = JSON.stringify({ kind: item.kind, value: item.url })
          }
          if (typeof o.aiTargets === 'function') {
            const targets = o.aiTargets(payload, item) || []
            if (targets.length) {
              data['application/x-ef-ai-target-list'] = JSON.stringify(targets)
              data['application/x-ef-ai-target'] = JSON.stringify(targets[0])
            }
          }
          return data
        },
      })

      if (item.kind === 'folder') {
        ui.dropzone(el, {
          accept: ['Files', 'application/ef.asset.entry+json'],
          canDrop: function () { return true },
          onDrop: function (d) { handleDrop(d, item.path || '') },
        })
      }
      return el
    }

    function select(item, idx, rows, ev) {
      const k = keyFor(item)
      const cur = selectedSig.peek().slice()
      if (ev.shiftKey && last >= 0) {
        const a = Math.min(last, idx), b = Math.max(last, idx)
        selectedSig.set(rows.slice(a, b + 1).map(keyFor))
      } else if (ev.ctrlKey || ev.metaKey) {
        const at = cur.indexOf(k)
        if (at >= 0) cur.splice(at, 1)
        else cur.push(k)
        selectedSig.set(cur)
        last = idx
      } else {
        selectedSig.set([k])
        last = idx
      }
      if (o.onSelect) o.onSelect(selectedEntries())
    }

    function paintSelection() {
      const sel = new Set(selectedSig.peek())
      Array.prototype.forEach.call(grid.querySelectorAll('.ef-ui-assetitem'), function (el) {
        el.classList.toggle('is-selected', sel.has(el.dataset.key))
      })
    }

    function renderCrumb() {
      clear(crumb)
      const rootLabel = ui.isSignal && ui.isSignal(o.rootLabel) ? o.rootLabel() : (o.rootLabel || tr('assetBrowser.root', 'asset'))
      crumb.appendChild(crumbButton(rootLabel, ''))
      let cur = ''
      parts(dir).forEach(function (p) {
        cur = cur ? cur + '/' + p : p
        crumb.appendChild(ui.h('span', 'ef-ui-assetcrumb-sep', { text: '/' }))
        crumb.appendChild(crumbButton(p, cur))
      })
    }

    function crumbButton(label, path) {
      const b = ui.h('button', null, { type: 'button', text: label })
      b.addEventListener('click', function () {
        dir = path
        selectedSig.set([])
        paint()
      })
      ui.dropzone(b, {
        accept: ['Files', 'application/ef.asset.entry+json'],
        canDrop: function () { return true },
        onDrop: function (d) { handleDrop(d, path) },
      })
      return b
    }

    function handleDrop(data, targetDir) {
      const entries = readEntries(data)
      if (entries.length && o.moveEntries) {
        const ret = o.moveEntries(entries, targetDir || '')
        ret && ret.then ? ret.then(done) : done()
        return
      }
      if (data.files && data.files.length && o.importFiles) {
        const ret = o.importFiles(data.files, targetDir || '')
        ret && ret.then ? ret.then(done) : done()
        return
      }
    }
    function done() { selectedSig.set([]); paint() }

    function openContextMenu(x, y, item) {
      closeContextMenu()
      menuHandle = ui.contextMenu({ x: x, y: y }, contextItems(item))
    }

    function closeContextMenu() {
      if (!menuHandle) return
      menuHandle.close()
      menuHandle = null
    }

    function contextItems(item) {
      const picked = selectedEntries()
      const rows = item && picked.length ? picked : (item ? [item] : [])
      const hasRows = rows.length > 0
      const single = rows.length === 1 ? rows[0] : null
      if (!hasRows) {
        return [
          { label: tr('common.new_folder', 'New Folder'), icon: 'folder', onSelect: createFolder },
          { label: tr('common.add_files', 'Add Files'), icon: 'plus', onSelect: pickFiles },
          { type: 'divider' },
          { label: tr('common.view', 'View'), icon: 'grid', items: viewItems() },
          { label: tr('common.sort', 'Sort'), icon: 'arrow-up-down', items: sortItems() },
        ]
      }
      const extra = typeof o.actions === 'function' ? (o.actions(rows, item) || []) : []
      const items = []
      if (single && o.rename) {
        items.push({ label: tr('common.rename', 'Rename'), icon: 'edit', onSelect: function () {
          const ret = o.rename(single)
          ret && ret.then ? ret.then(done) : done()
        } })
      }
      if (o.remove) {
        items.push({ label: tr('common.delete', 'Delete'), icon: 'trash', danger: true, onSelect: function () {
          const ret = o.remove(rows)
          ret && ret.then ? ret.then(done) : done()
        } })
      }
      if (single) {
        items.push({ label: tr('common.copy_path', 'Copy Path'), icon: 'copy', onSelect: function () { copy(pathFor(single)) } })
      }
      if (extra.length) {
        items.push({ type: 'divider' })
        extra.forEach(function (it) { items.push(it) })
      }
      return items
    }

    function openViewMenu() { ui.menu({ anchor: viewBtn, items: viewItems(), side: 'bottom', align: 'end' }) }
    function openSortMenu() { ui.menu({ anchor: sortBtn, items: sortItems(), side: 'bottom', align: 'end' }) }
    function viewItems() {
      return VIEW.map(function (v) {
        return { label: (view === v[0] ? '* ' : '') + tr(v[1], v[2]), onSelect: function () { view = v[0]; save('view', view); paint() } }
      })
    }
    function sortItems() {
      return SORT.map(function (s) {
        return { label: (sortBy === s[0] ? '* ' : '') + tr(s[1], s[2]), onSelect: function () { sortBy = s[0]; save('sortBy', sortBy); paint() } }
      }).concat([
        { type: 'divider' },
        { label: (sortDir === 'asc' ? '* ' : '') + tr('assetBrowser.sort.asc', 'Ascending'), onSelect: function () { sortDir = 'asc'; save('sortDir', sortDir); paint() } },
        { label: (sortDir === 'desc' ? '* ' : '') + tr('assetBrowser.sort.desc', 'Descending'), onSelect: function () { sortDir = 'desc'; save('sortDir', sortDir); paint() } },
      ])
    }

    function pickFiles() {
      if (!o.importFiles) return
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.onchange = function () {
        if (input.files && input.files.length) {
          const ret = o.importFiles(input.files, dir)
          if (ret && ret.then) ret.then(done)
          else done()
        }
      }
      input.click()
    }

    function createFolder() {
      if (!o.createFolder) return
      ui.prompt({
        title: tr('common.new_folder', 'New Folder'),
        message: tr('assetBrowser.folderName', 'Folder name'),
      }).then(function (name) {
        if (!name) return
        const ret = o.createFolder(dir, name)
        if (ret && ret.then) ret.then(done)
        else done()
      })
    }

    function selectedEntries() {
      const sel = new Set(selectedSig.peek())
      return (o.children ? o.children(dir, query) || [] : []).filter(function (it) { return sel.has(keyFor(it)) })
    }

    let marquee = null
    let marqueeStart = null
    let marqueeBase = null
    let marqueeMoved = false
    grid.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest && ev.target.closest('.ef-ui-assetitem')) return
      closeContextMenu()
      if (ev.button !== 0) return
      marqueeStart = pointInGrid(ev)
      marqueeBase = (ev.ctrlKey || ev.metaKey) ? new Set(selectedSig.peek()) : new Set()
      marqueeMoved = false
      try { grid.setPointerCapture(ev.pointerId) } catch (_) {}
      ev.preventDefault()
    })
    grid.addEventListener('pointermove', function (ev) {
      if (!marqueeStart) return
      const cur = pointInGrid(ev)
      const rect = rectFromPoints(marqueeStart, cur)
      marqueeMoved = marqueeMoved || rect.width > 3 || rect.height > 3
      if (!marqueeMoved) return
      if (!marquee) {
        marquee = ui.h('div', 'ef-ui-asset-marquee')
        grid.appendChild(marquee)
      }
      marquee.style.left = rect.left + 'px'
      marquee.style.top = rect.top + 'px'
      marquee.style.width = rect.width + 'px'
      marquee.style.height = rect.height + 'px'
      const next = new Set(marqueeBase)
      const gridRect = grid.getBoundingClientRect()
      Array.prototype.forEach.call(grid.querySelectorAll('.ef-ui-assetitem'), function (el) {
        const r = el.getBoundingClientRect()
        const box = {
          left: r.left - gridRect.left + grid.scrollLeft,
          top: r.top - gridRect.top + grid.scrollTop,
          width: r.width,
          height: r.height,
        }
        if (intersects(rect, box)) next.add(el.dataset.key)
      })
      selectedSig.set(Array.from(next))
    })
    grid.addEventListener('pointerup', endMarquee)
    grid.addEventListener('pointercancel', endMarquee)

    function endMarquee(ev) {
      if (!marqueeStart) return
      try { grid.releasePointerCapture(ev.pointerId) } catch (_) {}
      suppressGridClick = marqueeMoved
      marqueeStart = null
      marqueeBase = null
      marqueeMoved = false
      if (marquee) { marquee.remove(); marquee = null }
      if (o.onSelect) o.onSelect(selectedEntries())
    }

    function sorted(rows) {
      return rows.slice().sort(function (a, b) {
        if (a.kind === 'folder' && b.kind !== 'folder') return -1
        if (a.kind !== 'folder' && b.kind === 'folder') return 1
        let av = valueFor(a, sortBy), bv = valueFor(b, sortBy)
        let cmp = 0
        if (typeof av === 'number' || typeof bv === 'number') cmp = (Number(av) || 0) - (Number(bv) || 0)
        else cmp = String(av || '').localeCompare(String(bv || ''), undefined, { numeric: true })
        return sortDir === 'desc' ? -cmp : cmp
      })
    }

    function keyFor(item) { return item.kind === 'folder' ? 'folder:' + (item.path || '') : item.url }
    function pathFor(item) { return item.kind === 'folder' ? 'asset://' + (item.path || '') : (item.url || item.path || '') }
    function serializableEntry(item) { return { kind: item.kind, path: item.path || '', url: item.url || '', name: item.name || '' } }
    function readEntries(data) {
      return data && Array.isArray(data.assetEntries) ? data.assetEntries : []
    }
    function clear(el) { while (el.firstChild) ui.dispose(el.firstChild) }
    function parts(path) { return String(path || '').split('/').filter(Boolean) }
    function typeLabel(it) { return it.kind === 'folder' ? tr('assetBrowser.kind.folder', 'Folder') : (it.kind || 'file') }
    function valueFor(it, key) { return key === 'kind' ? typeLabel(it) : key === 'size' ? it.size : key === 'mtime' ? it.mtime : key === 'ctime' ? it.ctime : it.name }
    function sizeLabel(n) { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : (n ? n + ' B' : '') }
    function dateLabel(t) { return t ? new Date(t).toLocaleDateString() : '' }
    function pointInGrid(ev) {
      const r = grid.getBoundingClientRect()
      return { x: ev.clientX - r.left + grid.scrollLeft, y: ev.clientY - r.top + grid.scrollTop }
    }
    function rectFromPoints(a, b) {
      const left = Math.min(a.x, b.x)
      const top = Math.min(a.y, b.y)
      return { left: left, top: top, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
    }
    function intersects(a, b) {
      return a.left <= b.left + b.width && a.left + a.width >= b.left
          && a.top <= b.top + b.height && a.top + a.height >= b.top
    }
    function copy(text) { if (navigator.clipboard) navigator.clipboard.writeText(text) }
    function load(k, fallback) { try { return storageKey ? (localStorage.getItem(storageKey + '.' + k) || fallback) : fallback } catch (_) { return fallback } }
    function save(k, v) { try { if (storageKey) localStorage.setItem(storageKey + '.' + k, v) } catch (_) {} }

    paint()
    return root
  }
})(window.EF = window.EF || {})
