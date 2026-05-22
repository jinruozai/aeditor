# Resource Versioning

## Goal

Any previewed mutation must be tied to the version of the resource it inspected.
Apply is compare-and-set. If the resource changed, the stale preview is rejected
and the agent or UI must re-preview or rebase.

This document defines the architecture contract for mutable resources. Current
implementation coverage is strongest for workspace files; other subsystems
should follow this contract as their preview/apply surfaces become versioned.

## ResourceVersion

Different resources use different version tokens, but the contract is the same:

| Resource | Version |
| --- | --- |
| Workspace file | content hash |
| Workspace path operation | source file content hash when available |
| Dock layout tree | layout revision |
| Settings record | settings version |
| Extension registry | registry generation |
| Agent message log | message log revision |
| ChangeSet | ChangeSet revision |

The version token is opaque to callers. It only needs equality comparison.

For workspace files, text writes use `hashText(...)` and blob snapshots use the
workspace blob/hash helpers. Directory operations such as `mkdir` may not have a
source hash; `copy`, `move`, and recursive delete carry the source file hash
when the source is a file. Backends that can version directories may include a
directory hash, but Core does not require one.

## Preview / Apply Contract

```text
preview(resource@versionA, input) -> proposal(baseVersion: versionA)
apply(proposal, currentVersion: versionA) -> commit(resultVersion: versionB)
apply(proposal, currentVersion: versionC) -> stale, reject
```

Apply should never silently merge stale state. A host may offer a rebase helper,
but rebase creates a new preview with a new base version.

## Multi-Agent Rule

Multiple agents may work at once, but they cannot commit stale previews. This is
the concurrency boundary for files, layout, settings, and extension registries.

The runtime should surface stale failures as normal recoverable tool/operation
results, not as broken conversations.

## ChangeSet Rule

A ChangeSet stores the base version for every item it contains. Applying a
ChangeSet validates all base versions first. If any item is stale, the ChangeSet
does not partially apply unless the host explicitly offers a per-item apply UI.
