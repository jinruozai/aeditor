# Extensions

## Purpose

An extension packages things AEditor already knows how to register.

```text
extension
+-- components
+-- tools
+-- context
+-- operations
+-- settings
+-- commands
`-- styles
```

Extension is not a separate programming model. It is a delivery and lifecycle
format around existing registries.

The main model is only:

```text
manifest -> contributes -> register by dotted prefix -> unregister by prefix
```

Everything else in the extension runtime is a safeguard around that model, not a
new extension kind.

## Manifest Shape

```js
{
  id: 'inventory',
  title: 'Inventory',
  contributes: {
    components: {
      'inventory.panel': { /* component spec */ }
    },
    tools: {
      'inventory.createItem': { /* tool spec */ }
    },
    context: {
      'inventory.schema': { /* context spec */ }
    },
    operations: {
      'inventory.patchItem': { /* operation spec */ }
    },
    settings: {
      'inventory.display': { /* setting spec */ }
    },
    commands: {
      'inventory.refresh': { /* command spec */ }
    }
  }
}
```

All public names should start with the extension id prefix.

## Install

Install registers each contribution with the normal registry:

```js
aeditor.registerComponent('inventory.panel', spec)
aeditor.ai.tools.register('inventory.createItem', spec)
aeditor.ai.context.register('inventory.schema', spec)
aeditor.ai.operations.register('inventory.patchItem', spec)
aeditor.settings.registerSchema('inventory.display', spec)
aeditor.commands.register('inventory.refresh', spec)
```

Commands are UI/human actions for menus, buttons, command palettes, shortcuts,
and context menus. Tools are AI/model actions with schemas, permissions,
tool-call state, and model-visible results. Extensions may contribute both when
the same feature should be available to both humans and agents.

Implemented extension APIs currently include:

```js
aeditor.extensions.preview(input)
aeditor.extensions.install(manifest, options)
aeditor.extensions.installWithReview(input, options)
aeditor.extensions.update(id, manifest, options)
aeditor.extensions.uninstall(id, options)
aeditor.extensions.enable(id)
aeditor.extensions.disable(id)
aeditor.extensions.list()
aeditor.extensions.get(id)
```

## Uninstall

Uninstall removes by name prefix:

```js
aeditor.ai.tools.unregisterPrefix('inventory.')
aeditor.ai.context.unregisterPrefix('inventory.')
aeditor.ai.operations.unregisterPrefix('inventory.')
aeditor.settings.unregisterPrefix('inventory.')
aeditor.commands.unregisterPrefix('inventory.')
aeditor.unregisterComponentPrefix('inventory.')
```

The same dotted path model is used everywhere. Some current registries still
need prefix cleanup helpers; see [current-gaps.md](./current-gaps.md).

## Dynamic UI

AI-created panels should use the same component model as handwritten panels.

For visible UI generation, the preferred high-level tool is:

```text
ui.createPanel
```

It should produce a normal registered component and optionally add it to a dock.
The generated component should use `aeditor.ui.*` when framework widgets fit the
design.

Current high-level helpers:

```js
aeditor.extensions.createPanelPreview(input, options)
aeditor.extensions.createPanel(input, options)
```

The implementation may install a same-page factory component or another
approved manifest form, but the result should still be a normal registered
component plus normal dock panel data.

## Runtime Safeguards

The extension runtime also has safety and recovery helpers:

```js
aeditor.extensions.safeMode(enabled, options)
aeditor.extensions.setLayer(id, layer)
aeditor.extensions.setMaxLayer(layer)
aeditor.extensions.enableLayer(layer)
aeditor.extensions.disableLayer(layer)
aeditor.extensions.configurePermissions(policy)
aeditor.extensions.configureStorage(options)
aeditor.extensions.boot(options)
aeditor.extensions.save()
aeditor.extensions.clearStored()
```

These are operational safeguards around the same contribution model. They are
not extra extension kinds and should stay secondary in docs, UI, and prompts.

Advanced host hooks:

```js
aeditor.extensions.registerLayout(name, handle)
aeditor.extensions.registerAdapter(id, spec)
```

Use them only when the normal registries cannot express the integration. The
default path for visible UI remains: register a component, then add panel data to
a dock.

## Recovery

Extensions may be disabled by prefix. This keeps recovery simple:

```js
aeditor.extensions.disable('inventory')
```

Internally that means the runtime stops loading names under `inventory.`.
