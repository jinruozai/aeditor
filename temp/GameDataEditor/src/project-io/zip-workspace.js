/**
 * ProjectIO.zipWorkspace — import/export zip via fflate.
 */
(function () {
  'use strict';

  function ensureZip() {
    if (!window.fflate) throw new Error('Zip library is not loaded.');
    return window.fflate;
  }

  async function importZip(file) {
    var zip = ensureZip();
    var bytes = new Uint8Array(await file.arrayBuffer());
    var entries = zip.unzipSync(bytes);
    var dec = new TextDecoder();
    var files = {};
    Object.keys(entries).forEach(function (path) {
      if (/\.json$/i.test(path)) files[path] = dec.decode(entries[path]);
    });
    ProjectIO.assets.loadFromZip(entries);
    ProjectIO.codec.applySnapshot(ProjectIO.codec.filesToSnapshot(files), file.name.replace(/\.zip$/i, ''));
  }

  async function exportZip() {
    var zip = ensureZip();
    var enc = new TextEncoder();
    var snapshot = ProjectIO.codec.exportSnapshot();
    var files = ProjectIO.codec.snapshotToFiles(snapshot);
    var entries = {};
    Object.keys(files).forEach(function (path) {
      entries[path] = enc.encode(files[path]);
    });
    var assets = await ProjectIO.assets.zipEntries();
    Object.keys(assets).forEach(function (path) { entries[path] = assets[path]; });
    var out = zip.zipSync(entries, { level: 6 });
    var blob = new Blob([out], { type: 'application/zip' });
    var name = (State.projectName() || 'gamedata').replace(/[\\/:*?"<>|]+/g, '_') + '.zip';
    downloadBlob(name, blob);
  }

  function downloadBlob(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  window.ProjectIO = window.ProjectIO || {};
  window.ProjectIO.zipWorkspace = {
    importZip: importZip,
    exportZip: exportZip,
  };
})();
