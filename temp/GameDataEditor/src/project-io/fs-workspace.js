/**
 * ProjectIO.fsWorkspace — File System Access API workspace backend.
 */
(function () {
  'use strict';

  var codec = null;
  var current = null;

  function c() { return codec || (codec = window.ProjectIO.codec); }

  function supported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  async function openFolder() {
    if (!supported()) throw new Error('This browser does not support folder access.');
    var dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await loadFromHandle(dir);
    current = { kind: 'folder', name: dir.name, handle: dir };
    return current;
  }

  async function saveAs() {
    if (!supported()) throw new Error('This browser does not support folder access.');
    var dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    current = { kind: 'folder', name: dir.name, handle: dir };
    await save();
    return current;
  }

  async function save() {
    if (!current || !current.handle) return saveAs();
    await ensurePermission(current.handle);
    var snapshot = c().exportSnapshot();
    var files = c().snapshotToFiles(snapshot);
    await writeProjectFiles(current.handle, files);
    await writePluginFiles(current.handle);
    await ProjectIO.assets.writeToDirectory(current.handle);
    return current;
  }

  async function loadFromHandle(dir) {
    await ensurePermission(dir);
    var files = await readProjectFiles(dir);
    var pluginFiles = await readPluginFiles(dir);
    if (window.GDE && GDE.plugins) await GDE.plugins.loadProject(pluginFiles, dir.name);
    await ProjectIO.assets.loadFromDirectory(dir);
    c().applySnapshot(c().filesToSnapshot(files), dir.name);
    if (window.GDE && GDE.history) GDE.history.reset(t('history.open_project', { name: dir.name }), { saved: true });
  }

  async function ensurePermission(handle) {
    if (handle.queryPermission) {
      var q = await handle.queryPermission({ mode: 'readwrite' });
      if (q === 'granted') return;
    }
    if (handle.requestPermission) {
      var r = await handle.requestPermission({ mode: 'readwrite' });
      if (r === 'granted') return;
    }
    throw new Error('Folder permission denied.');
  }

  async function readProjectFiles(dir) {
    var files = {};
    await walk(dir, '', async function (path, fileHandle) {
      if (isSpecialPath(path)) return;
      if (!/\.json$/i.test(path)) return;
      var file = await fileHandle.getFile();
      files[path] = await file.text();
    });
    return files;
  }

  async function readPluginFiles(dir) {
    var files = {};
    try {
      var pluginDir = await dir.getDirectoryHandle('plugin', { create: false });
      await walk(pluginDir, 'plugin', async function (path, fileHandle) {
        if (!/\.(json|js|css|md|txt)$/i.test(path)) return;
        var file = await fileHandle.getFile();
        files[path] = await file.text();
      });
    } catch (_) {}
    return files;
  }

  async function walk(dir, prefix, visitFile) {
    for await (var entry of dir.values()) {
      var path = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.kind === 'file') await visitFile(path, entry);
      else if (entry.kind === 'directory') await walk(entry, path, visitFile);
    }
  }

  async function writeProjectFiles(dir, files) {
    var existing = await listProjectJsonFiles(dir);
    var wanted = {};
    Object.keys(files).forEach(function (path) { wanted[path] = true; });

    for (var i = 0; i < existing.length; i++) {
      var path = existing[i];
      if (path === 'gamedata.json') continue;
      if (!wanted[path]) await removePath(dir, path);
    }
    var paths = Object.keys(files).sort();
    for (var j = 0; j < paths.length; j++) {
      await writeTextFile(dir, paths[j], files[paths[j]]);
    }
  }

  async function listProjectJsonFiles(dir) {
    var out = [];
    await walk(dir, '', async function (path, fileHandle) {
      if (isSpecialPath(path)) return;
      if (!/\.json$/i.test(path)) return;
      if (path === 'gamedata.json') { out.push(path); return; }
      var file = await fileHandle.getFile();
      var text = await file.text();
      try {
        var obj = JSON.parse(text);
        if (obj && obj._table) out.push(path);
      } catch (_) {}
    });
    return out;
  }

  async function writePluginFiles(dir) {
    var files = window.GDE && GDE.plugins ? GDE.plugins.files() : {};
    var paths = Object.keys(files).sort();
    for (var i = 0; i < paths.length; i++) {
      await writeTextFile(dir, paths[i], files[paths[i]]);
    }
  }

  function isSpecialPath(path) {
    return path === 'asset' || path === 'plugin'
        || path.indexOf('asset/') === 0
        || path.indexOf('plugin/') === 0;
  }

  async function writeTextFile(root, path, text) {
    var parts = path.split('/');
    var name = parts.pop();
    var dir = root;
    for (var i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    var file = await dir.getFileHandle(name, { create: true });
    var writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function removePath(root, path) {
    var parts = path.split('/');
    var name = parts.pop();
    var dir = root;
    for (var i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: false });
    }
    await dir.removeEntry(name);
  }

  function workspace() { return current; }
  function setWorkspace(ws) { current = ws || null; }

  window.ProjectIO = window.ProjectIO || {};
  window.ProjectIO.fsWorkspace = {
    supported: supported,
    openFolder: openFolder,
    loadFromHandle: loadFromHandle,
    save: save,
    saveAs: saveAs,
    workspace: workspace,
    setWorkspace: setWorkspace,
  };
})();
