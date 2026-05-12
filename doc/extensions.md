# Extensions

## Purpose

An extension packages things AEditor already knows how to register.

```text
extension
+-- components
+-- tools
+-- context references
+-- operations
+-- settings
+-- commands
`-- styles
```

Extension Runtime is not a separate programming model. It is a delivery,
review, trust, and lifecycle layer around existing registries.

The main model is only:

```text
manifest -> contributes -> register by dotted prefix -> unregister by prefix
```

Everything else in the extension runtime is a safeguard around that model, not a
new extension kind.

## Manifest Shape

```js
{
  id: 'sample',
  title: 'Sample Tools',
  trust: {
    code: 'none' // none | trusted | sandbox
  },
  contributes: {
    components: [
      { id: 'panel', /* component spec or adapter reference */ }
    ],
    tools: [
      {
        id: 'makeThing',
        adapter: 'sample.adapter',
        permission: { phase: 'apply', risk: 'write' },
        visibleToModel: true
      }
    ],
    context: [
      { id: 'schema', adapter: 'sample.adapter' }
    ],
    operations: [
      { id: 'patchThing', adapter: 'sample.adapter' }
    ],
    settings: [
      { section: { id: 'sample', title: 'Sample' }, schema: { key: 'sample.display' } }
    ],
    commands: [
      { id: 'refresh', adapter: 'sample.adapter' }
    ],
    styles: [
      { id: 'theme', href: 'sample.css' }
    ]
  }
}
```

Contribution ids are local by default. AEditor publishes them with the extension
id as a dotted prefix:

```text
panel     -> sample.panel
makeThing -> sample.makeThing
```

An id may already include the prefix, but public names must stay under that
dotted prefix.

## Install

Install registers each contribution with the normal registry:

```js
aeditor.registerComponent('sample.panel', spec)
aeditor.ai.tools.register('sample.makeThing', spec)
aeditor.ai.context.register('sample.schema', spec)
aeditor.ai.operations.register('sample.patchThing', spec)
aeditor.settings.registerSchema('sample.display', spec)
aeditor.commands.register('sample.refresh', spec)
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
aeditor.ai.tools.unregisterPrefix('sample')
aeditor.ai.context.unregisterPrefix('sample')
aeditor.ai.operations.unregisterPrefix('sample')
aeditor.settings.unregisterPrefix('sample')
aeditor.commands.unregisterPrefix('sample')
aeditor.unregisterComponentPrefix('sample')
```

The same dotted path model is used everywhere. Metadata may exist for
diagnostics and safety policy, but prefix cleanup is the lifecycle model.

## Trust Tiers

Extension contributions are reviewed by trust tier:

| Tier | Meaning | Default |
| --- | --- | --- |
| data-only | Manifest data, settings schema, declarative component references, styles allowed by host policy. | Allowed after manifest validation. |
| trusted same-window code | Component/tool/context/operation code runs in the host page. | Requires explicit trusted install. |
| sandbox iframe | UI runs in an iframe and talks through postMessage capability tokens. | Requires host iframe adapter. |
| host-adapter tool | Calls privileged local/remote adapter code. | Requires adapter contract and permission policy. |

The default extension path is data-only. Code execution is never implied by
installing a manifest. Tool contributions must declare permission intent, risk,
origin, and model visibility so the AI permission resolver can make the final
decision.

## Dynamic UI

AI-created panels use the same component model as handwritten panels:

```text
write component file -> register component -> add panel by component name
```

Agent authoring should not send panel source through extension tools. Workspace
files are the source of truth; dock panel data only references registered
component names. Host apps may provide file loaders that scan a workspace and
register components, but that loader belongs to the host app, not to Core/UI.

## Runtime Safeguards

The extension runtime may also expose safety and recovery helpers:

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

Use them only when normal registries cannot express the integration. The
default path for visible UI remains: register a component, then add panel data
to a dock.

## Recovery

Extensions may be disabled by prefix. This keeps recovery simple:

```js
aeditor.extensions.disable('sample')
```

Internally that means the runtime stops loading names under `sample.` and
unregisters the same prefix from every contributed registry.
