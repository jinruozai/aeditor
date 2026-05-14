# Extension Runtime

Load this reference when the task packages AEditor capabilities as an extension.

## When To Use An Extension

Use an extension when the contribution should be reviewable, installable,
disableable, and uninstallable as a package. Use normal host source files when
the task is simply building editor UI for one app.

## Boundary

The Extension Runtime installs contributions into existing registries:

```text
components
AI tools
AI context providers
AI references
AI operations
settings
commands
menus
dock panels
```

It does not create a second component model, second tool registry, or second AI
runtime.

## Names And Owners

Extensions publish dotted public names, for example:

```text
sample.panel
sample.tool.read
sample.context.summary
```

Lifecycle cleanup uses owner metadata such as `extension:sample`. Disable or
uninstall should remove by owner, not by guessing string prefixes.

## Manifest Shape

Keep manifests declarative. A typical extension describes identity, trust,
permissions, scripts, and contributions:

```js
{
  id: 'sample',
  name: 'Sample Tools',
  version: '1.0.0',
  trust: 'reviewed',
  permissions: [
    { scope: 'workspace', action: 'read' },
  ],
  scripts: ['sample.js'],
  contributes: {
    components: [
      { name: 'sample.panel', component: 'sample.panel' },
    ],
    commands: [],
    menus: [],
    ai: {
      tools: [],
      context: [],
      references: [],
      operations: [],
      skills: [],
    },
  },
}
```

Prefer the exact shape already used by the host or repository tests if it
differs from this sketch.

## Install Flow

1. Normalize and validate manifest.
2. Review permissions and contributions.
3. Load trusted scripts.
4. Register contributions with owner metadata.
5. Place any requested dock panels by component name.
6. On disable or uninstall, unregister by owner and remove runtime placement.

Do not hide product data semantics inside the extension runtime. Domain meaning
belongs to the extension or host app.
