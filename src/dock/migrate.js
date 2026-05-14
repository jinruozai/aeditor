// Cross-window panel migration.
//
// Protocol — direct window.postMessage between source and target:
//
//   1. Source: ctx.panel.popOut() → window.open(url+?aeditor-popup=1) → returns w
//   2. Source: window.addEventListener('message', onMessage)
//   3. Target (popup): createDockLayout runs → layout.bindMigrationReceiver()
//      sends { aeditorAction:'ready' } to window.opener
//   4. Source: receives 'ready' (matched by ev.source === w) → posts
//      { aeditorAction:'migrate', txId, panelData, state } to w
//   5. Target: receives 'migrate' → finds an accepting dock → addPanel with
//      panelData.props → if component.deserialize exists, applies state →
//      posts { aeditorAction:'migrate-ack', txId } back to opener
//   6. Source: on 'migrate-ack', calls layout.removePanel(panelId)
//
// The two-phase ack ensures the panel never exists in both windows. If the
// target rejects (no dock with matching accept), it sends 'migrate-reject'
// and the source keeps the panel.
//
// Component contract — § 4.8 spec.serialize / spec.deserialize are optional.
// Components that don't implement them migrate with props only (a fresh create).
;(function (aeditor) {
  'use strict'

  let _txCounter = 0

  // Trust boundary: messages must come from / go to the same origin. This
  // prevents a popup that has been navigated elsewhere — or a cross-origin
  // frame that got hold of our handle — from driving the migration protocol.
  // Note file:// gives 'null' for both sides, which still matches.
  function targetOriginFor(w) {
    let origin = ''
    try { origin = w.location.origin || window.location.origin }
    catch (e) { origin = window.location.origin }
    if (!origin || origin === 'null' || window.location.protocol === 'file:') return '*'
    return origin
  }

  function safePost(target, msg) {
    try { target.postMessage(msg, targetOriginFor(target)) }
    catch (e) { aeditor.reportError({ scope: 'global' }, e) }
  }

  function isTrustedEvent(ev, expectedSource) {
    if (ev.source !== expectedSource) return false
    // `null` origins (file://, sandboxed iframes) are allowed to each
    // other — they're the same trust zone the demo already runs in.
    return ev.origin === window.location.origin || ev.origin === 'null' || ev.origin === ''
  }

  function popOutPanel(panelId, layout, screenX, screenY) {
    const pr = aeditor._dock.findPanelRuntime(layout, panelId)
    if (!pr) return
    const panelData = pr.data.peek()

    // Serialize component state if supported.
    let state = null
    const spec = aeditor.resolveComponent(panelData.component)
    if (spec.serialize && pr.contentEl) {
      state = aeditor.safeCall(
        { scope: 'component', component: panelData.component, panelId: panelId },
        function () { return spec.serialize(pr.contentEl) }
      )
    }

    const txId = 'tx-' + (++_txCounter)

    // Open a popup. The target side strips its initial layout to a single
    // empty dock when it sees ?aeditor-popup=1 (responsibility of the demo HTML).
    const url = window.location.href.indexOf('?') >= 0
      ? window.location.href + '&aeditor-popup=1'
      : window.location.href + '?aeditor-popup=1'
    const features = 'popup,width=600,height=400'
      + ',left=' + (screenX || 100) + ',top=' + (screenY || 100)
    const w = window.open(url, '_blank', features)
    if (!w) {
      aeditor.reportError({ scope: 'global' },
        new Error('popOut: window.open returned null (popup blocked?)'))
      return
    }

    // Single cleanup path — whichever of { ack, reject, popup-closed } fires
    // first unwinds the listener and the closed-poll timer. This is the only
    // way migration state is torn down; after it runs the whole popOut call
    // is inert.
    let done = false
    const pollClosed = setInterval(function () { if (w.closed) cleanup() }, 500)
    function cleanup() {
      if (done) return
      done = true
      clearInterval(pollClosed)
      window.removeEventListener('message', onMessage)
    }

    function onMessage(ev) {
      if (!isTrustedEvent(ev, w)) return
      const msg = ev.data
      if (!msg || !msg.aeditorAction) return
      if (msg.aeditorAction === 'ready') {
        // Strip the panel data we send across to JSON-safe content. PanelData
        // is structurally clone-safe by contract (§ 4.8 props), so this is
        // already fine, but we also drop framework-internal id so the target
        // generates a fresh one.
        const cleanData = {
          component: panelData.component,
          title:  panelData.title,
          icon:   panelData.icon,
          dirty:  panelData.dirty,
          badge:  panelData.badge,
          name:   panelData.name,
          props:  panelData.props,
          toolbarItems: panelData.toolbarItems,
        }
        safePost(w, {
          aeditorAction:  'migrate',
          txId:      txId,
          panelData: cleanData,
          state:     state,
        })
      } else if (msg.aeditorAction === 'migrate-ack' && msg.txId === txId) {
        cleanup()
        layout.removePanel(panelId)
      } else if (msg.aeditorAction === 'migrate-reject' && msg.txId === txId) {
        cleanup()
        aeditor.reportError({ scope: 'global' },
          new Error('popOut: target window rejected migration (no accepting dock)'))
      }
    }

    window.addEventListener('message', onMessage)
  }

  // Called by createDockLayout once the layout is initialized. Wires up the
  // popup-side of the protocol: announce ready, then accept migrations.
  function bindMigrationReceiver(layout) {
    if (!window.opener) return // not a popup, nothing to do
    if (window.location.search.indexOf('aeditor-popup=1') < 0) return

    function onMessage(ev) {
      if (!isTrustedEvent(ev, window.opener)) return
      const msg = ev.data
      if (!msg || msg.aeditorAction !== 'migrate') return
      acceptMigration(layout, msg, window.opener)
    }

    window.addEventListener('message', onMessage)
    if (layout.cleanups) {
      layout.cleanups.push(function () { window.removeEventListener('message', onMessage) })
    }

    // Tell opener we're ready to receive. postMessage queues if no listener
    // yet, but the source registers its listener synchronously before this
    // runs in the popup, so ordering is fine.
    safePost(window.opener, { aeditorAction: 'ready' })
  }

  function acceptMigration(layout, msg, opener) {
    const tree = layout.treeSig.peek()
    const component = msg.panelData.component

    // Find first dock that accepts this component.
    let targetId = null
    walkDocks(tree, function (d) {
      if (targetId) return
      const a = d.accept
      const ok = !a || a === '*' || (Array.isArray(a) && a.indexOf(component) >= 0)
      if (ok) targetId = d.id
    })

    if (!targetId) {
      safePost(opener, { aeditorAction: 'migrate-reject', txId: msg.txId })
      return
    }

    const panelId = layout.addPanel(targetId, {
      component: component,
      title:  msg.panelData.title,
      icon:   msg.panelData.icon,
      dirty:  msg.panelData.dirty,
      badge:  msg.panelData.badge,
      name:   msg.panelData.name,
      props:  msg.panelData.props,
      toolbarItems: msg.panelData.toolbarItems,
    })

    // layout.addPanel triggered reconcile synchronously, which materialized
    // the component's contentEl. Now apply serialized state if both sides
    // implement it.
    const pr = aeditor._dock.findPanelRuntime(layout, panelId)
    if (msg.state != null && pr && pr.contentEl) {
      const spec = aeditor.resolveComponent(component)
      if (spec.deserialize) {
        aeditor.safeCall(
          { scope: 'component', component: component, panelId: panelId },
          function () { spec.deserialize(pr.contentEl, msg.state) }
        )
      }
    }

    safePost(opener, { aeditorAction: 'migrate-ack', txId: msg.txId })
  }

  function walkDocks(node, fn) {
    if (node.type === 'dock') { fn(node); return }
    for (let i = 0; i < node.children.length; i++) walkDocks(node.children[i], fn)
  }

  aeditor._dock = aeditor._dock || {}
  aeditor._dock.popOutPanel           = popOutPanel
  aeditor._dock.bindMigrationReceiver = bindMigrationReceiver
})(window.aeditor = window.aeditor || {})
