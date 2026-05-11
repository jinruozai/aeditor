# UI cleanup contract

## Problem

aeditor.ui components use a local cleanup model:

```js
el.__aeditorCleanups = [fn, fn, ...]
aeditor.ui.dispose(el)
```

This is a good zero-dependency pattern, but it is only reliable if every component and composite component follows it.

Current gaps:

- Some helpers create `aeditor.effect()` without `ui.collect()`.
- Some composite components append child aeditor.ui components without disposing them.
- Virtualized rows are removed instead of disposed.
- Overlay content is unmounted but not always disposed.
- Registered panel components return aeditor.ui components but do not expose `dispose`.

## Target rule

Every aeditor.ui component must obey this invariant:

> If an aeditor.ui component creates an effect, derived signal, DOM event listener, timer, overlay, portal, or child aeditor.ui component, disposing the component root with `aeditor.ui.dispose(root)` must release it.

## Implementation rules

### Effects

Bad:

```js
aeditor.effect(function () { ... })
```

Good:

```js
ui.collect(root, aeditor.effect(function () { ... }))
```

If the effect belongs to a child control, collect it on the child root or collect child disposal on the parent.

### Derived signals

Bad:

```js
const value = aeditor.derived(...)
```

Good:

```js
const value = aeditor.derived(...)
ui.collect(root, value.dispose)
```

### Child aeditor.ui components

If a parent creates a child component:

```js
const child = ui.input(...)
parent.appendChild(child)
```

the parent must either:

- call `ui.dispose(child)` when replacing/removing it, or
- collect it:

```js
ui.collect(parent, function () { ui.dispose(child) })
```

### Virtualized rows

When a row leaves the viewport:

- dispose it if it will not be reused
- if using a template pool, define a template lifecycle:
  - `create`
  - `update`
  - `reset`
  - `dispose`

Do not keep pooled rows with live subscriptions to old row data.

### Overlay content

When popover/modal/drawer/menu closes:

- close overlay controller frame
- unmount portal/backdrop
- dispose content if the component created or owns that content

If the caller passes a DOM node it owns, document whether overlay owns disposal. The simplest stable policy:

> Overlay owns the wrapper it creates. Caller owns passed content unless `disposeContent: true` is provided.

For built-in demos and built-in panels, prefer owned content with disposal.

## Files to audit first

High priority:

- `src/ui/_internal/_box-style.js`
- `src/ui/_internal/_text-style.js`
- `src/ui/_internal/_render-tree.js`
- `src/ui/form/editorFor.js`
- `src/ui/form/propertyPanel.js`
- `src/ui/data/list.js`
- `src/ui/data/tree.js`
- `src/ui/data/table.js`
- `src/ui/base/popover.js`
- `src/ui/overlay/modal.js`
- `src/ui/overlay/drawer.js`
- `src/ui/panel/dock-tabs.js`
- `src/ui/panel/log.js`

Second pass:

- `src/ui/editor/assetPicker.js`
- `src/ui/editor/gradientInput.js`
- `src/ui/editor/curveInput.js`
- `src/ui/form/arrayInput.js`
- `src/ui/form/structInput.js`
- `src/ui/form/select.js`
- `src/ui/form/combobox.js`
- `src/ui/overlay/menu.js`
- `src/ui/overlay/searchMenu.js`

## API consistency pass

Known schema/API drifts:

- `_register-builtins` exposes `disabled` for `numberInput`, `slider`, and `colorInput`, but implementations do not consistently honor it.
- Check every registered schema field against implementation behavior.

Acceptance:

- every schema prop either works or is removed from the schema
- every component has a short contract in comments only where needed

## Accessibility pass

Priority order:

1. `select`: listbox semantics, `aria-haspopup`, `aria-expanded`, active option, keyboard navigation.
2. `list`: `role=listbox`, options, `aria-selected`, focus and keyboard selection.
3. `table`: table/grid roles, row/cell semantics.
4. `tree`: keep existing keyboard support, review whether ESC clear-selection should become configurable.

Keyboard rule:

- component-internal semantic keys are allowed
- application-level decisions remain caller-owned

The tree ESC behavior should be reviewed under this rule.

## Token cleanup pass

Keep algorithmic colors where appropriate:

- HSV hue strip
- transparent black/white mix where it is truly visual math

Move reusable visual constants into `theme.css`:

- non-semantic shadow colors
- text shadows
- fixed white foregrounds
- hard-coded accent-like colors

## Acceptance criteria

- Running a repeated create/destroy smoke with representative aeditor.ui components leaves no active component effects.
- Virtualized list/tree scrolling through thousands of rows does not grow active cleanup/effect counts indefinitely.
- Opening/closing popover, modal, drawer, menu, and toast repeatedly does not leave portal children.
- Registered built-in panel components can rely on runtime default `aeditor.ui.dispose` fallback or have explicit dispose definitions.
