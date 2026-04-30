/**
 * Top toolbar — project menu, status, language switcher.
 * Mounts into the #gde-topbar host element directly; not an EF panel.
 */
(function () {
  'use strict';

  function buildMenu(anchor, items) {
    return EF.ui.menu({ anchor: anchor, side: 'bottom', align: 'start', items: items.map(function map(it) {
      if (it.separator) return { type: 'divider' };
      if (it.items)     return { label: it.label, items: it.items.map(map) };
      return { label: it.label, danger: it.danger, disabled: it.disabled, onSelect: it.onClick };
    })});
  }

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

    var brand = document.createElement('div'); brand.className = 'gde-brand';
    var bicon = document.createElement('div'); bicon.className = 'gde-brand-icon';
    var btitle = document.createElement('span');
    brand.appendChild(bicon); brand.appendChild(btitle);

    brand.addEventListener('click', function () {
      showProjectMenu();
    });
    host.appendChild(brand);

    async function showProjectMenu() {
      var recent = await ProjectIO.recent.list();
      var recentItems = recent.length ? recent.map(function (item) {
        return { label: item.name, onClick: function () { openRecent(item); } };
      }) : [{ label: t('toolbar.recent.empty'), disabled: true, onClick: function () {} }];
      buildMenu(brand, [
        { label: t('toolbar.new'), onClick: doNew },
        { label: t('toolbar.open_folder'), disabled: !ProjectIO.fsWorkspace.supported(), onClick: doOpenFolder },
        { label: t('toolbar.recent'), items: recentItems },
        { separator: true },
        { label: t('toolbar.save'), onClick: doSave },
        { label: t('toolbar.save_as'), disabled: !ProjectIO.fsWorkspace.supported(), onClick: doSaveAs },
        { separator: true },
        { label: t('toolbar.import_zip'), onClick: doImportZip },
        { label: t('toolbar.export_zip'), onClick: doExportZip },
        { separator: true },
        { label: t('toolbar.theme'), items: [
          themeItem('dark',    'Dark'),
          themeItem('dracula', 'Dracula'),
          themeItem('light',   'Light'),
        ]},
      ]);
    }

    var spacer = document.createElement('div'); spacer.className = 'gde-sep';
    host.appendChild(spacer);
    var status = document.createElement('div'); status.className = 'gde-status';
    host.appendChild(status);

    var langBtn = document.createElement('div');
    langBtn.className = 'gde-brand';
    langBtn.style.marginLeft = '6px';
    var langIcon = document.createElement('span'); langIcon.textContent = 'Lang';
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
      var name = State.projectName();
      btitle.textContent = t('app.title') + ' · ' + name + (State.dirty() ? '*' : '');
      langLabel.textContent = I18N.getLocale() === 'zh' ? '中' : 'EN';

      var tm = State.tableMap();
      var gd = State.gameData();
      var ws = State.workspaceInfo();
      var wsName = ws ? ws.name : t('toolbar.workspace.memory');
      status.innerHTML =
        '<span>' + t('toolbar.status.workspace') + ' <b>' + escapeHtml(wsName) + '</b></span>' +
        '<span>' + t('toolbar.status.tables') + ' <b>' + Object.keys(tm).length + '</b></span>' +
        '<span>' + t('toolbar.status.entities') + ' <b>' + Object.keys(gd).length + '</b></span>' +
        '<span>' + t('toolbar.status.version') + '<b>' + State.version() + '</b></span>';
    }

    I18N.onChange(refresh);
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
      ProjectIO.fsWorkspace.setWorkspace(null);
      ProjectIO.assets.clear();
      State.setWorkspaceInfo(null);
      State.setProjectTypeConfig({});
      State.setProjectCardStyles({ 'default': ProjectIO.codec.defaultCardStyle() });
      State.setGameData({});
      State.setTableMap({});
      State.projectName.set('Untitled');
      State.version.set(0);
      State.closeAllTabs();
      State.setSelection(null);
      State.markDirty();
      State.log('info', 'New project created');
    });
  }

  async function doOpenFolder() {
    await run('Open folder', async function () {
      var ws = await ProjectIO.fsWorkspace.openFolder();
      State.setWorkspaceInfo({ kind: 'folder', name: ws.name });
      State.clearDirty();
      await ProjectIO.recent.put(ws);
      State.log('info', 'Opened folder: ' + ws.name);
    });
  }

  async function doSave() {
    await run('Save', async function () {
      var ws = await ProjectIO.fsWorkspace.save();
      State.setWorkspaceInfo({ kind: 'folder', name: ws.name });
      State.clearDirty();
      await ProjectIO.recent.put(ws);
      State.log('info', 'Saved project: ' + ws.name);
    });
  }

  async function doSaveAs() {
    await run('Save as', async function () {
      var ws = await ProjectIO.fsWorkspace.saveAs();
      State.setWorkspaceInfo({ kind: 'folder', name: ws.name });
      State.clearDirty();
      await ProjectIO.recent.put(ws);
      State.log('info', 'Saved project as: ' + ws.name);
    });
  }

  function doImportZip() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      run('Import zip', async function () {
        await ProjectIO.zipWorkspace.importZip(file);
        ProjectIO.fsWorkspace.setWorkspace(null);
        State.setWorkspaceInfo({ kind: 'zip', name: file.name });
        State.clearDirty();
        State.log('info', 'Imported zip: ' + file.name);
      });
    };
    input.click();
  }

  async function doExportZip() {
    await run('Export zip', async function () {
      await ProjectIO.zipWorkspace.exportZip();
      State.log('info', 'Exported zip');
    });
  }

  async function openRecent(item) {
    await run('Open recent', async function () {
      await ProjectIO.fsWorkspace.loadFromHandle(item.handle);
      ProjectIO.fsWorkspace.setWorkspace({ kind: 'folder', name: item.name, handle: item.handle });
      State.setWorkspaceInfo({ kind: 'folder', name: item.name });
      State.clearDirty();
      await ProjectIO.recent.put({ name: item.name, handle: item.handle });
      State.log('info', 'Opened recent folder: ' + item.name);
    });
  }

  async function run(label, fn) {
    try { await fn(); }
    catch (e) { State.log('error', label + ': ' + e.message); State.showLogPanel(); }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
  }

  window.TopBar = { mount: mount };
})();
