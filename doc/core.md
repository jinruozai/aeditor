# Core

Core is the generic infrastructure layer. It must stay independent of domain
models and AI provider details.

## Public Areas

```text
aeditor.signal
aeditor.effect
aeditor.derived
aeditor.batch
aeditor.untracked
aeditor.onCleanup

aeditor.log
aeditor.reportError
aeditor.safeCall

aeditor.bus
aeditor.history
aeditor.theme
aeditor.i18n
aeditor.settings
aeditor.commands
aeditor.shortcuts
aeditor.workspace
```

## Signals

Signals are the base reactivity primitive.

Implemented abilities:

- `signal(initial)`
- `effect(fn)`
- `derived(fn)`
- `batch(fn)`
- `untracked(fn)`
- `onCleanup(fn)`

Design rule: signals are framework infrastructure, not domain state policy.

## Log And Safe Calls

`aeditor.log` is the shared log stream. `reportError` and `safeCall` isolate
component and plugin errors so one failing panel does not take down the shell.

Design rule: only user-code boundaries need safe wrapping. Internal framework
contracts should stay simple and fail clearly.

## Bus

`aeditor.bus` is the decoupled communication path between panels and domain
code.

It provides:

```js
aeditor.bus.on(topic, handler)
aeditor.bus.off(topic, handler)
aeditor.bus.emit(topic, payload)
```

Component contexts should use bus subscriptions that are cleaned up with the
component lifecycle.

## History

`aeditor.history.create(options)` creates a generic undo/redo timeline.

Implemented abilities:

- capture and apply snapshots
- push and replace entries
- jump, undo, redo
- pause recording
- begin, commit, cancel transactions
- record a function as one transaction

History is generic infrastructure. Domain history such as table edits, timeline
keys, scene objects, or generated code must adapt their snapshots into this
generic history surface.

## Settings

`aeditor.settings` stores setting sections, schemas, custom pages, values, and
persistence.

Implemented abilities:

```js
aeditor.settings.registerSection(id, spec, meta)
aeditor.settings.registerSchema(key, schema, meta)
aeditor.settings.registerPage(id, spec, meta)
aeditor.settings.unregisterOwner(owner)
aeditor.settings.sectionMeta(id)
aeditor.settings.schemaMeta(key)
aeditor.settings.pageMeta(id)
aeditor.settings.get(key)
aeditor.settings.set(key, value)
aeditor.settings.reset(key)
aeditor.settings.resetSection(sectionId)
aeditor.settings.exportValues()
aeditor.settings.importValues(values)
aeditor.settings.configurePersistence(options)
aeditor.settings.save()
aeditor.settings.clearStoredValues()
aeditor.settings.resolveOptions(definition, context)
```

Settings are framework-level configuration infrastructure. Domain-specific
settings belong under domain prefixes.

## Commands And Menus

`aeditor.commands` is a generic command registry and menu contribution surface.

Implemented abilities:

```js
aeditor.commands.register(id, spec, meta)
aeditor.commands.unregister(id, meta)
aeditor.commands.unregisterOwner(owner)
aeditor.commands.get(id)
aeditor.commands.list(filter)
aeditor.commands.run(id, input, context)
aeditor.commands.registerMenu(id, spec, meta)
aeditor.commands.unregisterMenu(id, meta)
aeditor.commands.listMenus(filter)
aeditor.commands.menuItems(target)
aeditor.commands.menuUiItems(target)
aeditor.commands.meta(id)
aeditor.commands.menuMeta(id)
```

Commands are named with dotted paths. Domain-specific commands should use domain
prefixes.

Commands are for humans and UI. Tools are for AI/model calls. If one action must
serve both callers, expose it through both registries and keep the caller-facing
policy separate.

## Shortcuts

`aeditor.shortcuts` exists as infrastructure, but framework code must not hard
code domain-level shortcuts.

## Theme And I18n

`aeditor.theme` owns theme mode and token application. UI components should read
semantic CSS tokens instead of domain colors.

`aeditor.i18n` owns language selection and string lookup. It is framework
infrastructure; dictionaries are provided outside Core.

## Workspace

`aeditor.workspace` is documented in [workspace.md](./workspace.md). It is part
of Core because it only defines bounded file access, not a project model.

## Current Metadata Note

Some current registries still accept metadata such as `owner` and `layer`.
The final design should prefer dotted prefixes for lifecycle and grouping. See
[current-gaps.md](./current-gaps.md).
