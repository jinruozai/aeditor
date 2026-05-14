# Current Architecture Notes

This file records intentional implementation details that look like drift during
review but are part of the current design. It should stay short. If an item is a
real defect, fix the code or move the plan into a focused design document.

## AI Registries

The public AI registry shape is:

```js
aeditor.ai.tools.register(name, spec)
aeditor.ai.context.register(name, spec)
aeditor.ai.operations.register(name, spec)
```

Attachments are runtime chat state, not a registry:

```js
aeditor.ai.attachments
aeditor.ai.addAttachment(spec)
aeditor.ai.removeAttachment(id)
```

Readable URI/kind/meta pointers resolve through `aeditor.ai.references`.

## Project Runtime

AEditor framework has no built-in project model.

The file-backed project loader is demo behavior:

```js
Demo.project
demo.project.*
```

It intentionally lives under `demo/`, not `src/`.

## Metadata

Dotted prefixes are the public namespace for registries. Metadata such as
`owner` and `layer` remains available for diagnostics, palette filtering,
permission review, and extension safety policy. Extension cleanup should prefer
`unregisterOwner(owner)` because owner identity is exact even when public names
share dotted prefixes.

## Extensions

Extensions package existing registries. The extension runtime also owns safety
policy around install review, layers, storage, trusted code components, iframe
panels, and recovery UI. These are safeguards around registry contributions, not
a second component or AI model.

The implementation lives under `src/extensions/`. Do not add extension policy
to Core; Core exposes only the registries and primitive services Extension
Runtime packages.

## ChangeSet

`aeditor.changeSet` is review infrastructure for grouped changes. It complements
operations; it is not a fourth AI registry.

## AI Runtime

The AI runtime intentionally handles queues, quests, inbox continuations,
approval waiting, tool-result message ordering, live run state, persistence, and
semantic compaction. These are runtime correctness mechanisms, not optional
application behavior.
