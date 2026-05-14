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
    ai.tools.register('aeditor.addPanelToDock', {
      title: 'Add Panel To Dock',
      description: 'Add an already registered component as a panel in a dock. This tool never accepts source code; create durable UI by registering a component from files, then add it here by component name.',
      schema: {
        type: 'object',
        required: ['dock', 'component'],
        properties: {
          layout: { type: 'string', description: 'Registered layout name; omit for the default layout.' },
          dock: { type: 'string', description: 'Dock name or id, for example editor, sidebar, properties, or bottom.' },
          component: { type: 'string', description: 'Registered component id.' },
          title: { type: 'string' },
          icon: { type: 'string' },
          props: { type: 'object' },
          transient: { type: 'boolean' },
        },
      },
      exposeToModel: false,
      preview: ext.previewAddPanelToDock,
      apply: ext.applyAddPanelToDock,
    }, META)
  }

  registerOperations()
  registerTools()
})(window.aeditor = window.aeditor || {})
