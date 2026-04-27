/**
 * Top toolbar — project menu, status, language switcher.
 * Mounts into the #gde-topbar host element directly; not an EF panel.
 */
(function () {
  'use strict';

  // Map legacy ContextMenu item format (onClick/separator/items) to
  // EF.ui.contextMenu (onSelect / { type:'divider' } / nested submenu).
  function buildMenu(anchor, items) {
    var r = anchor.getBoundingClientRect();
    EF.ui.contextMenu({ x: r.left, y: r.bottom + 2 }, items.map(function map(it) {
      if (it.separator) return { type: 'divider' };
      if (it.items)     return { label: it.label, items: it.items.map(map) };
      return { label: it.label, danger: it.danger, onSelect: it.onClick };
    }));
  }

  // Theme switcher — three built-in EF themes via [data-ef-theme] attribute.
  var THEME_KEY = 'gde.theme';
  function currentTheme() { return document.documentElement.getAttribute('data-ef-theme') || 'dark'; }
  function setTheme(name) {
    if (name && name !== 'dark') document.documentElement.setAttribute('data-ef-theme', name);
    else document.documentElement.removeAttribute('data-ef-theme');
    try { localStorage.setItem(THEME_KEY, name || 'dark'); } catch (_) {}
  }
  try {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dracula' || saved === 'light') setTheme(saved);
  } catch (_) {}
  function themeItem(name, label) {
    return { label: label + (currentTheme() === name ? '  ✓' : ''),
             onClick: function () { setTheme(name); } };
  }

  function mount(host) {
    host.innerHTML = '';

    // Brand + project menu
    var brand = document.createElement('div'); brand.className = 'gde-brand';
    var bicon = document.createElement('div'); bicon.className = 'gde-brand-icon';
    var btitle = document.createElement('span');
    brand.appendChild(bicon); brand.appendChild(btitle);

    brand.addEventListener('click', function () {
      buildMenu(brand, [
        { label: t('toolbar.new'), onClick: function () { doNew(); } },
        { label: t('toolbar.open'), onClick: function () { doOpen(); } },
        { label: t('toolbar.recent') + ' ▸', onClick: function () { setTimeout(function () { showRecent(brand); }, 0); } },
        { separator: true },
        { label: t('toolbar.save'), onClick: function () { doSave(); } },
        { label: t('toolbar.save_as'), onClick: function () { doSaveAs(); } },
        { separator: true },
        { label: t('toolbar.export_tc'), onClick: function () { exportTypeConfig(); } },
        { separator: true },
        { label: t('toolbar.theme'), items: [
          themeItem('dark',    'Dark'),
          themeItem('dracula', 'Dracula'),
          themeItem('light',   'Light'),
        ]},
      ]);
    });
    host.appendChild(brand);

    // Status region
    var spacer = document.createElement('div'); spacer.className = 'gde-sep';
    host.appendChild(spacer);
    var status = document.createElement('div'); status.className = 'gde-status';
    host.appendChild(status);

    // Language switch
    var langBtn = document.createElement('div');
    langBtn.className = 'gde-brand';
    langBtn.style.marginLeft = '6px';
    var langIcon = document.createElement('span'); langIcon.textContent = '🌐';
    var langLabel = document.createElement('span');
    langBtn.appendChild(langIcon); langBtn.appendChild(langLabel);
    langBtn.addEventListener('click', function () {
      buildMenu(langBtn, [
        { label: t('toolbar.lang.en') + (I18N.getLocale() === 'en' ? '  ✓' : ''),
          onClick: function () { I18N.setLocale('en'); } },
        { label: t('toolbar.lang.zh') + (I18N.getLocale() === 'zh' ? '  ✓' : ''),
          onClick: function () { I18N.setLocale('zh'); } },
      ]);
    });
    host.appendChild(langBtn);

    function refresh() {
      btitle.textContent = t('app.title') + ' · ' + State.projectName();
      langLabel.textContent = I18N.getLocale() === 'zh' ? '中' : 'EN';
      var tm = State.tableMap();
      var gd = State.gameData();
      var tCount = Object.keys(tm).length;
      var eCount = Object.keys(gd).length;
      status.innerHTML =
        '<span>' + t('toolbar.status.tables') + ' <b>' + tCount + '</b></span>' +
        '<span>' + t('toolbar.status.entities') + ' <b>' + eCount + '</b></span>' +
        '<span>' + t('toolbar.status.version') + '<b>' + State.version() + '</b></span>';
    }

    I18N.onChange(refresh);
    EF.bus.on('tables:changed', refresh);
    EF.bus.on('data:changed', refresh);
    // coarse: any table changed
    ['typeconfig:changed'].forEach(function (ev) { EF.bus.on(ev, refresh); });
    // Reactive: any read signal (tableMap/gameData/projectName/version/logs-none) will
    // re-trigger. Plus keep explicit bus subscriptions for events that don't go
    // through signals directly (none today, but kept for clarity).
    EF.effect(refresh);
  }

  function doNew() {
    EF.ui.confirm({
      title:   'New Project',
      message: 'Discard current project and start a new one?',
      danger:  true,
      okLabel: 'Discard',
    }).then(function (ok) {
      if (!ok) return;
      State.setTableMap({});
      State.setGameData({});
      State.setProjectTypeConfig({});
      State.projectName.set('Untitled');
      State.closeAllTabs(); State.setSelection(null);
      State.log('info', 'New project created');
    });
  }
  function doOpen() {
    var input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.accept = '.json,.gmdata';
    input.onchange = function () {
      var files = Array.from(input.files || []);
      loadFiles(files);
    };
    input.click();
  }

  function loadFiles(files) {
    if (!files.length) return;
    var pending = files.length;
    var gmdata = null, jsonTables = [];
    files.forEach(function (f) {
      var reader = new FileReader();
      reader.onload = function () {
        var content = String(reader.result || '');
        try {
          var obj = JSON.parse(content);
          if (/\.gmdata$/i.test(f.name)) {
            gmdata = obj;
          } else if (/\.json$/i.test(f.name)) {
            jsonTables.push({ name: f.name, data: obj, webkitPath: f.webkitRelativePath || f.name });
          }
        } catch (e) {
          State.log('error', 'Parse error in ' + f.name + ': ' + e.message);
        }
        pending--;
        if (pending === 0) applyLoad(gmdata, jsonTables);
      };
      reader.readAsText(f);
    });
  }

  function applyLoad(gmdata, jsonTables) {
    // Reset & apply
    State.setTableMap({}); State.setGameData({}); State.setProjectTypeConfig({});
    var version = 0;
    if (gmdata) {
      if (typeof gmdata.version === 'number') { version = gmdata.version; State.version.set(version); }
      if (gmdata.type_config) State.setProjectTypeConfig(gmdata.type_config);
      State.log('info', 'Loaded .gmdata: version=' + version +
        ', project types=' + (gmdata.type_config ? Object.keys(gmdata.type_config).length : 0));
    }
    var tm = {}; var gd = {}; var dupe = {};
    jsonTables.forEach(function (f) {
      var key = 'struct_def_' + version;
      if (!f.data[key]) {
        State.log('warn', 'Skip "' + f.name + '": missing ' + key);
        return;
      }
      var sd = f.data[key];
      var pathKey = (f.webkitPath || f.name).replace(/\.json$/i, '');
      // Drop any leading directory if user picked files from file picker
      var ids = [];
      Object.keys(f.data).forEach(function (k) {
        if (k === key) return;
        if (gd[k]) {
          dupe[k] = (dupe[k] || 1) + 1;
          State.log('warn', 'Duplicate ID: ' + k + ' (in ' + pathKey + ')', { id: k, pathKey: pathKey });
        }
        gd[k] = f.data[k];
        ids.push(k);
      });
      tm[pathKey] = { struct_def: sd, id: ids };
      State.log('info', 'Loaded table: ' + pathKey + ' (' + ids.length + ' entities)');
    });
    State.setGameData(gd);
    State.setTableMap(tm);
    Normalize.normalizeAll();
    State.projectName.set('Imported');
    rememberRecent('Imported');
  }

  function doSave() { doSaveAs(); }
  function doSaveAs() {
    var tm = State.tableMap(); var gd = State.gameData();
    var version = State.version();
    var gmdataObj = {};
    if (version !== 0) gmdataObj.version = version;
    var proj = State.projectTypeConfig();
    var builtin = State.builtinTypeConfig();
    var tcOut = {};
    Object.keys(proj).forEach(function (k) {
      if (JSON.stringify(proj[k]) !== JSON.stringify(builtin[k])) tcOut[k] = proj[k];
    });
    if (Object.keys(tcOut).length) gmdataObj.type_config = tcOut;
    // Build zip-like bundle: since we can't write multiple files, generate one text blob with manifest
    // Simpler: save a single aggregate JSON containing gmdata + every table; also offer per-table download.
    var bundle = {
      _manifest: {
        app: 'GameDataEditor',
        exportedAt: new Date().toISOString(),
        gmdata: Object.keys(gmdataObj).length ? gmdataObj : null,
      },
      tables: {},
    };
    Object.keys(tm).forEach(function (pk) {
      var obj = {};
      obj['struct_def_' + version] = tm[pk].struct_def;
      tm[pk].id.forEach(function (id) { obj[id] = gd[id]; });
      bundle.tables[pk + '.json'] = obj;
    });
    downloadJSON((State.projectName() || 'gamedata') + '.bundle.json', bundle);
    State.log('info', 'Exported bundle (' + Object.keys(bundle.tables).length + ' tables)');
  }
  function exportTypeConfig() {
    var merged = Object.assign({}, State.builtinTypeConfig(), State.projectTypeConfig());
    downloadJSON('type_config.json', merged);
    State.log('info', 'Exported merged TypeConfig');
  }
  function downloadJSON(name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  // Recent projects
  function rememberRecent(name) {
    try {
      var arr = JSON.parse(localStorage.getItem('gde.recent') || '[]');
      arr = arr.filter(function (x) { return x !== name; });
      arr.unshift(name);
      localStorage.setItem('gde.recent', JSON.stringify(arr.slice(0, 10)));
    } catch (_) {}
  }
  function getRecent() {
    try { return JSON.parse(localStorage.getItem('gde.recent') || '[]'); } catch (_) { return []; }
  }
  function showRecent(anchor) {
    var arr = getRecent();
    var items = arr.length ? arr.map(function (n) {
      return { label: n, onClick: function () { State.log('info', 'Recent: ' + n + ' (placeholder)'); } };
    }) : [{ label: t('toolbar.recent.empty'), onClick: function () {} }];
    buildMenu(anchor, items);
  }

  window.TopBar = { mount: mount };
})();
