/**
 * ProjectIO.assets — project asset store.
 *
 * Data fields store asset URLs:
 *   asset://foo/bar.png
 *
 * Disk / zip store the same resource at:
 *   asset/foo/bar.png
 */
(function () {
  'use strict';

  var ASSET_DIR = 'asset';
  var PROTOCOL = 'asset://';
  var files = {};
  var urls = {};
  var folders = { '': true };
  var version = EF.signal(0);

  function bump() {
    version.set(version.peek() + 1);
    State.markDirty();
    EF.bus.emit('assets:changed');
  }
  function changed() {
    version.set(version.peek() + 1);
    EF.bus.emit('assets:changed');
  }

  function importFile(file, kind, ctx) {
    var url = ctx && ctx.mode === 'property'
      ? propertyUrl(file, ctx)
      : urlInDir((ctx && ctx.dir) || '', file && file.name || ('asset' + extension(file, kind)), ctx && ctx.replace);
    cache(urlToPath(url), file);
    bump();
    return url;
  }

  function importFiles(fileList, targetDir) {
    var out = [];
    var list = Array.prototype.slice.call(fileList || []);
    list.forEach(function (file) {
      out.push(importFile(file, kindFromFile(file), { dir: targetDir || '' }));
    });
    return out;
  }

  function propertyUrl(file, ctx) {
    var ext = extension(file, ctx.kind || kindFromFile(file));
    var sel = ctx.selection || {};
    var table = cleanPath((sel.pathKey || (sel.items && sel.items[0] && sel.items[0].pathKey) || State.activeTable.peek() || 'data'));
    var id = clean((sel.id || (sel.ids && sel.ids[0]) || (sel.items && sel.items[0] && sel.items[0].id) || 'asset'));
    var field = clean(ctx.field || 'asset');
    var base = table ? table + '/' + id : id;
    var first = makeUrl(base + ext);
    if (!exists(first)) return first;
    var second = makeUrl(base + '_' + field + ext);
    if (!exists(second)) return second;
    for (var i = 2; i < 10000; i++) {
      var next = makeUrl(base + '_' + field + '_' + i + ext);
      if (!exists(next)) return next;
    }
    return makeUrl(base + '_' + field + '_' + Date.now() + ext);
  }

  function urlInDir(dir, name, replace) {
    var cleanDir = cleanPath(dir || '');
    var safeName = cleanFileName(name || ('asset_' + Date.now()));
    var path = cleanDir ? cleanDir + '/' + safeName : safeName;
    var candidate = makeUrl(path);
    if (replace) return candidate;
    if (!exists(candidate)) return candidate;
    var dot = safeName.lastIndexOf('.');
    var stem = dot > 0 ? safeName.slice(0, dot) : safeName;
    var ext = dot > 0 ? safeName.slice(dot) : '';
    for (var i = 2; i < 10000; i++) {
      candidate = makeUrl((cleanDir ? cleanDir + '/' : '') + stem + '_' + i + ext);
      if (!exists(candidate)) return candidate;
    }
    return makeUrl((cleanDir ? cleanDir + '/' : '') + stem + '_' + Date.now() + ext);
  }

  function makeUrl(path) {
    return PROTOCOL + cleanPath(path);
  }

  function isAssetUrl(url) {
    if (typeof url !== 'string' || url.indexOf(PROTOCOL) !== 0) return false;
    return !!urlToPath(url);
  }

  function urlToPath(url) {
    if (typeof url !== 'string' || url.indexOf(PROTOCOL) !== 0) return '';
    return cleanPath(url.slice(PROTOCOL.length));
  }

  function pathToDisk(path) {
    return ASSET_DIR + '/' + cleanPath(path);
  }

  function diskToUrl(path) {
    path = String(path || '').replace(/\\/g, '/');
    if (path === ASSET_DIR || path.indexOf(ASSET_DIR + '/') !== 0) return '';
    return makeUrl(path.slice(ASSET_DIR.length + 1));
  }

  function cache(path, blob) {
    path = cleanPath(path);
    addFolder(path.split('/').slice(0, -1).join('/'));
    files[path] = {
      path: path,
      url: makeUrl(path),
      name: path.split('/').pop(),
      dir: path.split('/').slice(0, -1).join('/'),
      kind: kindFromPath(path),
      size: blob && blob.size || 0,
      blob: blob,
    };
    if (urls[path]) URL.revokeObjectURL(urls[path]);
    urls[path] = URL.createObjectURL(blob);
  }

  function list() {
    version();
    return Object.keys(files).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true });
    }).map(function (path) { return fileInfo(files[path]); });
  }

  function fileInfo(f) {
    return {
      path: f.path,
      url: f.url,
      name: f.name,
      dir: f.dir,
      kind: f.kind,
      size: f.size,
    };
  }

  function dirs() {
    version();
    var out = Object.assign({ '': true }, folders);
    Object.keys(files).forEach(function (path) {
      var parts = path.split('/');
      parts.pop();
      var cur = '';
      parts.forEach(function (p) {
        cur = cur ? cur + '/' + p : p;
        out[cur] = true;
      });
    });
    return Object.keys(out).sort();
  }

  function children(dir, query) {
    version();
    dir = cleanPath(dir || '');
    var q = String(query || '').toLowerCase();
    var childFolders = {};
    Object.keys(folders).forEach(function (folder) {
      if (!folder || q && folder.toLowerCase().indexOf(q) < 0) return;
      if (!q) {
        if (dir && folder.indexOf(dir + '/') !== 0) return;
        var rest = dir ? folder.slice(dir.length + 1) : folder;
        if (!rest || rest.indexOf('/') >= 0) return;
      }
      childFolders[folder] = true;
    });
    var rows = [];
    Object.keys(files).forEach(function (path) {
      var f = files[path];
      if (q && path.toLowerCase().indexOf(q) < 0) return;
      if (!q) {
        if (dir && path.indexOf(dir + '/') !== 0) return;
        if (!dir && path.indexOf('/') < 0) {
          rows.push(fileInfo(f));
          return;
        }
        var rest = dir ? path.slice(dir.length + 1) : path;
        var slash = rest.indexOf('/');
        if (slash >= 0) {
          var folderPath = dir ? dir + '/' + rest.slice(0, slash) : rest.slice(0, slash);
          childFolders[folderPath] = true;
          return;
        }
      }
      rows.push(fileInfo(f));
    });
    return Object.keys(childFolders).sort().map(function (path) {
      return { kind: 'folder', path: path, name: path.split('/').pop(), url: makeUrl(path) };
    }).concat(rows);
  }

  function exists(url) {
    if (!isAssetUrl(url)) return false;
    return !!files[urlToPath(url)];
  }

  function get(url) {
    version();
    var f = files[urlToPath(url)];
    return f ? fileInfo(f) : null;
  }

  function urlFor(value) {
    if (!isAssetUrl(value)) return value || '';
    var path = urlToPath(value);
    return urls[path] || '';
  }

  function remove(urlsToDelete) {
    var arr = Array.isArray(urlsToDelete) ? urlsToDelete : [urlsToDelete];
    arr.forEach(function (url) {
      var path = urlToPath(url);
      if (!path || !files[path]) return;
      delete files[path];
      if (urls[path]) URL.revokeObjectURL(urls[path]);
      delete urls[path];
    });
    bump();
  }

  function addFolder(path) {
    path = cleanPath(path || '');
    folders[path] = true;
    if (!path) return;
    var parts = path.split('/');
    var cur = '';
    parts.forEach(function (p) {
      cur = cur ? cur + '/' + p : p;
      folders[cur] = true;
    });
  }

  function createFolder(parent, name) {
    addFolder((cleanPath(parent || '') ? cleanPath(parent || '') + '/' : '') + clean(name || 'Folder'));
    bump();
  }

  function move(oldUrl, newUrl) {
    var oldPath = urlToPath(oldUrl);
    var newPath = urlToPath(newUrl);
    if (!oldPath || !newPath || !files[oldPath] || oldPath === newPath) return oldUrl;
    if (files[newPath]) newUrl = urlInDir(newPath.split('/').slice(0, -1).join('/'), newPath.split('/').pop());
    newPath = urlToPath(newUrl);
    addFolder(newPath.split('/').slice(0, -1).join('/'));
    var oldFile = files[oldPath];
    delete files[oldPath];
    if (urls[oldPath]) {
      urls[newPath] = urls[oldPath];
      delete urls[oldPath];
    }
    files[newPath] = {
      path: newPath,
      url: makeUrl(newPath),
      name: newPath.split('/').pop(),
      dir: newPath.split('/').slice(0, -1).join('/'),
      kind: kindFromPath(newPath),
      size: oldFile.size,
      blob: oldFile.blob,
    };
    replaceReferences(oldUrl, makeUrl(newPath));
    bump();
    return makeUrl(newPath);
  }

  function rename(oldUrl, newName) {
    var path = urlToPath(oldUrl);
    if (!path) return oldUrl;
    var dir = path.split('/').slice(0, -1).join('/');
    return move(oldUrl, makeUrl((dir ? dir + '/' : '') + cleanFileName(newName)));
  }

  function replaceReferences(oldUrl, newUrl) {
    var gd = replaceDeep(State.gameData(), oldUrl, newUrl);
    var tm = replaceDeep(State.tableMap(), oldUrl, newUrl);
    var tc = replaceDeep(State.projectTypeConfig(), oldUrl, newUrl);
    var cs = replaceDeep(State.projectCardStyles(), oldUrl, newUrl);
    State.setGameData(gd);
    State.setTableMap(tm);
    State.setProjectTypeConfig(tc);
    State.setProjectCardStyles(cs);
  }

  function replaceDeep(v, oldUrl, newUrl) {
    if (v === oldUrl) return newUrl;
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      var arrChanged = false;
      var arr = v.map(function (item) {
        var next = replaceDeep(item, oldUrl, newUrl);
        if (next !== item) arrChanged = true;
        return next;
      });
      return arrChanged ? arr : v;
    }
    var changed = false;
    var out = {};
    Object.keys(v).forEach(function (key) {
      var next = replaceDeep(v[key], oldUrl, newUrl);
      out[key] = next;
      if (next !== v[key]) changed = true;
    });
    return changed ? out : v;
  }

  async function loadFromDirectory(dir) {
    clear();
    try {
      var assetDir = await dir.getDirectoryHandle(ASSET_DIR, { create: false });
      await readFolders(assetDir, '');
      await walk(assetDir, '', async function (path, fileHandle) {
        var file = await fileHandle.getFile();
        cache(path, file);
      });
    } catch (_) {}
    changed();
  }

  async function readFolders(dir, prefix) {
    folders[prefix] = true;
    for await (var entry of dir.values()) {
      if (entry.kind === 'directory') {
        var path = prefix ? prefix + '/' + entry.name : entry.name;
        await readFolders(entry, path);
      }
    }
  }

  async function walk(dir, prefix, visitFile) {
    for await (var entry of dir.values()) {
      var path = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.kind === 'file') await visitFile(path, entry);
      else if (entry.kind === 'directory') await walk(entry, path, visitFile);
    }
  }

  function loadFromZip(entries) {
    clear();
    Object.keys(entries || {}).forEach(function (diskPath) {
      var url = diskToUrl(diskPath);
      if (!url) return;
      var path = urlToPath(url);
      cache(path, new Blob([entries[diskPath]], { type: mime(path) }));
    });
    changed();
  }

  async function writeToDirectory(dir) {
    var assetDir = await dir.getDirectoryHandle(ASSET_DIR, { create: true });
    await removeMissing(assetDir, '');
    var folderList = Object.keys(folders).filter(Boolean).sort();
    for (var f = 0; f < folderList.length; f++) await ensureFolder(assetDir, folderList[f]);
    var paths = Object.keys(files).sort();
    for (var i = 0; i < paths.length; i++) await writeBlob(assetDir, paths[i], files[paths[i]].blob);
  }

  async function ensureFolder(root, path) {
    var parts = path.split('/');
    var dir = root;
    for (var i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
  }

  async function removeMissing(dir, prefix) {
    var toRemove = [];
    for await (var entry of dir.values()) {
      var path = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.kind === 'file') {
        if (!files[path]) toRemove.push({ name: entry.name, recursive: false });
      } else if (entry.kind === 'directory') {
        await removeMissing(entry, path);
        var empty = true;
        for await (var _ of entry.values()) { empty = false; break; }
        if (empty) toRemove.push({ name: entry.name, recursive: true });
      }
    }
    for (var i = 0; i < toRemove.length; i++) {
      await dir.removeEntry(toRemove[i].name, { recursive: toRemove[i].recursive });
    }
  }

  async function writeBlob(root, path, blob) {
    var parts = path.split('/');
    var name = parts.pop();
    var dir = root;
    for (var i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    var file = await dir.getFileHandle(name, { create: true });
    var writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function zipEntries() {
    var out = {};
    var paths = Object.keys(files).sort();
    for (var i = 0; i < paths.length; i++) {
      out[pathToDisk(paths[i])] = new Uint8Array(await files[paths[i]].blob.arrayBuffer());
    }
    return out;
  }

  function clear() {
    Object.keys(urls).forEach(function (path) { URL.revokeObjectURL(urls[path]); });
    files = {};
    urls = {};
    folders = { '': true };
    version.set(version.peek() + 1);
  }

  function extension(file, kind) {
    var name = (file && file.name) || '';
    var m = name.match(/\.([a-z0-9]+)$/i);
    if (m) return '.' + m[1].toLowerCase();
    var type = (file && file.type) || '';
    if (type === 'image/jpeg') return '.jpg';
    if (type === 'image/png') return '.png';
    if (type === 'image/webp') return '.webp';
    if (type === 'image/gif') return '.gif';
    if (type === 'audio/mpeg') return '.mp3';
    if (type === 'audio/wav') return '.wav';
    if (type === 'audio/ogg') return '.ogg';
    return kind === 'audio' ? '.bin' : '.png';
  }

  function kindFromFile(file) {
    var type = file && file.type || '';
    if (/^image\//.test(type)) return 'image';
    if (/^audio\//.test(type)) return 'audio';
    return kindFromPath(file && file.name || '');
  }

  function kindFromPath(path) {
    if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(path)) return 'image';
    if (/\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(path)) return 'audio';
    return 'file';
  }

  function cleanPath(s) {
    return String(s || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map(clean)
      .join('/');
  }

  function cleanFileName(s) {
    var parts = String(s || '').replace(/\\/g, '/').split('/');
    return clean(parts[parts.length - 1] || 'asset');
  }

  function clean(s) {
    return String(s || '')
      .trim()
      .replace(/\.\./g, '')
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .replace(/^\/+|\/+$/g, '') || 'unnamed';
  }

  function mime(path) {
    if (/\.(png)$/i.test(path)) return 'image/png';
    if (/\.(jpe?g)$/i.test(path)) return 'image/jpeg';
    if (/\.(webp)$/i.test(path)) return 'image/webp';
    if (/\.(gif)$/i.test(path)) return 'image/gif';
    if (/\.(svg)$/i.test(path)) return 'image/svg+xml';
    if (/\.(mp3)$/i.test(path)) return 'audio/mpeg';
    if (/\.(wav)$/i.test(path)) return 'audio/wav';
    if (/\.(ogg)$/i.test(path)) return 'audio/ogg';
    return 'application/octet-stream';
  }

  window.ProjectIO = window.ProjectIO || {};
  window.ProjectIO.assets = {
    version: version,
    importFile: importFile,
    importFiles: importFiles,
    createFolder: createFolder,
    list: list,
    dirs: dirs,
    children: children,
    exists: exists,
    get: get,
    remove: remove,
    move: move,
    rename: rename,
    replaceReferences: replaceReferences,
    urlFor: urlFor,
    isAssetUrl: isAssetUrl,
    urlToPath: urlToPath,
    makeUrl: makeUrl,
    loadFromDirectory: loadFromDirectory,
    loadFromZip: loadFromZip,
    writeToDirectory: writeToDirectory,
    zipEntries: zipEntries,
    clear: clear,
  };
  EF.ui.resolveAssetUrl = urlFor;
})();
