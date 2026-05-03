/**
 * GDE.ai core - project adapter entry for EF.ai.
 */
(function () {
  'use strict';

  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }

  function fieldTypeName(def) {
    if (typeof def === 'string') return def;
    return def && typeof def === 'object' ? def.type || '' : '';
  }

  function tableOfEntity(id) {
    var sid = String(id);
    var tm = State.tableMap();
    var keys = Object.keys(tm);
    for (var i = 0; i < keys.length; i++) {
      if ((tm[keys[i]].id || []).indexOf(sid) >= 0) return keys[i];
    }
    return null;
  }

  function entityTitle(id, entity) {
    var info = State.resolveEntityDisplay(id);
    if (info && info.name) return info.name;
    if (entity && entity.name != null) return String(entity.name);
    return String(id);
  }

  function selectedEntityRefs(sel) {
    if (!sel) return [];
    if (sel.items && sel.items.length) {
      return sel.items.map(function (it) { return { table: it.pathKey, id: String(it.id) }; });
    }
    var ids = sel.ids && sel.ids.length ? sel.ids : (sel.id != null ? [sel.id] : []);
    return ids.map(function (id) { return { table: sel.pathKey || tableOfEntity(id), id: String(id) }; });
  }

  function ensureAI() {
    if (!window.EF || !EF.ai) {
      if (window.State && State.log) State.log('warn', 'GDE.ai skipped: EF.ai is not available');
      return null;
    }
    return EF.ai;
  }

  function projectSummary() {
    var tm = State.tableMap();
    var assets = window.ProjectIO && ProjectIO.assets ? ProjectIO.assets.list() : [];
    return {
      projectName: State.projectName(),
      version: State.version(),
      tableCount: Object.keys(tm).length,
      entityCount: Object.keys(State.gameData()).length,
      typeCount: Object.keys(State.builtinTypeConfig()).length + Object.keys(State.projectTypeConfig()).length,
      assetCount: assets.length,
      cardStyleCount: Object.keys(State.projectCardStyles()).length,
    };
  }

  function selectionContext() {
    var sel = State.selection();
    if (!sel) return { kind: 'none', refs: [] };
    var refs = [];
    if (sel.kind === 'card_data') {
      refs = selectedEntityRefs(sel).map(function (ref) {
        return {
          resolver: 'gde',
          uri: 'gde://entity/' + ref.table + '/' + ref.id,
          kind: 'gde.entity',
          title: ref.table + ' / ' + ref.id,
        };
      });
    } else if (sel.kind === 'card_style') {
      refs.push({ resolver: 'gde', uri: 'gde://card-style/' + sel.key, kind: 'gde.card_style', title: sel.key });
    } else if (sel.kind === 'card_component') {
      refs.push({ resolver: 'gde', uri: 'gde://card-style/' + sel.styleKey, kind: 'gde.card_style', title: sel.styleKey });
    } else if (sel.pathKey) {
      refs.push({ resolver: 'gde', uri: 'gde://table/' + sel.pathKey, kind: 'gde.table', title: sel.pathKey });
    }
    return { kind: sel.kind || 'selection', selection: clone(sel), refs: refs };
  }

  function addResourceRef(ref) {
    var ai = ensureAI();
    if (!ai || !ref || !ref.uri) return null;
    var existing = (ai.resources.peek ? ai.resources.peek() : ai.resources()).filter(function (item) {
      return item.resolver === (ref.resolver || ref.kind) && item.uri === ref.uri;
    })[0];
    return existing || ai.addResource(ref);
  }

  function attachRefsToAgent(agentId, refs) {
    var ai = ensureAI();
    var agent = ai && (agentId ? ai.findAgent(agentId) : ai.getActiveAgent());
    if (!agent) return null;
    var ids = agent.contextRefs.slice();
    (refs || []).forEach(function (ref) {
      var stored = addResourceRef(ref);
      if (stored && ids.indexOf(stored.id) < 0) ids.push(stored.id);
    });
    return ai.updateAgent(agent.id, { contextRefs: ids });
  }

  function attachSelectionToAgent(agentId) {
    var ctx = selectionContext();
    return attachRefsToAgent(agentId, ctx.refs || []);
  }

  function askAboutSelection(message, agentId) {
    var ai = ensureAI();
    if (!ai) return null;
    var agent = attachSelectionToAgent(agentId) || ai.getActiveAgent();
    if (!agent) return null;
    return ai.sendMessage(agent.id, {
      content: message || 'Inspect the attached GameDataEditor selection.',
    }, 'user');
  }

  function install() {
    if (GDE.ai._installed) return true;
    var ai = ensureAI();
    if (!ai) return false;
    if (GDE.ai.registerResourceResolvers) GDE.ai.registerResourceResolvers();
    if (GDE.ai.registerContextProviders) GDE.ai.registerContextProviders();
    if (GDE.ai.registerTools) GDE.ai.registerTools();
    if (GDE.ai.registerSkills) GDE.ai.registerSkills();
    if (GDE.ai.registerAgentTemplates) GDE.ai.registerAgentTemplates();
    GDE.ai._installed = true;
    State.log('info', 'GDE AI adapter installed');
    return true;
  }

  window.GDE = window.GDE || {};
  window.GDE.ai = Object.assign(window.GDE.ai || {}, {
    install: install,
    projectSummary: projectSummary,
    selectionContext: selectionContext,
    addResourceRef: addResourceRef,
    attachRefsToAgent: attachRefsToAgent,
    attachSelectionToAgent: attachSelectionToAgent,
    askAboutSelection: askAboutSelection,
    clone: clone,
    fieldTypeName: fieldTypeName,
    tableOfEntity: tableOfEntity,
    entityTitle: entityTitle,
    selectedEntityRefs: selectedEntityRefs,
  });
})();
