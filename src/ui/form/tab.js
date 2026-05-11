// aeditor.ui.tab — general-purpose tab strip.
//
// This is the single implementation of "tab bar" for the whole framework.
// All visuals live here; the dock-tabs panel component (src/ui/panel/dock-tabs.js)
// is a thin shell that just wires ctx.dock.* signals/methods into this.
//
// Signal-first API (like every other aeditor.ui.* component):
//   items    : signal<[{ id, title?, icon?, dirty?, transient?, badge? }]>
//   active   : signal<string|null>
//   variant  : 'bar' | 'compact' | 'sidebar'   (default 'bar')
//   direction: 'horizontal' | 'vertical'        (default from variant; sidebar → vertical)
//   closable : boolean                          (default false)
//   addable  : boolean                          (default false)
//   minShowCount : number                       (default 0 — hide bar below)
//   iconOnly : boolean                          (default from variant; sidebar → true)
//
// Callbacks (all optional):
//   onActivate(id)            — click on an inactive tab. Required if the
//                               `active` signal is read-only (derived); if it
//                               is writable, the default is active.set(id).
//                               Construction throws if neither path exists.
//   onReactivate(id)          — click on the already-active tab
//   onClose(id)               — close × button
//   onAdd()                   — + button
//   onDragStart(ev, id)       — pointerdown on a tab button (for drag-out logic)
//
// DOM contract (stable-DOM reconciliation, keyed by item.id):
//   <div class="aeditor-ui-tab aeditor-ui-tab-{variant}[ aeditor-ui-tab-vertical]">
//     <button class="aeditor-ui-tab-btn" data-tab-id="..."> ... </button> × N
//     <button class="aeditor-ui-tab-add">+</button>?
//   </div>
//
// The root element's `__aeditorCleanups` carries the effect subscription, so
// aeditor.ui.dispose(el) tears everything down cleanly.
;(function (aeditor) {
  'use strict'
  const ui = aeditor.ui = aeditor.ui || {}

  ui.tab = function (opts) {
    // Paint a name-or-glyph value into an icon host span. If the value is a
    // registered icon name, swap contents for the SVG; otherwise treat as
    // text (emoji / single-char glyph).
    function paintIcon(host, value) {
      if (!host) return
      const v = value || ''
      if (v && ui._hasIcon && ui._hasIcon(v)) {
        while (host.firstChild) host.removeChild(host.firstChild)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-width', '2')
        svg.setAttribute('stroke-linecap', 'round')
        svg.setAttribute('stroke-linejoin', 'round')
        svg.setAttribute('aria-hidden', 'true')
        svg.innerHTML = ui._getIcon(v)
        host.appendChild(svg)
        host.classList.add('aeditor-ui-icon-svg')
      } else {
        host.classList.remove('aeditor-ui-icon-svg')
        host.textContent = v
      }
    }

    const o = opts || {}
    const itemsSig  = ui.asSig(o.items  != null ? o.items  : [])
    const activeSig = ui.asSig(o.active != null ? o.active : null)
    // Tab never writes to items — it only reads. For active, caller must
    // provide EITHER a writable signal OR an onActivate callback (§ signal
    // contract C); writer() throws at construction if neither is present.
    const doActivate = ui.writer(activeSig, o.onActivate, 'ui.tab')

    const variant  = o.variant || 'bar'                              // 'bar' | 'compact' | 'sidebar'
    const iconOnly = o.iconOnly != null ? !!o.iconOnly : variant === 'sidebar'
    const vertical = o.direction
      ? o.direction === 'vertical'
      : variant === 'sidebar'
    const closable = !!o.closable
    const addable  = !!o.addable
    const minShow  = o.minShowCount != null ? o.minShowCount : 0

    const root = ui.h('div', 'aeditor-ui-tab aeditor-ui-tab-' + variant)
    if (vertical) root.classList.add('aeditor-ui-tab-vertical')
    if (iconOnly) root.classList.add('aeditor-ui-tab-icon-only')
    if (closable) root.classList.add('aeditor-ui-tab-closable')

    // Stable entry registry. Each entry caches the last-painted field values
    // so we skip DOM writes that would be no-ops. Without this, clicking a
    // tab would re-render the clicked button mid-gesture and kill its
    // :active CSS state — that's the same bug stable-DOM fixed in the old
    // component/tab.js. Keep the invariant here.
    const entries = new Map() // id → { btn, iconEl, titleEl, badgeEl, closeEl, last: {} }
    let addBtn = null

    function ensureEntry(it) {
      let e = entries.get(it.id)
      if (e) return e

      const btn = ui.h('button', 'aeditor-ui-tab-btn', { type: 'button' })
      btn.dataset.tabId = it.id

      const iconEl  = ui.h('span', 'aeditor-ui-tab-icon')
      const titleEl = iconOnly ? null : ui.h('span', 'aeditor-ui-tab-title')
      const badgeEl = ui.h('span', 'aeditor-ui-tab-badge')
      let closeEl = null
      if (closable && !iconOnly) {
        closeEl = ui.h('button', 'aeditor-ui-tab-close', { type: 'button', text: '×' })
        closeEl.addEventListener('pointerdown', function (ev) { ev.stopPropagation() })
        closeEl.addEventListener('click', function (ev) {
          ev.stopPropagation()
          if (o.onClose) o.onClose(btn.dataset.tabId)
        })
      }

      btn.appendChild(iconEl)
      if (titleEl) btn.appendChild(titleEl)
      btn.appendChild(badgeEl)
      if (closeEl) btn.appendChild(closeEl)

      btn.addEventListener('click', function () {
        const id = btn.dataset.tabId
        const cur = activeSig()
        if (id === cur) {
          if (o.onReactivate) o.onReactivate(id)
          return
        }
        doActivate(id)
      })

      btn.addEventListener('pointerdown', function (ev) {
        if (ev.button !== 0) return
        if (ev.target && ev.target.classList && ev.target.classList.contains('aeditor-ui-tab-close')) return
        if (o.onDragStart) o.onDragStart(ev, btn.dataset.tabId)
      })

      e = { btn: btn, iconEl: iconEl, titleEl: titleEl, badgeEl: badgeEl, closeEl: closeEl, last: {} }
      entries.set(it.id, e)
      return e
    }

    function syncEntry(e, it, isActive) {
      const last = e.last
      const title = it.title != null ? it.title : it.id
      const icon  = it.icon || ''
      const badge = it.badge != null ? String(it.badge) : ''
      const dirty = !!it.dirty
      const tran  = !!it.transient

      if (last.active !== isActive) {
        e.btn.classList.toggle('aeditor-ui-tab-btn-active', isActive)
        last.active = isActive
      }
      if (last.transient !== tran) {
        e.btn.classList.toggle('aeditor-ui-tab-btn-transient', tran)
        last.transient = tran
      }
      if (last.dirty !== dirty) {
        e.btn.classList.toggle('aeditor-ui-tab-btn-dirty', dirty)
        last.dirty = dirty
      }
      if (last.title !== title) {
        e.btn.title = title
        if (e.titleEl) e.titleEl.textContent = title
        last.title = title
      }
      if (last.icon !== icon) {
        // Resolve icon: if it's a registered name, paint the SVG; otherwise
        // render as text (single-char glyph / emoji). In iconOnly mode we
        // always need *something* — fall back to the title's first char.
        const effective = icon || (iconOnly ? title.charAt(0).toUpperCase() : '')
        paintIcon(e.iconEl, effective)
        if (iconOnly) {
          // iconOnly keeps iconEl mounted regardless.
        } else if (effective) {
          if (!e.iconEl.parentNode) e.btn.insertBefore(e.iconEl, e.titleEl)
        } else if (e.iconEl.parentNode) {
          e.iconEl.remove()
        }
        last.icon = icon
      }
      if (last.badge !== badge) {
        if (badge) {
          e.badgeEl.textContent = badge
          if (!e.badgeEl.parentNode) {
            // Badge goes just before close button (or at end).
            if (e.closeEl && e.closeEl.parentNode) e.btn.insertBefore(e.badgeEl, e.closeEl)
            else e.btn.appendChild(e.badgeEl)
          }
        } else if (e.badgeEl.parentNode) {
          e.badgeEl.remove()
        }
        last.badge = badge
      }
    }

    function ensureAddBtn() {
      if (addBtn) return addBtn
      addBtn = ui.h('button', 'aeditor-ui-tab-add', { type: 'button', text: '+' })
      addBtn.addEventListener('click', function () {
        if (o.onAdd) o.onAdd()
      })
      return addBtn
    }

    // Reactive render. Runs once synchronously, then on every items/active
    // change. Cleanup is collected onto root.__aeditorCleanups so ui.dispose(root)
    // tears the effect down.
    ui.collect(root, aeditor.effect(function () {
      const items = itemsSig() || []
      const active = activeSig()

      // minShowCount: hide the bar entirely (keep cached entries for later).
      if (items.length < minShow) {
        entries.forEach(function (e) { if (e.btn.parentNode) e.btn.remove() })
        if (addBtn && addBtn.parentNode) addBtn.remove()
        root.hidden = true
        return
      }
      root.hidden = false

      // 1. Prune stale entries.
      const live = new Set()
      for (let i = 0; i < items.length; i++) live.add(items[i].id)
      entries.forEach(function (e, id) {
        if (!live.has(id)) {
          if (e.btn.parentNode) e.btn.remove()
          entries.delete(id)
        }
      })

      // 2. Ensure + sync + reorder in place.
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const e = ensureEntry(it)
        syncEntry(e, it, it.id === active)
        const cur = root.childNodes[i]
        if (cur !== e.btn) root.insertBefore(e.btn, cur || null)
      }

      // 3. Add button at tail.
      if (addable) {
        const b = ensureAddBtn()
        if (b.parentNode !== root || root.lastChild !== b) root.appendChild(b)
      } else if (addBtn && addBtn.parentNode) {
        addBtn.remove()
      }

      // 4. Drop stray trailing nodes (defensive, zero-cost in steady state).
      const expected = items.length + (addable ? 1 : 0)
      while (root.childNodes.length > expected) root.lastChild.remove()
    }))

    return root
  }
})(window.aeditor = window.aeditor || {})
