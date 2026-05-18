// aeditor.extensions AI bridge - exposes extension lifecycle operations/tools.
;(function (aeditor) {
  'use strict'

  const ai = aeditor.ai
  const ext = aeditor.extensions
  const OWNER = 'aeditor.extensions'
  const META = { owner: OWNER, layer: 'builtin' }

  if (!ai || !ext) return

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
  }

  function actorOptions(ctx) {
    return {
      allowCode: false,
      actor: ctx && ctx.actor,
      agentId: ctx && ctx.agent && ctx.agent.id,
    }
  }

  function extensionPreview(input, action, title) {
    input = input || {}
    return {
      ok: true,
      risk: 'edit',
      title: title + ': ' + input.id,
      input: clone(input),
      changes: [{ type: 'extension', id: input.id, action: action, layer: input.layer }],
    }
  }

  function registerOperations() {
    if (!ai.operations) return
    ai.operations.register('aeditor.installExtension', {
      title: 'Install Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input, ctx) { return ext.review(input, actorOptions(ctx)) },
      apply: function (preview, ctx) { return ext.install(preview.manifest || preview.input, actorOptions(ctx)) },
    }, META)
    ai.operations.register('aeditor.removeExtension', {
      title: 'Remove Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) { return extensionPreview(input, 'remove', 'Remove extension') },
      apply: function (preview, ctx) { return ext.uninstall(preview.input.id, Object.assign({ force: true }, actorOptions(ctx))) },
    }, META)
    ai.operations.register('aeditor.updateExtension', {
      title: 'Update Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input, ctx) { return ext.review(input, actorOptions(ctx)) },
      apply: function (preview, ctx) {
        const manifest = preview.manifest || preview.input && preview.input.manifest
        return ext.update(manifest.id, manifest, actorOptions(ctx))
      },
    }, META)
    ai.operations.register('aeditor.promoteExtensionLayer', {
      title: 'Promote Extension Layer',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) { return extensionPreview(input, 'setLayer', 'Promote extension') },
      apply: function (preview, ctx) { return ext.setLayer(preview.input.id, preview.input.layer, actorOptions(ctx)) },
    }, META)
    ai.operations.register('aeditor.enableExtension', {
      title: 'Enable Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) { return extensionPreview(input, 'enable', 'Enable extension') },
      apply: function (preview, ctx) { return ext.enable(preview.input.id, actorOptions(ctx)) },
    }, META)
    ai.operations.register('aeditor.disableExtension', {
      title: 'Disable Editor Extension',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) { return extensionPreview(input, 'disable', 'Disable extension') },
      apply: function (preview, ctx) { return ext.disable(preview.input.id, actorOptions(ctx)) },
    }, META)
    ai.operations.register('aeditor.addPanelToDock', {
      title: 'Add Panel To Dock',
      risk: 'edit',
      exposeToModel: false,
      preview: ext.previewAddPanelToDock,
      apply: ext.applyAddPanelToDock,
    }, META)
    ai.operations.register('aeditor.reloadPanel', {
      title: 'Reload Panel',
      risk: 'edit',
      exposeToModel: false,
      preview: ext.previewReloadPanel,
      apply: ext.applyReloadPanel,
    }, META)
    ai.operations.register('aeditor.removePanelFromDock', {
      title: 'Remove Panel From Dock',
      risk: 'edit',
      exposeToModel: false,
      preview: function (input) {
        input = input || {}
        return {
          ok: true,
          risk: 'edit',
          title: 'Remove panel',
          input: clone(input),
          changes: [{ type: 'dockPanel', action: 'remove', panelId: input.panelId || null, dock: input.dock || null }],
        }
      },
      apply: function (preview) { return ext.removePanelFromDock(preview.input) },
    }, META)
  }

  function registerTools() {
    if (!ai.tools) return
    /**
     * @aeditorApi aeditor.inspectDocks
     * @group ai-tools
     * @layer ai-host
     * @kind ai-tool
     * @signature aeditor.inspectDocks({ layout? })
     * @summary List current dock ids, names, viewport rects, panels, active panel, and accept rules so agents can choose a real runtime dock.
     * @param {object} input - Tool input.
     * @param {string} input.layout - Optional registered layout name; omit for all layouts.
     * @returns {object[]} Dock summaries.
     * @example
     * aeditor.inspectDocks({})
     * @related aeditor.addPanelToDock,aeditor.replacePanel
     */
    ai.tools.register('aeditor.inspectDocks', {
      title: 'Inspect Editor Docks',
      description: 'List registered editor docks with id, name, viewport rect, active panel, panel summaries, and accept rules. Use this before adding a panel so the dock id comes from runtime state rather than a guessed name.',
      schema: {
        type: 'object',
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit to inspect every registered layout.' },
        },
      },
      run: function (input) { return ext.inspectDocks(input || {}) },
    }, META)
    ai.tools.register('aeditor.installExtension', {
      title: 'Install Editor Extension',
      description: 'Install a low-level AEditor extension manifest for commands, menus, references, context, operations, settings, dock panels, or pre-registered component contributions. Agent-authored panels must be written as workspace files and added by registered component name.',
      schema: {
        type: 'object',
        required: ['manifest'],
        properties: {
          manifest: { type: 'object' },
        },
      },
      exposeToModel: false,
      preview: function (input, ctx) { return ext.review(input, actorOptions(ctx)) },
      apply: function (preview, ctx) {
        if (preview && preview.ok === false) return { applied: false, ok: false, errors: preview.errors || [], preview: preview }
        if (preview && preview.canApply === false) return { applied: false, ok: false, error: 'Extension install is not approved', preview: preview }
        return Object.assign({ applied: true }, ext.install(preview.manifest, actorOptions(ctx)))
      },
    }, META)
    /**
     * @aeditorApi aeditor.addPanelToDock
     * @group ai-tools
     * @layer ai-host
     * @kind ai-tool
     * @signature aeditor.addPanelToDock({ dock, component, path?, title?, props?, transient? })
     * @summary Add a registered or workspace-file component as a new panel in a runtime dock. If path is provided, the script is loaded before adding the panel.
     * @param {object} input - Tool input.
     * @param {string} input.dock - Dock id/name from inspectDocks.
     * @param {string} input.component - Registered component id.
     * @param {string} input.path - Optional workspace JS file to load before adding the panel.
     * @param {string} input.title - Optional panel title.
     * @param {object} input.props - Optional component props.
     * @param {boolean} input.transient - Optional transient panel flag.
     * @returns {object} Applied operation result.
     * @example
     * aeditor.addPanelToDock({
     *   dock: 'dock-2',
     *   component: 'three-scene',
     *   path: 'three-scene.js',
     *   title: '3D Scene',
     * })
     * @related aeditor.inspectDocks,aeditor.runtime.loadScript,aeditor.reloadPanel,aeditor.replacePanel
     */
    ai.tools.register('aeditor.addPanelToDock', {
      title: 'Add Panel To Dock',
      description: 'Add a component as a runtime panel in a dock, equivalent to choosing that component from the dock Add Panel menu. For a newly written workspace component file, pass path so the runtime loads the script before adding the panel. This tool never accepts source code; inspect docks first, then pass a dock id returned by aeditor.inspectDocks.',
      schema: {
        type: 'object',
        required: ['dock', 'component'],
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit for the default layout.' },
          dock: { type: 'string', description: 'Dock name or id, for example editor, sidebar, properties, or bottom.' },
          component: { type: 'string', description: 'Registered component id.' },
          path: { type: 'string', description: 'Optional workspace JS file to load first when the component is not registered yet.' },
          owner: { type: 'string', description: 'Optional owner for registrations created while loading path. Defaults to the current workspace id.' },
          layer: { type: 'string', description: 'Optional registration layer. Defaults to workspace.' },
          title: { type: 'string' },
          icon: { type: 'string' },
          props: { type: 'object' },
          transient: { type: 'boolean' },
        },
      },
      preview: ext.previewAddPanelToDock,
      apply: ext.applyAddPanelToDock,
    }, META)
    /**
     * @aeditorApi aeditor.reloadPanel
     * @group ai-tools
     * @layer ai-host
     * @kind ai-tool
     * @signature aeditor.reloadPanel({ panelId, path?, component? })
     * @summary Reload one existing panel instance after its component file changes. Keeps the same panel id, dock position, title, props, and component.
     * @param {object} input - Tool input.
     * @param {string} input.panelId - Existing panel instance id returned by aeditor.inspectDocks.
     * @param {string} input.path - Optional workspace JS file to load with replace semantics before rebuilding the panel.
     * @param {string} input.component - Optional safety check; must match the current panel component. Use replacePanel to change component.
     * @returns {object} Applied operation result.
     * @example
     * aeditor.reloadPanel({
     *   panelId: 'panel-12',
     *   path: 'login-panel.js',
     * })
     * @related aeditor.inspectDocks,aeditor.addPanelToDock,aeditor.replacePanel
     */
    ai.tools.register('aeditor.reloadPanel', {
      title: 'Reload Panel',
      description: 'Reload an existing panel after editing its component file. Keeps the same panelId and dock position. Use this after changing the same component file; use replacePanel only when changing to a different component.',
      schema: {
        type: 'object',
        required: ['panelId'],
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit for the default layout.' },
          panelId: { type: 'string', description: 'Existing panel instance id returned by aeditor.inspectDocks.' },
          path: { type: 'string', description: 'Optional workspace JS file to reload with replace semantics before rebuilding the panel.' },
          component: { type: 'string', description: 'Optional safety check; must match the current panel component.' },
          owner: { type: 'string', description: 'Optional owner for registrations created while loading path. Defaults to the current workspace id.' },
          layer: { type: 'string', description: 'Optional registration layer. Defaults to workspace.' },
        },
      },
      preview: ext.previewReloadPanel,
      apply: ext.applyReloadPanel,
    }, META)
    /**
     * @aeditorApi aeditor.replacePanel
     * @group ai-tools
     * @layer ai-host
     * @kind ai-tool
     * @signature aeditor.replacePanel({ panelId, component, path?, title?, props?, transient?, discardDirty? })
     * @summary Replace one existing panel instance with another component while keeping its dock position. Use reloadPanel after editing the same component file.
     * @param {object} input - Tool input.
     * @param {string} input.panelId - Existing panel instance id.
     * @param {string} input.component - Registered component id.
     * @param {string} input.path - Optional workspace JS file to load before replacing.
     * @param {string} input.title - Optional panel title.
     * @param {object} input.props - Optional component props.
     * @param {boolean} input.discardDirty - Must be true to replace a dirty panel.
     * @returns {object} Applied operation result.
     * @example
     * aeditor.replacePanel({
     *   panelId: 'panel-12',
     *   component: 'cube-inspector',
     *   path: 'cube-inspector.js',
     * })
     * @related aeditor.inspectDocks,aeditor.addPanelToDock,aeditor.reloadPanel
     */
    ai.tools.register('aeditor.replacePanel', {
      title: 'Replace Panel',
      description: 'Replace one existing panel instance by panelId while keeping its dock position. Parameters match aeditor.addPanelToDock except panelId replaces dock. For a newly written workspace component file, pass path so the runtime loads the script before replacing the panel.',
      schema: {
        type: 'object',
        required: ['panelId', 'component'],
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit for the default layout.' },
          panelId: { type: 'string', description: 'Existing panel instance id returned by aeditor.inspectDocks.' },
          component: { type: 'string', description: 'Registered component id.' },
          path: { type: 'string', description: 'Optional workspace JS file to load first when the component is not registered yet.' },
          owner: { type: 'string', description: 'Optional owner for registrations created while loading path. Defaults to the current workspace id.' },
          layer: { type: 'string', description: 'Optional registration layer. Defaults to workspace.' },
          title: { type: 'string' },
          icon: { type: 'string' },
          props: { type: 'object' },
          transient: { type: 'boolean' },
          discardDirty: { type: 'boolean', description: 'Must be true to replace a dirty panel.' },
        },
      },
      preview: ext.previewReplacePanel,
      apply: ext.applyReplacePanel,
    }, META)
  }

  registerOperations()
  registerTools()
})(window.aeditor = window.aeditor || {})
