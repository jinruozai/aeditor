# Bus, context, and error attribution

## Design intent

Panel communication should be decoupled:

- no panel holds another panel's object reference
- no toolbar component gets private tab privileges
- no app-level singleton is required for basic panel coordination
- event-style communication goes through `aeditor.bus`
- state-style communication goes through signals or serialized props

This design is correct. The hardening work is about making it diagnosable and leak-free.

## Current gaps

- `ctx.bus.on(topic, handler)` auto-unsubscribes, but bus handler errors are attributed only to `{ scope: 'bus', topic }`.
- `ctx.dock.*` and `ctx.panel.*` derived signals are not registered for disposal.
- Documentation still references `aeditor.errors` while implementation uses `aeditor.log`.
- Some AGENTS sections mention system topics that are not implemented.

## Scoped bus target

Keep the raw global API:

```js
aeditor.bus.on(topic, handler)
aeditor.bus.off(topic, handler)
aeditor.bus.emit(topic, payload)
```

Raw `aeditor.bus` stays simple and has no owner context.

For `ctx.bus.on`, register a wrapper that captures subscriber source:

```js
ctx.bus.on('selection:changed', function (payload) {
  ...
})
```

If the handler throws, the log entry should include:

```js
{
  scope: 'bus',
  topic: 'selection:changed',
  subscriber: {
    component,
    dockId,
    panelId
  }
}
```

Implementation options:

1. Keep `aeditor.bus` unchanged. `ctx.bus.on` wraps the handler with `ctx.safeCall`.
2. Extend `aeditor.bus.on(topic, handler, source)` internally but keep public docs focused on the two-argument form.

Option 1 is lower risk and preserves global bus simplicity.

## System topic decision

AGENTS currently mentions system topics such as:

- `aeditor:panel:activated`
- `aeditor:panel:removed`
- `aeditor:panel:moved`
- `aeditor:dock:focus-changed`
- `aeditor:errors:new`

Before implementing or documenting these, decide:

- Are these part of the stable framework contract?
- Are they necessary when signal APIs already expose dock and panel state?
- Should they be emitted for every tree mutation, including `setTree()`?

Recommendation:

- Do not add system topics until there is a clear use case.
- Remove stale promises from design authority docs for now.
- Keep `aeditor.bus` as user/app communication infrastructure.

## Error API decision

Current implementation:

- `aeditor.log`
- `aeditor.log.push(level, source, message, error)`
- `aeditor.log.dismiss(id)`
- `aeditor.log.clear()`
- `aeditor.reportError(source, err)`
- `aeditor.safeCall(source, fn)`
- built-in panel component registered as `log`

Stale design references:

- `aeditor.errors`
- `aeditor.clearErrors()`
- `aeditor.dismissError()`
- `error-log`

Recommended direction:

- Keep `aeditor.log` as the more general primitive.
- Document `aeditor.reportError` and `aeditor.safeCall` as error-specific helpers.
- If compatibility aliases are desired, add them deliberately:
  - `aeditor.errors = aeditor.derived(() => aeditor.log().filter(e => e.level === 'error'))`
  - `aeditor.clearErrors()` removes only error entries or clears all? This ambiguity makes alias risky.

Recommendation: update docs to `aeditor.log` instead of adding ambiguous aliases.

## Context lifetime target

Every context should be a disposable scope.

Runtime already has:

```js
runtime.cleanups = []
```

Make context-created resources join that scope:

- derived signals
- bus subscriptions
- context helper effects, if any in future

Acceptance:

- Disposing a component runtime removes all subscriptions from `layout.treeSig`.
- Moving a panel across docks updates context dock signals without creating new contexts.
- Disposing a moved panel still releases its original context-derived signals.

## Files likely affected

- `src/core/context.js`
- `src/core/bus.js`
- `src/core/log.js`
- `src/ui/panel/log.js`
- `AGENTS.md`
- `README.md`
- `dist/aeditor.js`

## Tests

Minimum tests:

- bus handler A throws, handler B still runs
- handler registered through `ctx.bus` logs subscriber panel/dock/component
- manual disposer returned by `ctx.bus.on` removes itself from runtime cleanups
- disposing panel removes ctx bus subscription
- disposing panel releases ctx derived subscriptions
