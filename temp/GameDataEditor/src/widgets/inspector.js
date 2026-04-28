/**
 * Inspector panel — schema-driven property editor for whatever the current
 * selection points at. Knows nothing about specific selection kinds. Each
 * kind registers its own provider via `Inspector.registerKind(kind, cfg)`.
 * Adding a new kind is a one-line register call — Inspector stays
 * untouched.
 *
 * Provider shape:
 *   title(sel):              string                 header text
 *   schema(sel):             struct_def-shaped obj  drives propertyPanel rows
 *   value(sel):              plain object           current values
 *   onChange(sel,field,nv):  void                   persistence
 *   dataTopic(sel)?:         string | null          bus topic watched for refresh
 */
(function () {
  'use strict';

  var ui = EF.ui;

  // Project-specific ref_id renderer.
  //
  // Display: paints the target entity's `ref_show` field using that
  // field's own renderer (readonly). When the table's struct_def.id
  // declares no ref_show, falls back to showing the raw id as text.
  //
  // Edit: pencil button swaps to a popover picker — text input + a
  // filtered list of `<id> : <ref_name>` rows, with typed substring
  // highlighted. ↑↓ / Enter / Esc / click-to-commit. Supports id or
  // ref_name matching.
  //
  // Drop target: accepts `application/ef.entity+json` dragged from the
  // left-side tree (or any source that emits that MIME), committing the
  // dropped entity's id.
  ui.registerRenderer('ref_id', function (args) {
    var sig = args.sig;
    var write = args.write;

    var root = ui.h('div', 'gde-refid');
    var face = ui.h('div', 'gde-refid-face');
    var editBtn = ui.iconButton({
      icon: 'edit', title: 'Edit reference', size: 'sm', kind: 'ghost',
      onClick: function () { openPicker(); },
    });
    var gotoBtn = ui.iconButton({
      icon: 'arrow-right', title: 'Go to target', size: 'sm', kind: 'ghost',
      onClick: function () {
        var id = sig.peek();
        if (id == null || id === 0) return;
        var info = State.resolveEntityDisplay(id);
        if (!info) { State.log('warn', 'Cannot jump: id ' + id + ' not found'); return; }
        // resolveEntityDisplay doesn't expose pathKey — redo the lookup
        // once here (the only place that actually needs it).
        var tm = State.tableMap(), sid = String(id), pk = null;
        Object.keys(tm).some(function (k) { if ((tm[k].id || []).indexOf(sid) >= 0) { pk = k; return true; } return false; });
        if (pk) EF.bus.emit('nav:goto', { pathKey: pk, id: sid });
      },
    });
    root.appendChild(face); root.appendChild(editBtn); root.appendChild(gotoBtn);

    // Paint the display face. Re-runs on signal change + gameData change
    // (so e.g. renaming the target entity updates the face live).
    var faceCleanup = null;
    EF.effect(function () {
      State.gameData();                             // subscribe
      var id = sig();
      face.innerHTML = '';
      if (faceCleanup) { try { faceCleanup() } catch (_) {} faceCleanup = null; }
      if (id == null || id === '' || id === 0) {
        face.textContent = '(none)';
        face.classList.add('is-empty');
        return;
      }
      face.classList.remove('is-empty');
      var info = State.resolveEntityDisplay(id);
      if (info && info.showDef) {
        // Render the ref_show field using its own editor, read-only.
        var showSig = EF.signal(info.show);
        var editor = ui.editorFor(info.showDef, showSig, function () {}, { readonly: true });
        editor.classList.add('gde-refid-show');
        face.appendChild(editor);
        faceCleanup = function () { try { ui.dispose(editor) } catch (_) {} };
      } else {
        face.textContent = String(id);
      }
    });

    // Drop target — accept dragged entities or plain-text ids.
    ui.dropzone(root, {
      accept: ['application/ef.entity+json', 'text/plain'],
      canDrop: function (d) { return !!(d.entity && d.entity.id != null) || !!(d.text && /^\d+$/.test(String(d.text))); },
      onDrop: function (d) {
        var nid = (d.entity && d.entity.id != null) ? d.entity.id : d.text;
        commit(nid);
      },
    });

    function commit(id) {
      var n = Number(id);
      write(Number.isFinite(n) && String(n).length === String(id).length ? n : String(id));
    }

    // ── Picker popover ──────────────────────────────────────────
    var pop = null;
    function openPicker() {
      if (pop) return;
      var container = ui.h('div', 'gde-refid-picker');
      var input = ui.h('input', 'gde-refid-picker-input', { type: 'text' });
      input.value = String(sig.peek() == null ? '' : sig.peek());
      var listEl = ui.h('div', 'gde-refid-picker-list');
      container.appendChild(input); container.appendChild(listEl);

      var candidates = [];
      var focusIdx = 0;

      function rebuild() {
        var q = input.value.trim();
        var qLow = q.toLowerCase();
        var gd = State.gameData();
        var hits = [];
        Object.keys(gd).forEach(function (sid) {
          var info = State.resolveEntityDisplay(sid);
          if (!info) return;
          var label = info.name;
          if (!q
            || sid.toLowerCase().indexOf(qLow) >= 0
            || (label && label.toLowerCase().indexOf(qLow) >= 0)) {
            hits.push({ id: sid, label: label });
          }
        });
        candidates = hits.slice(0, 50);
        focusIdx = 0;
        paint();
      }
      function paint() {
        listEl.innerHTML = '';
        if (!candidates.length) {
          var empty = ui.h('div', 'gde-refid-picker-empty', { text: 'No matches' });
          listEl.appendChild(empty); return;
        }
        var q = input.value.trim();
        candidates.forEach(function (c, i) {
          var row = ui.h('div', 'gde-refid-picker-row');
          if (i === focusIdx) row.classList.add('is-focused');
          row.appendChild(mark(c.id, q));
          row.appendChild(ui.h('span', 'gde-refid-picker-sep', { text: ' : ' }));
          row.appendChild(mark(c.label, q));
          row.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            commit(c.id); close();
          });
          row.addEventListener('mouseenter', function () {
            focusIdx = i;
            refreshFocus();
          });
          listEl.appendChild(row);
        });
      }
      function refreshFocus() {
        Array.from(listEl.children).forEach(function (r, i) {
          r.classList.toggle('is-focused', i === focusIdx);
        });
        var el = listEl.children[focusIdx];
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      }
      function mark(text, q) {
        var frag = document.createDocumentFragment();
        var s = String(text == null ? '' : text);
        if (!q) { frag.appendChild(document.createTextNode(s)); return frag; }
        var low = s.toLowerCase(); var qL = q.toLowerCase();
        var i = 0;
        while (i < s.length) {
          var hit = low.indexOf(qL, i);
          if (hit < 0) { frag.appendChild(document.createTextNode(s.slice(i))); break; }
          if (hit > i) frag.appendChild(document.createTextNode(s.slice(i, hit)));
          var m = document.createElement('mark'); m.className = 'gde-refid-picker-hit';
          m.textContent = s.slice(hit, hit + q.length);
          frag.appendChild(m);
          i = hit + q.length;
        }
        return frag;
      }
      input.addEventListener('input', rebuild);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowDown') { focusIdx = Math.min(focusIdx + 1, candidates.length - 1); refreshFocus(); ev.preventDefault(); }
        else if (ev.key === 'ArrowUp')   { focusIdx = Math.max(focusIdx - 1, 0); refreshFocus(); ev.preventDefault(); }
        else if (ev.key === 'Enter')     {
          if (candidates[focusIdx]) { commit(candidates[focusIdx].id); close(); }
          ev.preventDefault();
        }
        else if (ev.key === 'Escape')    { close(); ev.preventDefault(); }
      });

      rebuild();
      pop = ui.popover({
        anchor: root, content: container,
        side: 'bottom', align: 'start',
        onDismiss: function () { pop = null; },
      });
      setTimeout(function () { input.focus(); input.select(); }, 0);
    }
    function close() { if (pop) { pop.close(); pop = null; } }
    ui.collect(root, close);

    return root;
  });

  // ── Kind registry ─────────────────────────────────────────────
  var _kinds = Object.create(null);
  function registerKind(kind, provider) { _kinds[kind] = provider; }

  function createPanel(propsSig, ctx) {
    var props = propsSig.peek() || {};
    var root = document.createElement('div');
    root.className = 'gde-inspector';
    root.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:auto;';

    var header       = document.createElement('div'); header.className  = 'gde-inspector-header';
    var titleEl      = document.createElement('div'); titleEl.className = 'gde-name';
    var roLabel      = document.createElement('span'); roLabel.className = 'gde-inspector-ro-badge';
    roLabel.textContent = 'read-only'; roLabel.hidden = true;
    header.appendChild(titleEl); header.appendChild(roLabel);

    var schemaSig    = EF.signal({});
    var targetsSig   = EF.signal([]);
    var disabledSig  = EF.signal(false);
    var currentOnChange = null;

    var form = ui.propertyPanel({
      schema:   schemaSig,
      targets:  targetsSig,
      disabled: disabledSig,
      onChange: function (field, nv) { if (currentOnChange) currentOnChange(field, nv); },
      ctx:      { source: 'gde-inspector' },
    });

    // Dynamic bus subscription — the current kind decides which topic should
    // trigger a refresh (e.g., 'data:changed:<pathKey>' for card_data,
    // 'typeconfig:changed' for typeconfig). Swap whenever kind/sel changes.
    var offData = null;
    var dataTopic = null;
    function ensureDataSub(topic) {
      if (topic === dataTopic) return;
      if (offData) { offData(); offData = null; }
      dataTopic = topic;
      if (topic) offData = ctx.bus.on(topic, refresh);
    }

    function renderEmpty() {
      root.innerHTML = '';
      var empty = document.createElement('div');
      empty.className = 'gde-inspector-empty';
      var title = document.createElement('div');
      title.style.cssText = 'font-size:13px;font-weight:600;margin-bottom:4px;';
      title.textContent = t('inspector.empty_title');
      var hint  = document.createElement('div');
      hint.style.cssText = 'font-size:12px;';
      hint.textContent  = t('inspector.empty_hint');
      empty.appendChild(title); empty.appendChild(hint);
      root.appendChild(empty);
    }

    function renderForm() {
      if (!root.contains(form)) {
        root.innerHTML = '';
        root.appendChild(header);
        root.appendChild(form);
      }
    }

    // Custom-render path. A kind that declares `render(sel, ctx) -> el`
    // opts out of the propertyPanel pipeline; Inspector mounts the
    // returned element under the header and keeps it alive while the
    // (kind, identity) pair stays the same. Downstream data changes are
    // the custom element's responsibility (its own effects / bus subs).
    var currentCustom = null;
    var currentCustomKey = null;
    // A kind that doesn't fit `pathKey | key | id` (e.g. card_component
    // selects N nodes inside one cardStyle) can supply its own `key(sel)
    // → string` to drive identity. Without this the dispatcher would
    // collapse every selection of the same kind into a single key, reuse
    // the first-mounted form, and any `rebuild` inside that form would
    // read stale closure state.
    function kindSelKey(sel, kind) {
      if (kind && typeof kind.key === 'function') return sel.kind + ':' + kind.key(sel);
      return sel.kind + ':' + (sel.pathKey || sel.key || sel.id || '');
    }
    function disposeCustom() {
      if (currentCustom) {
        try { ui.dispose(currentCustom); } catch (_) {}
        currentCustom = null;
        currentCustomKey = null;
      }
    }
    function renderCustom(kind, sel) {
      var key = kindSelKey(sel, kind);
      if (key === currentCustomKey && currentCustom) return;  // same selection — leave mounted
      disposeCustom();
      currentCustomKey = key;
      currentCustom = kind.render(sel, ctx);
      root.innerHTML = '';
      root.appendChild(header);
      root.appendChild(currentCustom);
    }

    function refresh() {
      var sel  = State.selection();
      var kind = sel && _kinds[sel.kind];
      if (!kind) { ensureDataSub(null); disposeCustom(); renderEmpty(); return; }
      ensureDataSub(kind.dataTopic ? kind.dataTopic(sel) : null);
      titleEl.textContent = kind.title(sel);
      var isDisabled = !!(kind.disabled && kind.disabled(sel));
      roLabel.hidden = !isDisabled;
      if (kind.render) {
        disabledSig.set(false);
        renderCustom(kind, sel);
        return;
      }
      disposeCustom();
      // Blur before pushing the new value: the input bind effect skips writes
      // while the input has focus, so propagating the new selection's value
      // first would leave the previous user-typed text stranded in the DOM.
      // Going inert also requires no descendant has focus.
      if (isDisabled && form.contains(document.activeElement)) document.activeElement.blur();
      disabledSig.set(isDisabled);
      schemaSig.set(kind.schema(sel) || {});
      targetsSig.set([kind.value(sel) || {}]);
      currentOnChange = function (field, nv) { kind.onChange(sel, field, nv); };
      renderForm();
    }

    function applyLocale() {
      var pt = t('panel.inspector');
      if (ctx.panel && ctx.panel.title() !== pt) ctx.panel.setTitle(pt);
      refresh();
    }
    var offLocale = I18N.onChange(applyLocale);
    ctx.onCleanup(offLocale);
    ctx.bus.on('selection:changed', refresh);
    ctx.bus.on('tables:changed',    refresh);

    applyLocale();
    return root;
  }

  EF.registerComponent('gde-inspector', {
    factory: createPanel,
    defaults: function () { return { title: 'Inspector', props: {} }; },
  });

  // ── Built-in provider: editing an entity in a table ───────────
  registerKind('card_data', {
    title: function (sel) {
      var info = State.resolveEntityDisplay(sel.id);
      var face = info && info.name !== String(sel.id) ? info.name : sel.pathKey;
      return t('inspector.id_label') + ': ' + sel.id + ' · ' + face;
    },
    schema:    function (sel) { return (State.tableMap()[sel.pathKey] || {}).struct_def || {}; },
    value:     function (sel) { return State.gameData()[sel.id] || {}; },
    onChange:  function (sel, field, nv) { State.setEntityField(sel.id, field, nv); },
    dataTopic: function (sel) { return 'data:changed:' + sel.pathKey; },
  });

  // ── Built-in provider: editing the table itself ──────────────
  // Uses the `render` escape hatch instead of the propertyPanel
  // pipeline because the form mixes a path input, a dynamic list of
  // field sections, a picker popover, and three action buttons —
  // none of which fit a flat struct_def schema cleanly.
  registerKind('table_meta', {
    title:     function (sel) { return 'Table: ' + sel.pathKey; },
    dataTopic: function ()    { return 'tables:changed'; },
    render:    function (sel, ctx) { return buildTableMetaForm(sel.pathKey, ctx); },
  });

  function buildTableMetaForm(pathKey, ctx) {
    // pathSig tracks the *current* path — renames rewrite it and re-emit
    // a 'table_meta' selection with the new key, so this sub-form rebuilds
    // via the inspector's renderCustom identity check.
    var root = ui.h('div', 'gde-table-meta');

    // ── Path ────────────────────────────────────────────────
    var pathSig = EF.signal(pathKey);
    var pathLab = ui.h('div', 'gde-tm-section-label', { text: 'Path' });
    var pathIn = ui.input({ value: pathSig });
    pathIn.addEventListener('blur', function () {
      var nv = String(pathSig.peek() || '').trim();
      if (!nv || nv === pathKey) { pathSig.set(pathKey); return; }
      try {
        State.renameTable(pathKey, nv);
        State.setSelection({ kind: 'table_meta', pathKey: nv });
      } catch (e) {
        State.log('error', String(e.message || e));
        pathSig.set(pathKey);
      }
    });
    root.appendChild(pathLab);
    root.appendChild(pathIn);

    // ── Fields ──────────────────────────────────────────────
    var fieldsLab = ui.h('div', 'gde-tm-section-label gde-tm-fields-label', { text: 'Fields' });
    var fieldsWrap = ui.h('div', 'gde-tm-fields');
    root.appendChild(fieldsLab);
    root.appendChild(fieldsWrap);

    // renderFields skips rebuild when the struct_def's *key set* is unchanged.
    // Per-field override edits shouldn't tear down rows — that used to kill
    // input focus after every keystroke. Structural changes (add / delete
    // field, Merge) still go through a full rebuild. Row-internal effects
    // (override state, name color) handle the rest reactively.
    var lastKeySig = '';
    function renderFields(force) {
      var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
      var keySig = Object.keys(sd).sort().join('|');
      if (!force && keySig === lastKeySig && fieldsWrap.children.length > 0) return;
      lastKeySig = keySig;
      Array.from(fieldsWrap.children).forEach(function (c) { try { ui.dispose(c); } catch (_) {} });
      fieldsWrap.innerHTML = '';
      Object.keys(sd).forEach(function (k) { fieldsWrap.appendChild(buildFieldRow(k)); });
      var addBtn = ui.button({
        kind: 'ghost', size: 'sm', text: '+ Add field',
        onClick: function (ev) { openFieldPicker(ev.currentTarget); },
      });
      addBtn.classList.add('gde-tm-add-field');
      fieldsWrap.appendChild(addBtn);
    }

    // The set of "override-shaped" rows mirrors TypeConfig's schema 1:1,
    // minus the identity keys. Single source of truth lives in
    // widgets/typeconfig.js (window.TypeDefSchema).
    function overridableKeys() {
      var all = Object.keys(TypeDefSchema.build());
      var identity = TypeDefSchema.IDENTITY_KEYS;
      return all.filter(function (k) { return identity.indexOf(k) < 0; });
    }

    function buildFieldRow(fieldName) {
      // Look up the *type* this field uses (struct_def[field].type), not
      // the field name itself, against the type registry. The pre-1.3
      // code did `tc[fieldName]` and so painted "unknown type" on every
      // row — fields rarely share names with registered types.
      var tc = ui.getTypeConfig();
      var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
      var fd = sd[fieldName] || {};
      var def = fd.type ? tc[fd.type] : null;
      var known = !!def;

      var row = ui.h('div', 'gde-tm-field' + (known ? '' : ' is-unknown'));
      var head = ui.h('div', 'gde-tm-field-head');
      var caret = ui.h('span', 'gde-tm-caret', { text: '▸' });
      var nameEl = ui.h('span', 'gde-tm-field-name', { text: fieldName });
      var typeEl = ui.h('span', 'gde-tm-field-type', {
        text: known ? ((def.base_type || '?') + ' · ' + (def.type_render || '?')) : 'unknown type',
      });
      var delBtn = ui.iconButton({
        icon: 'trash', title: 'Delete field', size: 'sm', kind: 'ghost',
        onClick: function () { deleteField(fieldName); },
      });
      head.appendChild(caret); head.appendChild(nameEl);
      head.appendChild(typeEl); head.appendChild(delBtn);
      row.appendChild(head);

      // Row header gets a "has-override" class (→ orange name) when any
      // non-identity TypeDef key is overridden. Reactive so Merge /
      // unlock / revert updates the color live without a full rebuild.
      var overridableKeySet = overridableKeys();
      var stopHeadTint = EF.effect(function () {
        var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
        var o = sd[fieldName] || {};
        var overridden = overridableKeySet.some(function (k) { return k in o; });
        EF.untracked(function () { row.classList.toggle('has-override', overridden); });
      });
      ui.collect(row, stopHeadTint);

      var body = ui.h('div', 'gde-tm-field-body');
      body.style.display = 'none';
      row.appendChild(body);

      var expanded = false, bodyMounted = false;
      head.addEventListener('click', function (ev) {
        if (delBtn.contains(ev.target)) return;
        expanded = !expanded;
        caret.textContent = expanded ? '▾' : '▸';
        row.classList.toggle('is-expanded', expanded);
        body.style.display = expanded ? '' : 'none';
        if (expanded && !bodyMounted) {
          bodyMounted = true;
          body.appendChild(known
            ? buildOverrideEditor(fieldName, def)
            : ui.h('div', 'gde-tm-unknown-hint', {
                text: 'Field "' + fieldName + '" is not registered in TypeConfig. '
                    + 'Add a TypeConfig entry with this name to enable overrides.',
              }));
        }
      });
      return row;
    }

    // Override editor — mirrors TypeConfig's 7-row schema exactly:
    //   • key / name / base_type — always read-only, no action button
    //   • type_render / default / mem / type_agv — overridable via lock/revert
    //
    // Each row uses `ui.editorFor` so enum rows render as proper selects
    // (base_type, type_render), matching the TypeConfig panel visually.
    function buildOverrideEditor(fieldName, typeDef) {
      var schema = TypeDefSchema.build();
      var identity = TypeDefSchema.IDENTITY_KEYS;
      var editor = ui.h('div', 'gde-tm-override-editor');
      Object.keys(schema).forEach(function (sub) {
        editor.appendChild(identity.indexOf(sub) >= 0
          ? buildIdentityRow(fieldName, sub, schema[sub], typeDef)
          : buildOverridableSubRow(fieldName, sub, schema[sub], typeDef));
      });
      return editor;
    }

    // Stringified form of a typeDef[sub] value for the editor widget.
    // `default` and `type_agv` carry JSON-shaped values in struct_def but
    // are edited as text, so we pre-stringify / post-parse through JSON.
    function isJsonSub(sub) { return sub === 'default' || sub === 'type_agv'; }
    function subToStr(sub, v) {
      if (v === undefined || v === null) return '';
      return isJsonSub(sub) ? JSON.stringify(v) : String(v);
    }

    function buildIdentityRow(fieldName, sub, fieldDef, typeDef) {
      var row = ui.h('div', 'gde-tm-override-row is-identity');
      row.appendChild(ui.h('span', 'gde-tm-override-label', { text: sub }));
      var cell = ui.h('span', 'gde-tm-override-cell');
      var val  = (sub === 'key') ? fieldName : typeDef[sub];
      var sig  = EF.signal(subToStr(sub, val));
      var widget = ui.editorFor(fieldDef, sig, function () {}, {});
      widget.classList.add('gde-tm-override-widget');
      cell.appendChild(widget);
      row.appendChild(cell);
      return row;
    }

    function buildOverridableSubRow(fieldName, sub, fieldDef, typeDef) {
      var row = ui.h('div', 'gde-tm-override-row');
      row.appendChild(ui.h('span', 'gde-tm-override-label', { text: sub }));
      var cell = ui.h('span', 'gde-tm-override-cell');

      var jsonSub = isJsonSub(sub);
      function inheritedStr() { return subToStr(sub, typeDef[sub]); }
      function readOverride() {
        var o = (State.tableMap()[pathKey] || {}).struct_def[fieldName] || {};
        return (sub in o) ? { value: o[sub] } : null;
      }

      // Editor signal — kept in sync with the displayed value (inherited
      // or override). Writes from the widget are commit-only when we're
      // in override state; the effect below reconciles the signal after
      // each struct_def mutation.
      var vSig = EF.signal(inheritedStr());
      var widget = ui.editorFor(fieldDef, vSig, function (nv) {
        var sd = State.tableMap()[pathKey].struct_def || {};
        var o  = sd[fieldName] || {};
        if (!(sub in o)) return;               // inherited — writes ignored
        var parsed = nv;
        if (jsonSub) {
          if (String(nv) === '') { revert(); return; }  // empty JSON → revert
          try { parsed = JSON.parse(nv); } catch (_) { return; }
        } else if (String(nv) === '') {
          revert(); return;                     // empty text → revert
        }
        var patch = Object.assign({}, o); patch[sub] = parsed;
        var next  = Object.assign({}, sd); next[fieldName] = patch;
        State.updateStructDef(pathKey, next);
      }, {});
      widget.classList.add('gde-tm-override-widget');
      cell.appendChild(widget);

      function unlock() {
        var sd = State.tableMap()[pathKey].struct_def || {};
        var patch = Object.assign({}, sd[fieldName] || {});
        // Seed override with a value the resolver can round-trip.
        patch[sub] = jsonSub
          ? (typeDef[sub] !== undefined ? typeDef[sub] : (sub === 'type_agv' ? {} : ''))
          : (typeDef[sub] != null ? String(typeDef[sub]) : '');
        var next = Object.assign({}, sd); next[fieldName] = patch;
        State.updateStructDef(pathKey, next);
        setTimeout(function () {
          var input = widget.querySelector('input,select,textarea');
          if (input) { input.focus(); if (input.select) input.select(); }
        }, 0);
      }
      function revert() {
        var sd = State.tableMap()[pathKey].struct_def || {};
        var patch = Object.assign({}, sd[fieldName] || {});
        delete patch[sub];
        var next = Object.assign({}, sd); next[fieldName] = patch;
        State.updateStructDef(pathKey, next);
      }

      var lockBtn = ui.iconButton({
        icon: 'edit', title: 'Override this value',
        size: 'sm', kind: 'ghost', onClick: unlock,
      });
      var revertBtn = ui.iconButton({
        icon: 'x', title: 'Revert to inherited',
        size: 'sm', kind: 'ghost', onClick: revert,
      });
      lockBtn.classList.add('gde-tm-override-action');
      revertBtn.classList.add('gde-tm-override-action');
      cell.appendChild(lockBtn); cell.appendChild(revertBtn);
      row.appendChild(cell);

      // Reactive paint. The editor widget itself (via ui.input / ui.select)
      // already avoids clobbering a focused input when its value signal
      // changes, so we can just push the current display value here.
      var stop = EF.effect(function () {
        var ov = readOverride();
        var overridden = !!ov;
        EF.untracked(function () {
          row.classList.toggle('is-overridden', overridden);
          row.classList.toggle('is-inherited',  !overridden);
          lockBtn.style.display   = overridden ? 'none' : '';
          revertBtn.style.display = overridden ? '' : 'none';
          vSig.set(overridden ? subToStr(sub, ov.value) : inheritedStr());
        });
      });
      ui.collect(row, stop);

      return row;
    }

    function deleteField(fieldName) {
      EF.ui.confirm({
        title: 'Delete field',
        message: 'Remove "' + fieldName + '" from table "' + pathKey + '"? Existing entity data for this field will remain untouched until you run Fix format.',
        okLabel: 'Delete', danger: true,
      }).then(function (ok) {
        if (!ok) return;
        var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
        var next = Object.assign({}, sd); delete next[fieldName];
        State.updateStructDef(pathKey, next);
      });
    }

    // ── Add field popover picker ───────────────────────────
    function openFieldPicker(anchor) {
      var tc = ui.getTypeConfig();
      var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
      var available = Object.keys(tc).filter(function (k) { return !(k in sd); }).sort();
      if (!available.length) {
        State.log('info', 'No more type_config entries to add. Define a new one in TypeConfig first.');
        return;
      }
      var container = ui.h('div', 'gde-tm-picker');
      var input = ui.h('input', 'gde-tm-picker-input', { type: 'text', placeholder: 'Field name…' });
      var listEl = ui.h('div', 'gde-tm-picker-list');
      container.appendChild(input); container.appendChild(listEl);
      var candidates = [], focusIdx = 0, pop = null;

      function rebuild() {
        var q = input.value.trim().toLowerCase();
        candidates = available.filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).slice(0, 50);
        focusIdx = 0;
        paint();
      }
      function paint() {
        listEl.innerHTML = '';
        if (!candidates.length) {
          listEl.appendChild(ui.h('div', 'gde-tm-picker-empty', { text: 'No matches' }));
          return;
        }
        var q = input.value.trim();
        candidates.forEach(function (c, i) {
          var row = ui.h('div', 'gde-tm-picker-row' + (i === focusIdx ? ' is-focused' : ''));
          row.appendChild(hl(c, q));
          var info = ui.h('span', 'gde-tm-picker-type', { text: (tc[c].base_type || '?') });
          row.appendChild(info);
          row.addEventListener('mousedown', function (ev) { ev.preventDefault(); commit(c); });
          row.addEventListener('mouseenter', function () { focusIdx = i; refreshFocus(); });
          listEl.appendChild(row);
        });
      }
      function refreshFocus() {
        Array.from(listEl.children).forEach(function (r, i) { r.classList.toggle('is-focused', i === focusIdx); });
      }
      function hl(text, q) {
        var frag = document.createDocumentFragment();
        var s = String(text == null ? '' : text);
        if (!q) { frag.appendChild(document.createTextNode(s)); return frag; }
        var low = s.toLowerCase(), qL = q.toLowerCase();
        var i = 0;
        while (i < s.length) {
          var hit = low.indexOf(qL, i);
          if (hit < 0) { frag.appendChild(document.createTextNode(s.slice(i))); break; }
          if (hit > i) frag.appendChild(document.createTextNode(s.slice(i, hit)));
          var m = document.createElement('mark'); m.className = 'gde-tm-picker-hit';
          m.textContent = s.slice(hit, hit + q.length);
          frag.appendChild(m);
          i = hit + q.length;
        }
        return frag;
      }
      function commit(key) {
        var sd = (State.tableMap()[pathKey] || {}).struct_def || {};
        var next = Object.assign({}, sd); next[key] = {};   // empty override = inherit
        State.updateStructDef(pathKey, next);
        close();
      }
      function close() { if (pop) { pop.close(); pop = null; } }
      input.addEventListener('input', rebuild);
      input.addEventListener('keydown', function (ev) {
        if      (ev.key === 'ArrowDown') { focusIdx = Math.min(focusIdx + 1, candidates.length - 1); refreshFocus(); ev.preventDefault(); }
        else if (ev.key === 'ArrowUp')   { focusIdx = Math.max(focusIdx - 1, 0); refreshFocus(); ev.preventDefault(); }
        else if (ev.key === 'Enter')     { if (candidates[focusIdx]) commit(candidates[focusIdx]); ev.preventDefault(); }
        else if (ev.key === 'Escape')    { close(); ev.preventDefault(); }
      });
      rebuild();
      pop = ui.popover({
        anchor: anchor, content: container,
        side: 'bottom', align: 'start',
        onDismiss: function () { pop = null; },
      });
      setTimeout(function () { input.focus(); }, 0);
    }

    // ── Tools row ───────────────────────────────────────────
    var tools = ui.h('div', 'gde-tm-tools');
    tools.appendChild(ui.button({ size: 'sm', text: 'Check format',      onClick: function () { State.checkTableData(pathKey); } }));
    tools.appendChild(ui.button({ size: 'sm', text: 'Fix format',        onClick: function () { openFixConfirm(); } }));
    tools.appendChild(ui.button({ size: 'sm', text: 'Merge to TypeConfig', onClick: function () { openMergeConfirm(); } }));
    var delBtn = ui.button({ size: 'sm', kind: 'danger', text: 'Delete table', onClick: function () { handleDeleteTable(); } });
    delBtn.classList.add('gde-tm-tools-delete');
    tools.appendChild(delBtn);
    root.appendChild(tools);

    function openMergeConfirm() {
      var p = State.previewMergeStructDef(pathKey);
      var total = p.pushed.length + p.cleared.length + p.skipped.length;
      if (!total || (p.pushed.length === 0 && p.cleared.length === 0)) {
        State.log('info', 'Merge: "' + pathKey + '" already normalized — nothing to do');
        State.showLogPanel();
        return;
      }
      var body = ui.h('div', 'gde-tm-merge-preview');
      body.appendChild(ui.h('div', 'gde-tm-merge-line',
        { text: '↑ Push to TypeConfig (' + p.pushed.length + '): ' + (p.pushed.join(', ') || '—') }));
      body.appendChild(ui.h('div', 'gde-tm-merge-line',
        { text: '⚠ Clear overrides (' + p.cleared.length + '): ' + (p.cleared.join(', ') || '—') }));
      body.appendChild(ui.h('div', 'gde-tm-merge-line gde-tm-merge-skip',
        { text: '✓ Already consistent (' + p.skipped.length + '): ' + (p.skipped.join(', ') || '—') }));
      var footer = ui.h('div', null, { style: 'display:flex;gap:6px;justify-content:flex-end;' });
      var cancelBtn = ui.button({ text: 'Cancel', onClick: function () { m.close(); } });
      var applyBtn = ui.button({
        text: 'Apply', kind: 'primary',
        onClick: function () { State.mergeStructDef(pathKey); m.close(); },
      });
      footer.appendChild(cancelBtn); footer.appendChild(applyBtn);
      var m = ui.modal({
        title:   'Merge "' + pathKey + '" struct_def into TypeConfig',
        content: body,
        footer:  footer,
      });
    }

    function openFixConfirm() {
      var plan = State.previewFixTable(pathKey);
      if (!plan.length) {
        State.log('info', 'Fix: table "' + pathKey + '" already matches struct_def');
        State.showLogPanel();
        return;
      }
      var body = ui.h('div', 'gde-tm-fix-preview');
      var summary = ui.h('div', 'gde-tm-fix-summary', {
        text: plan.length + ' change' + (plan.length === 1 ? '' : 's') + ' planned:',
      });
      body.appendChild(summary);
      var list = ui.h('div', 'gde-tm-fix-list');
      plan.slice(0, 200).forEach(function (c) {
        var line = ui.h('div', 'gde-tm-fix-line');
        var badge = ui.h('span', 'gde-tm-fix-badge gde-tm-fix-' + c.kind, { text: c.kind });
        var text = c.kind === 'set'
          ? (c.id + ' · ' + c.field + ' ← ' + JSON.stringify(c.value) + '  (' + c.reason + ')')
          : (c.id + ' · ' + c.field + '  (extra)');
        line.appendChild(badge);
        line.appendChild(document.createTextNode(' ' + text));
        list.appendChild(line);
      });
      if (plan.length > 200) {
        list.appendChild(ui.h('div', 'gde-tm-fix-line', { text: '… and ' + (plan.length - 200) + ' more' }));
      }
      body.appendChild(list);
      var footer = ui.h('div', null, { style: 'display:flex;gap:6px;justify-content:flex-end;' });
      var cancelBtn = ui.button({ text: 'Cancel', onClick: function () { m.close(); } });
      var applyBtn = ui.button({
        text: 'Apply ' + plan.length + ' change' + (plan.length === 1 ? '' : 's'),
        kind: 'primary',
        onClick: function () {
          var res = State.applyFixes(pathKey, plan);
          State.log('info', 'Fix: table "' + pathKey + '" — changed ' + res.changed + ' of ' + res.total + ' entities');
          State.showLogPanel();
          m.close();
        },
      });
      footer.appendChild(cancelBtn); footer.appendChild(applyBtn);
      var m = ui.modal({
        title:   'Fix table "' + pathKey + '"?',
        content: body,
        footer:  footer,
      });
    }

    function handleDeleteTable() {
      var n = ((State.tableMap()[pathKey] || {}).id || []).length;
      EF.ui.confirm({
        title:   'Delete table',
        message: 'Delete table "' + pathKey + '" and all its ' + n + ' entities?',
        okLabel: 'Delete', danger: true,
      }).then(function (ok) {
        if (!ok) return;
        State.deleteTable(pathKey);
        State.setSelection(null);
        State.log('warn', 'Deleted table: ' + pathKey);
      });
    }

    // React to external mutations.
    //   tables:changed     → goes through key-set guard (only rebuilds when
    //                        the field set actually changed; per-value
    //                        edits keep the existing DOM and let the
    //                        per-row effects reconcile)
    //   typeconfig:changed → forces a rebuild: the field set is the same
    //                        but each row's `known` status (and the
    //                        "type · type_render" summary text) depends
    //                        on what's in TypeConfig. Merge, in particular,
    //                        makes previously-unknown fields known without
    //                        touching the struct_def key set.
    ctx.bus.on('tables:changed',     function () { renderFields(false); });
    ctx.bus.on('typeconfig:changed', function () { renderFields(true);  });
    renderFields();
    return root;
  }

  // ── card_style — edits the cardStyle's own meta (name) ───────────
  // The root node's props are edited via card_component selection on the
  // root id; this kind covers the cardStyle envelope.
  registerKind('card_style', {
    title:    function (sel) { return (State.projectCardStyles()[sel.key] || {}).name || sel.key; },
    schema:   function ()    { return { name: { type: 'string' } }; },
    value:    function (sel) {
      var cs = State.projectCardStyles()[sel.key] || {};
      return { name: cs.name || '' };
    },
    onChange: function (sel, field, nv) {
      var cs = Object.assign({}, State.projectCardStyles()[sel.key] || {});
      cs[field] = nv;
      State.upsertCardStyle(sel.key, cs);
    },
    dataTopic: function () { return 'cardstyles:changed'; },
  });

  // ── card_component — edits one or more nodes inside a cardStyle ──
  // sel.styleKey + sel.nodeIds[] (length≥1). Schema comes from the
  // component's spec.schema; multi-target uses propertyPanel's MIXED
  // semantics for free.
  registerKind('card_component', {
    title: function (sel) {
      var ids = sel.nodeIds || [];
      if (ids.length > 1) return ids.length + ' components';
      var n = findNodeInStyle(sel.styleKey, ids[0]);
      return n ? n.type : '(missing)';
    },
    // Identity = which cardStyle + which node ids are selected. Without this
    // every card_component selection collapsed to the same key, leaving the
    // first form mounted forever and showing stale schema for newer picks.
    key: function (sel) { return (sel.styleKey || '') + '/' + (sel.nodeIds || []).join(','); },
    render: function (sel, ctx) { return buildComponentPropsForm(sel, ctx); },
    dataTopic: function () { return 'cardstyles:changed'; },
  });

  function findNodeInStyle(styleKey, nodeId) {
    var cs = State.projectCardStyles()[styleKey];
    if (!cs || !cs.root) return null;
    function walk(n) {
      if (!n) return null;
      if (n.id === nodeId) return n;
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) { var hit = walk(kids[i]); if (hit) return hit; }
      return null;
    }
    return walk(cs.root);
  }
  function findNodePath(root, id, parent, idx) {
    if (!root) return null;
    if (root.id === id) return { node: root, parent: parent, index: idx };
    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) {
      var hit = findNodePath(kids[i], id, root, i);
      if (hit) return hit;
    }
    return null;
  }

  // Builds a custom-render component-props panel: schema-driven form +
  // per-prop "🔗 Bind to field" toggles. Multi-select feeds propertyPanel
  // with all node.props as targets so MIXED kicks in automatically.
  function buildComponentPropsForm(sel, panelCtx) {
    var root = ui.h('div', 'gde-cs-comp-form');
    var styleKey = sel.styleKey;
    var ids = sel.nodeIds || [];

    function rebuild() {
      root.innerHTML = '';
      var cs = State.projectCardStyles()[styleKey]; if (!cs) return;
      var nodes = ids.map(function (id) { return findNodeInStyle(styleKey, id); }).filter(Boolean);
      if (!nodes.length) {
        root.appendChild(ui.h('div', 'gde-inspector-empty', { text: '(no node)' }));
        return;
      }
      // Use the first node's component spec as the schema source. If
      // multiple kinds are mixed (e.g. text + img selected), we bail to
      // a placeholder rather than render a meaningless form.
      var firstType = nodes[0].type;
      if (nodes.some(function (n) { return n.type !== firstType; })) {
        root.appendChild(ui.h('div', 'gde-inspector-empty', {
          text: 'Selection has mixed component types — pick a single kind to edit.',
        }));
        return;
      }
      var spec; try { spec = EF.resolveComponent(firstType); } catch (_) { return; }
      var schema = spec.schema || {};
      var bindable = spec.bindable || [];

      var targetsSig = EF.signal(nodes.map(function (n) { return n.props || {}; }));
      var form = ui.propertyPanel({
        schema:   schema,
        targets:  targetsSig,
        defaults: spec.defaultProps || null,
        onChange: function (field, nv) {
          // Write nv into every selected node's props (taking the
          // bound→literal route by default; binding swaps below).
          mutateNodes(styleKey, ids, function (node) {
            node.props = Object.assign({}, node.props || {});
            node.props[field] = nv;
            // Editing a literal value clears any binding on this prop.
            if (node.bindings && node.bindings[field]) {
              node.bindings = Object.assign({}, node.bindings);
              delete node.bindings[field];
            }
          });
        },
      });
      root.appendChild(form);

      // Bindings UI — under the form, one row per bindable prop, lets
      // the user link the prop to a struct field instead of a literal.
      if (bindable.length) {
        root.appendChild(ui.h('div', 'gde-cs-bindings-head', { text: 'Bindings' }));
        var box = ui.h('div', 'gde-cs-bindings');
        bindable.forEach(function (key) { box.appendChild(buildBindingRow(key, ids[0])); });
        root.appendChild(box);
      }
    }

    // Build one binding row. Computes the consistent value across all
    // selected nodes for this propKey — if every node binds to the same
    // field, the dropdown shows it; if they disagree, it shows a Mixed
    // placeholder option that the user can pick "(literal)" or a real
    // field to overwrite for everyone.
    function buildBindingRow(propKey) {
      var row = ui.h('div', 'gde-cs-binding-row');
      row.appendChild(ui.h('span', 'gde-cs-binding-key', { text: propKey }));

      var fieldsForSelect = collectAvailableFields();
      // Compute initial value by inspecting all selected nodes.
      var summary = summarizeBinding(propKey);
      var sig = EF.signal(summary.mixed ? '__mixed' : summary.value);
      var options = [{ value: '', label: '(literal)' }];
      if (summary.mixed) options.push({ value: '__mixed', label: '— Mixed —' });
      fieldsForSelect.forEach(function (f) { options.push({ value: f, label: f }); });

      var sel = ui.select({
        value: sig,
        options: options,
        onChange: function (v) {
          if (v === '__mixed') return;  // sentinel; user must pick something concrete
          mutateNodes(styleKey, ids, function (n) {
            n.bindings = Object.assign({}, n.bindings || {});
            if (!v) delete n.bindings[propKey];
            else n.bindings[propKey] = { source: 'field', field: v };
          });
        },
      });
      if (summary.mixed) sel.classList.add('is-mixed');
      row.appendChild(sel);
      return row;
    }
    function summarizeBinding(propKey) {
      var first = null, mixed = false;
      for (var i = 0; i < ids.length; i++) {
        var n = findNodeInStyle(styleKey, ids[i]);
        if (!n) continue;
        var v = (n.bindings && n.bindings[propKey] && n.bindings[propKey].field) || '';
        if (i === 0) first = v;
        else if (v !== first) { mixed = true; break; }
      }
      return { value: first || '', mixed: mixed };
    }
    function collectAvailableFields() {
      // Union of every table's struct_def field names — cardStyles aren't
      // bound to a specific struct, but offering "any field name we know
      // about" is useful guidance.
      var s = new Set();
      var tm = State.tableMap();
      Object.keys(tm).forEach(function (pk) {
        var sd = tm[pk].struct_def || {};
        Object.keys(sd).forEach(function (k) { s.add(k); });
      });
      // Always offer 'id' (every entity has one).
      s.add('id');
      return Array.from(s).sort();
    }
    function mutateNodes(styleKey, ids, fn) {
      var cs = State.projectCardStyles()[styleKey]; if (!cs) return;
      var clone = JSON.parse(JSON.stringify(cs));
      ids.forEach(function (id) {
        var hit = findNodePath(clone.root, id, null, -1);
        if (hit) fn(hit.node);
      });
      State.upsertCardStyle(styleKey, clone);
    }

    EF.effect(rebuild);
    panelCtx.bus.on('cardstyles:changed', rebuild);
    panelCtx.bus.on('selection:changed',  rebuild);
    return root;
  }

  // Public API — other widgets teach the Inspector about their selection kinds.
  window.Inspector = { registerKind: registerKind };
})();
