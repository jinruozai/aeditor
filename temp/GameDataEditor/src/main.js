/**
 * Main entry �?mounts the EditorFrame layout and the top toolbar.
 *
 *   ┌────────────────────────────────────────────────────────────�?
 *   �?                      top toolbar (DOM)                     �?
 *   ├────────┬───────────────────────────────────┬───────────────�?
 *   �?left   �?       center (tab-standard)      �? right        �?
 *   �?tab-   �?       table data × N             �? inspector    �?
 *   �?side-  ├───────────────────────────────────�? (no tabs)    �?
 *   �?bar    �?        log (tab-collapsible)     �?              �?
 *   └────────┴───────────────────────────────────┴───────────────�?
 *
 * Tab management is delegated to the framework:
 *   - left  : tab-sidebar     (icon rail, click-again collapses)
 *   - center: tab-standard    (open tables appear as tabs)
 *   - log   : tab-collapsible (bottom dock, starts collapsed)
 *   - right : no toolbar      (single inspector panel)
 *
 * State.openTable() / closeTab() / pinTab() delegate to layout.addPanel /
 * removePanel / promotePanel. activeTable signal syncs from the layout tree.
 */
(function () {
  'use strict';

  var appCleanups = [];
  var destroyed = false;

  function track(cleanup) {
    appCleanups.push(cleanup);
    return cleanup;
  }

  function onBus(topic, handler) {
    return track(EF.bus.on(topic, handler));
  }

  function onDocument(type, handler, opts) {
    document.addEventListener(type, handler, opts);
    return track(function () { document.removeEventListener(type, handler, opts); });
  }

  function appEffect(fn) {
    return track(EF.effect(fn));
  }

  // 1. Seed the demo dataset (synchronous �?keeps file:// double-click working).
  Seed.install();

  // 2. Build the initial layout tree.
  var leftDock = EF.dock({
    name: 'left',
    toolbar: {
      direction: 'left',
      items: [{ component: 'tab-sidebar' }],
    },
    // Icons here are framework registered names (see EF.ui icon set) �?they
    // render as flat monochrome SVG, not emoji. Fallback to the glyph
    // rendering path kicks in automatically if a name isn't registered.
    panels: [
      EF.panel({ component: 'gde-tables',          title: I18N.t('panel.tablemap'),   icon: 'table'    }),
      EF.panel({ component: 'gde-typeconfig',      title: I18N.t('panel.typeconfig'), icon: 'settings' }),
      EF.panel({ component: 'gde-cardstyle-tree',  title: 'Object Tree',              icon: 'list'     }),
      EF.panel({ component: 'gde-search',          title: I18N.t('panel.search'),     icon: 'search'   }),
    ],
  });

  var centerDock = EF.dock({
    name:   'center',
    accept: ['gde-table-data', 'gde-cardstyle-editor'],
    toolbar: {
      direction: 'top',
      items: [{ component: 'tab-standard', props: { addable: false } }],
    },
  });

  var logDock = EF.dock({
    name:      'log',
    collapsed: false,
    // Bottom-aligned toolbar: when the dock is collapsed only the tab strip
    // remains visible, anchored to the very bottom of the center column �?
    // exactly how VS Code's status/output panel behaves.
    toolbar: {
      direction: 'bottom',
      items: [{ component: 'tab-collapsible', props: { closable: false } }],
    },
    // Use the built-in 'log' component (EF.log signal). Project writes go
    // through State.log �?EF.log.push, so framework + app messages share
    // one stream.
    panels: [
      EF.panel({ component: 'gde-assets',             title: 'Assets',     icon: 'folder'  }),
      EF.panel({ component: 'gde-cardstyle-list',     title: 'Card Styles', icon: 'columns' }),
      EF.panel({ component: 'log',                    title: 'Log',        icon: 'list'    }),
    ],
  });

  var rightDock = EF.dock({
    name: 'right',
    // No toolbar = single fixed panel, no tab bar.
    panels: [
      EF.panel({ component: 'gde-inspector', title: I18N.t('panel.inspector') }),
    ],
  });

  var tree = EF.split('horizontal', [
    leftDock,
    EF.split('vertical', [centerDock, logDock], [0.72, 0.28]),
    rightDock,
  ], [0.2, 0.56, 0.24]);

  // 3. Mount.
  var handle = EF.createDockLayout(document.getElementById('app'), { tree: tree });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (var i = appCleanups.length - 1; i >= 0; i--) appCleanups[i]();
    appCleanups = [];
    if (window.GDE && GDE.clear) GDE.clear(document.getElementById('gde-topbar'));
    if (window.GDE && GDE.plugins) GDE.plugins.deactivateAll();
    if (State.destroy) State.destroy();
    handle.destroy();
    window.__gde.handle = null;
  }

  window.__gde = { handle: handle, destroy: destroy };   // kept for top-bar debugging only

  // 4. Wire State �?Layout.
  State._setLayout(handle, 'center');

  // 5. Seed one pinned table panel so the center doesn't start empty.
  var firstTable = Object.keys(State.tableMap())[0] || null;
  if (firstTable) State.openTable(firstTable, { transient: false });

  // 6. Sync State.activeTable FROM the center dock's activeId. This is the
  //    single source of truth for "which table is being edited" �?every
  //    component subscribes to State.activeTable, not to the layout tree.
  //    handle.subscribe re-fires whenever the layout tree changes; peek on
  //    activeTable so this callback never subscribes to its own writes.
  track(handle.subscribe(function (t) {
    var found = null;
    (function walk(n) {
      if (!n || found) return;
      if (n.type === 'dock' && n.name === 'center') {
        var p = n.panels.find(function (pp) { return pp.id === n.activeId; });
        if (p && p.props) found = p.props.pathKey || null;
      } else if (n.type === 'split') {
        n.children.forEach(walk);
      }
    })(t);
    if (State.activeTable.peek() !== found) State.activeTable.set(found);
  }));

  // 7. Navigation events from search / log / gamedata panels.
  onBus('nav:goto', function (payload) {
    if (!payload || !payload.pathKey) return;
    State.openTable(payload.pathKey, { transient: false });
    if (payload.id) {
      State.setSelection({ kind: 'card_data', pathKey: payload.pathKey, id: payload.id, field: payload.field });
    }
  });

  // 8. Struct editing entry �?forwarded to global hook (if any).
  onBus('ui:editStruct', function (payload) {
    if (payload && payload.pathKey && typeof window.openStructEditor === 'function') {
      window.openStructEditor(payload.pathKey);
    }
  });

  // 9. Top toolbar (plain DOM, lives above the frame).
  TopBar.mount(document.getElementById('gde-topbar'));

  // 10. Document title tracks project name.
  appEffect(function () {
    document.title = State.projectName() + ' · GameDataEditor';
  });

  // 11. Esc clears selection (but not while a context menu is open).
  onDocument('keydown', function (ev) {
    if (ev.key === 'Escape') {
      if (document.querySelector('.gde-ctx-menu, .ef-ui-menu')) return;
      State.setSelection(null);
    }
  });
})();

