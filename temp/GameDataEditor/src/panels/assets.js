/**
 * Asset panel — project-local resource manager for asset:// URLs.
 */
(function () {
  'use strict';

  function createPanel(propsSig, ctx) {
    var root = document.createElement('div');
    root.className = 'gde-assets';

    var toolbar = document.createElement('div');
    toolbar.className = 'gde-assets-toolbar';

    var search = document.createElement('input');
    search.className = 'gde-search-input';
    search.placeholder = 'Search assets...';

    var addBtn = button('Add Files', 'plus');
    var folderBtn = button('Folder', 'plus');
    var renameBtn = button('Rename', 'edit');
    var deleteBtn = button('Delete', 'trash');

    toolbar.appendChild(search);
    toolbar.appendChild(addBtn);
    toolbar.appendChild(folderBtn);
    toolbar.appendChild(renameBtn);
    toolbar.appendChild(deleteBtn);

    var crumb = document.createElement('div');
    crumb.className = 'gde-assets-crumb';

    var grid = document.createElement('div');
    grid.className = 'gde-assets-grid';

    root.appendChild(toolbar);
    root.appendChild(crumb);
    root.appendChild(grid);

    var dir = '';
    var query = '';
    var selected = new Set();
    var last = null;

    search.addEventListener('input', function () {
      query = search.value || '';
      selected.clear();
      render();
    });
    addBtn.addEventListener('click', pickFiles);
    folderBtn.addEventListener('click', function () {
      var name = prompt('Folder name');
      if (!name) return;
      ProjectIO.assets.createFolder(dir, name);
      render();
    });
    renameBtn.addEventListener('click', renameSelected);
    deleteBtn.addEventListener('click', deleteSelected);
    grid.addEventListener('click', function (ev) {
      if (ev.target !== grid) return;
      selected.clear();
      last = null;
      paintSelection();
    });

    EF.ui.dropzone(grid, {
      accept: ['Files'],
      canDrop: function (d) { return !!(d.files || d.fileMimes); },
      onDrop: function (d) {
        importDroppedFiles(d.files || []);
      },
    });

    ctx.bus.on('assets:changed', render);

    function button(label, icon) {
      var b = document.createElement('button');
      b.className = 'gde-assets-btn';
      b.type = 'button';
      b.appendChild(EF.ui.icon({ name: icon, size: 'sm' }));
      b.appendChild(document.createTextNode(label));
      return b;
    }

    function pickFiles() {
      var input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = function () {
        if (input.files && input.files.length) {
          importDroppedFiles(input.files);
        }
      };
      input.click();
    }

    async function importDroppedFiles(files) {
      var list = Array.prototype.slice.call(files || []);
      var replaceAll = false;
      var keepAll = false;
      for (var i = 0; i < list.length; i++) {
        var file = list[i];
        var target = ProjectIO.assets.makeUrl((dir ? dir + '/' : '') + file.name);
        var replace = false;
        if (ProjectIO.assets.exists(target) && !replaceAll && !keepAll) {
          var ok = await EF.ui.confirm({
            title: 'Asset already exists',
            message: target + ' already exists. Replace it? Cancel keeps both.',
            okLabel: 'Replace',
          });
          replace = !!ok;
          if (list.length > 1) {
            if (replace) replaceAll = true;
            else keepAll = true;
          }
        } else if (ProjectIO.assets.exists(target)) {
          replace = replaceAll;
        }
        ProjectIO.assets.importFile(file, null, { dir: dir, replace: replace });
      }
      State.log('info', 'Imported ' + list.length + ' asset(s) to asset://' + dir);
      render();
    }

    function renderCrumb() {
      crumb.innerHTML = '';
      var rootBtn = crumbPart('asset', '');
      crumb.appendChild(rootBtn);
      var cur = '';
      cleanParts(dir).forEach(function (p) {
        cur = cur ? cur + '/' + p : p;
        crumb.appendChild(document.createTextNode('/'));
        crumb.appendChild(crumbPart(p, cur));
      });
    }

    function crumbPart(label, path) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.onclick = function () { dir = path; selected.clear(); render(); };
      return b;
    }

    function render() {
      ProjectIO.assets.version();
      renderCrumb();
      grid.innerHTML = '';
      var rows = ProjectIO.assets.children(dir, query);
      if (!rows.length) {
        var empty = document.createElement('div');
        empty.className = 'gde-assets-empty';
        empty.textContent = query ? 'No matching assets.' : 'Drop files here.';
        grid.appendChild(empty);
        return;
      }
      rows.forEach(function (item, idx) {
        var tile = document.createElement('div');
        tile.className = 'gde-asset-tile';
        tile.dataset.key = item.kind === 'folder' ? 'folder:' + item.path : item.url;
        if (selected.has(tile.dataset.key)) tile.classList.add('is-selected');

        var thumb = document.createElement('div');
        thumb.className = 'gde-asset-thumb';
        if (item.kind === 'folder') {
          thumb.appendChild(EF.ui.icon({ name: 'folder', size: 'lg' }));
        } else if (item.kind === 'image') {
          var img = document.createElement('img');
          img.src = ProjectIO.assets.urlFor(item.url);
          thumb.appendChild(img);
        } else {
          thumb.appendChild(EF.ui.icon({ name: item.kind === 'audio' ? 'music' : 'file', size: 'lg' }));
        }
        var name = document.createElement('div');
        name.className = 'gde-asset-name';
        name.textContent = item.name;
        tile.appendChild(thumb);
        tile.appendChild(name);

        tile.addEventListener('click', function (ev) { select(tile.dataset.key, idx, rows, ev); });
        tile.addEventListener('dblclick', function () {
          if (item.kind === 'folder') { dir = item.path; selected.clear(); render(); }
        });
        if (item.kind !== 'folder') {
          var dragSpec = {
            effect: 'copyMove',
            getData: function () {
              return {
                'text/uri-list': item.url,
                'text/plain': item.url,
                'application/ef.asset+json': JSON.stringify({ kind: item.kind, value: item.url }),
              };
            },
          };
          EF.ui.dragsource(tile, dragSpec);
          EF.ui.dragsource(thumb, dragSpec);
          EF.ui.dragsource(name, dragSpec);
        }
        grid.appendChild(tile);
      });
    }

    function select(key, idx, rows, ev) {
      if (ev.shiftKey && last != null) {
        var a = Math.min(last, idx), b = Math.max(last, idx);
        if (!(ev.ctrlKey || ev.metaKey)) selected.clear();
        for (var i = a; i <= b; i++) selected.add(rows[i].kind === 'folder' ? 'folder:' + rows[i].path : rows[i].url);
      } else if (ev.ctrlKey || ev.metaKey) {
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        last = idx;
      } else {
        selected.clear();
        selected.add(key);
        last = idx;
      }
      paintSelection();
    }

    function paintSelection() {
      Array.prototype.forEach.call(grid.querySelectorAll('.gde-asset-tile'), function (tile) {
        tile.classList.toggle('is-selected', selected.has(tile.dataset.key));
      });
    }

    function selectedAssetUrls() {
      return Array.from(selected).filter(function (v) { return v.indexOf('asset://') === 0; });
    }

    function renameSelected() {
      var urls = selectedAssetUrls();
      if (urls.length !== 1) return;
      var info = ProjectIO.assets.get(urls[0]);
      if (!info) return;
      var name = prompt('Rename asset', info.name);
      if (!name || name === info.name) return;
      var next = ProjectIO.assets.rename(urls[0], name);
      selected.clear();
      selected.add(next);
      State.log('info', 'Renamed asset: ' + urls[0] + ' -> ' + next);
      render();
    }

    function deleteSelected() {
      var urls = selectedAssetUrls();
      if (!urls.length) return;
      EF.ui.confirm({
        title: 'Delete Asset',
        message: 'Delete ' + urls.length + ' asset(s)? This removes them from the project asset store.',
        danger: true,
        okLabel: 'Delete',
      }).then(function (ok) {
        if (!ok) return;
        ProjectIO.assets.remove(urls);
        selected.clear();
        State.log('warn', 'Deleted ' + urls.length + ' asset(s)');
        render();
      });
    }

    function cleanParts(path) {
      return String(path || '').split('/').filter(Boolean);
    }

    render();
    return root;
  }

  EF.registerComponent('gde-assets', {
    factory: createPanel,
    defaults: function () { return { title: 'Assets', props: {} }; },
  });
})();
