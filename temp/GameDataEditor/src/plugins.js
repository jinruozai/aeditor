/**
 * GDE.plugins — project-local plugin loader.
 *
 * Project layout:
 *   plugin/manifest.json
 *   plugin/<plugin-name>/plugin.js
 *   plugin/<plugin-name>/plugin.css
 *
 * Plugin scripts are classic IIFEs. They call GDE.plugins.register(id, spec).
 */
(function () {
  'use strict';

  var registry = {};
  var active = {};
  var manifest = null;
  var projectFiles = {};
  var validators = {};
  var commands = {};
  var aiSkills = {};
  var assetViewers = [];
  var styleEls = [];
  var scriptUrls = [];

  function register(id, spec) {
    if (!id || !spec || typeof spec.activate !== 'function') {
      throw new Error('GDE.plugins.register requires id and activate(api)');
    }
    registry[id] = spec;
  }

  async function loadProject(files, projectName) {
    deactivateAll();
    projectFiles = Object.assign({}, files || {});
    manifest = parseManifest(projectFiles['plugin/manifest.json'], projectName);
    if (!manifest) return;

    var list = manifest.plugins || [];
    for (var i = 0; i < list.length; i++) {
      await loadDeclaredPlugin(list[i]);
    }
    for (var j = 0; j < list.length; j++) {
      activateDeclaredPlugin(list[j]);
    }
    if (manifest.ai && manifest.ai.skill) {
      registerProjectAISkill(manifest.ai.skill);
    }
    log('info', 'Loaded plugins: ' + list.map(function (p) { return p.id; }).join(', '));
  }

  function parseManifest(text, projectName) {
    if (!text) return null;
    try {
      var data = JSON.parse(text);
      if (!data || data.schema !== 1 || !Array.isArray(data.plugins)) {
        log('warn', 'plugin/manifest.json ignored: expected { schema: 1, plugins: [] }');
        return null;
      }
      data.project = data.project || projectName || '';
      return data;
    } catch (e) {
      log('error', 'Invalid plugin/manifest.json: ' + e.message);
      return null;
    }
  }

  async function loadDeclaredPlugin(desc) {
    var base = 'plugin/';
    var styles = desc.styles || [];
    var scripts = desc.scripts || [];
    for (var i = 0; i < styles.length; i++) appendStyle(base + cleanRelative(styles[i]));
    for (var j = 0; j < scripts.length; j++) await appendScript(base + cleanRelative(scripts[j]));
  }

  function activateDeclaredPlugin(desc) {
    var spec = registry[desc.id];
    if (!spec) {
      log('error', 'Plugin not registered after script load: ' + desc.id);
      return;
    }
    if (active[desc.id]) return;
    var cleanups = [];
    var api = createApi(desc, cleanups);
    active[desc.id] = { desc: desc, spec: spec, cleanups: cleanups };
    try {
      var ret = spec.activate(api);
      if (typeof ret === 'function') cleanups.push(ret);
    } catch (e) {
      log('error', '[' + desc.id + '] activate: ' + e.message);
    }
  }

  function createApi(desc, cleanups) {
    var pluginId = desc.id;
    function own(cleanup) {
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return cleanup;
    }
    function namespaced(name) {
      name = String(name || '').trim();
      if (!name) throw new Error('Plugin registration name required');
      return name.indexOf(pluginId + '.') === 0 ? name : pluginId + '.' + name;
    }
    return {
      id: pluginId,
      manifest: function () { return manifest; },
      files: function () { return Object.assign({}, projectFiles); },
      onCleanup: own,
      log: function (level, message, meta) { log(level, '[' + pluginId + '] ' + message, meta); },
      registerPanel: function (name, spec) {
        var component = namespaced(name);
        if (!componentRegistered(component)) EF.registerComponent(component, spec);
        return component;
      },
      registerFieldRenderer: function (name, renderer) {
        var kind = namespaced(name);
        EF.ui.registerRenderer(kind, renderer);
        return kind;
      },
      onBus: function (topic, handler) {
        return own(EF.bus.on(topic, handler));
      },
      effect: function (fn) {
        return own(EF.effect(fn));
      },
      on: function (target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        return own(function () { target.removeEventListener(type, handler, opts); });
      },
      openTable: function (pathKey, opts) {
        State.openTable(pathKey, opts);
      },
      setSelection: function (selection) {
        State.setSelection(selection);
      },
      openPanel: function (dockName, panel, opts) {
        var handle = window.__gde && window.__gde.handle;
        if (!handle) return null;
        var dockId = findDockId(handle.tree(), dockName);
        if (!dockId) return null;
        var ret = handle.addPanel(dockId, panel, opts || {});
        var panelId = ret && ret.panelId;
        if (panelId) own(function () {
          var h = window.__gde && window.__gde.handle;
          if (h) h.removePanel(panelId);
        });
        return panelId;
      },
      registerValidator: function (name, fn) {
        var key = namespaced(name);
        validators[key] = { pluginId: pluginId, fn: fn };
        own(function () { delete validators[key]; });
        return key;
      },
      registerCommand: function (name, spec) {
        var key = namespaced(name);
        commands[key] = Object.assign({ pluginId: pluginId }, spec || {});
        own(function () { delete commands[key]; });
        return key;
      },
      registerAssetViewer: function (name, spec) {
        var key = namespaced(name);
        var item = Object.assign({ id: key, pluginId: pluginId }, spec || {});
        assetViewers.push(item);
        own(function () {
          assetViewers = assetViewers.filter(function (v) { return v !== item; });
        });
        return key;
      },
      registerAISkill: function (name, textOrProvider) {
        var key = namespaced(name);
        aiSkills[key] = { pluginId: pluginId, value: textOrProvider };
        own(function () { delete aiSkills[key]; });
        return key;
      },
    };
  }

  function componentRegistered(name) {
    try {
      EF.resolveComponent(name);
      return true;
    } catch (_) {
      return false;
    }
  }

  function findDockId(tree, dockName) {
    var found = null;
    (function walk(node) {
      if (!node || found) return;
      if (node.type === 'dock' && (node.id === dockName || node.name === dockName)) {
        found = node.id;
      } else if (node.type === 'split') {
        node.children.forEach(walk);
      }
    })(tree);
    return found;
  }

  function registerProjectAISkill(path) {
    var clean = 'plugin/' + cleanRelative(path);
    var text = projectFiles[clean];
    if (text) aiSkills.project = { pluginId: 'project', value: text };
  }

  function appendStyle(path) {
    var text = projectFiles[path];
    if (text == null) {
      log('warn', 'Plugin style missing: ' + path);
      return;
    }
    var el = document.createElement('style');
    el.setAttribute('data-gde-plugin-style', path);
    el.textContent = text;
    document.head.appendChild(el);
    styleEls.push(el);
  }

  function appendScript(path) {
    return new Promise(function (resolve) {
      var text = projectFiles[path];
      if (text == null) {
        log('error', 'Plugin script missing: ' + path);
        resolve();
        return;
      }
      var blob = new Blob([text + '\n//# sourceURL=' + path], { type: 'text/javascript' });
      var url = URL.createObjectURL(blob);
      scriptUrls.push(url);
      var el = document.createElement('script');
      el.src = url;
      el.onload = function () { el.remove(); resolve(); };
      el.onerror = function () { log('error', 'Plugin script failed: ' + path); el.remove(); resolve(); };
      document.head.appendChild(el);
    });
  }

  function deactivateAll() {
    Object.keys(active).forEach(function (id) {
      var item = active[id];
      if (item.spec && typeof item.spec.deactivate === 'function') {
        try { item.spec.deactivate(); } catch (e) { log('error', '[' + id + '] deactivate: ' + e.message); }
      }
      for (var i = item.cleanups.length - 1; i >= 0; i--) {
        try { item.cleanups[i](); } catch (e2) { log('error', '[' + id + '] cleanup: ' + e2.message); }
      }
    });
    active = {};
    validators = {};
    commands = {};
    aiSkills = {};
    assetViewers = [];
    styleEls.forEach(function (el) { el.remove(); });
    styleEls = [];
    scriptUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    scriptUrls = [];
    manifest = null;
    projectFiles = {};
  }

  function validateProject() {
    var issues = [];
    Object.keys(validators).sort().forEach(function (key) {
      try {
        var ret = validators[key].fn({
          gameData: State.gameData(),
          tableMap: State.tableMap(),
          typeConfig: Object.assign({}, State.builtinTypeConfig(), State.projectTypeConfig()),
          cardStyles: State.projectCardStyles(),
          assets: ProjectIO.assets,
        });
        if (Array.isArray(ret)) issues = issues.concat(ret.map(function (it) {
          return Object.assign({ validator: key }, it || {});
        }));
      } catch (e) {
        issues.push({ validator: key, level: 'error', message: e.message });
      }
    });
    return issues;
  }

  function cleanRelative(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(function (p) { return p && p !== '.' && p !== '..'; })
      .join('/');
  }

  function log(level, message, meta) {
    if (window.State && State.log) State.log(level || 'info', message, meta);
  }

  window.GDE = window.GDE || {};
  window.GDE.plugins = {
    register: register,
    loadProject: loadProject,
    deactivateAll: deactivateAll,
    validateProject: validateProject,
    list: function () { return Object.keys(active).sort(); },
    manifest: function () { return manifest; },
    files: function () { return Object.assign({}, projectFiles); },
    validators: function () { return Object.keys(validators).sort(); },
    commands: function () { return Object.assign({}, commands); },
    aiSkills: function () { return Object.assign({}, aiSkills); },
    assetViewers: function () { return assetViewers.slice(); },
  };
})();
