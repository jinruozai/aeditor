# Documentation, package, and project boundaries

## Problem

The project currently has several overlapping sources of truth:

- `AGENTS.md` says it is the unique design authority.
- `CLAUDE.md` appears to duplicate AGENTS content.
- `README.md` points readers to `CLAUDE.md` for full architecture.
- `package.json.files` includes `CLAUDE.md` but not `AGENTS.md`, `doc/`, `index.html`, or `demo/`.
- `AGENTS.md` still contains stale references to `src/core/errors.js`, `aeditor.errors`, and `error-log`.
- `temp/GameDataEditor` is tracked as a reference project but lives under a directory named `temp`.

This creates confusion for future Codex sessions, npm users, and framework maintainers.

## Target authority chain

Recommended:

1. `AGENTS.md`: Codex handoff and current design authority for development.
2. `README.md`: public user-facing quickstart and stable API guide.
3. `doc/architecture/*.md`: stable architecture documentation extracted from AGENTS after cleanup.
4. `doc/plan/*.md`: future work and migration plans.
5. `CLAUDE.md`: either removed from package scope or explicitly generated/duplicated from AGENTS for Claude compatibility.

Do not leave two competing full architecture authorities.

## AGENTS cleanup

Required updates:

- Replace stale `aeditor.errors` references with `aeditor.log`, or explicitly decide to add compatibility aliases.
- Replace `error-log` with registered component `log`, unless `error-log` alias is intentionally added.
- Remove old phase snippets that mention `src/core/errors.js`.
- Keep `tools/build.mjs` as the single source of bundle order.
- Update testing philosophy: no heavy framework required, but zero-dependency checks are now expected.
- Clarify `temp/GameDataEditor` boundary.

## README cleanup

README should be split by audience:

- short concept
- install
- quickstart
- component registration
- dock configuration
- runtime API
- UI library
- themes
- local development
- links

Links must work in the npm package or be clearly repository links.

If npm package does not include `doc/` and `index.html`, README should link to repository URLs instead of relative files for those sections.

## Package boundary decision

Choose one:

### Option A: runtime-first package

Publish:

- `dist`
- `README.md`
- `LICENSE`

Pros:

- smallest package
- clearest drop-in story

Cons:

- source not included
- users cannot inspect build inputs from npm

### Option B: source-auditable package

Publish:

- `dist`
- `src`
- `tools`
- `README.md`
- `LICENSE`
- selected `doc/architecture`

Pros:

- users can audit source
- build script explains dist

Cons:

- package larger
- docs must be curated and stable

Recommendation:

Use Option B. This project benefits from source transparency, and the bundle is a concatenation rather than a compiled artifact.

Package should still exclude:

- `demo`
- `index.html`
- `doc/plan`
- `temp`
- screenshots
- local launch config

## temp/GameDataEditor boundary

User decision recorded:

> `temp/GameDataEditor` is an actual project built with this framework. It lives inside the repository only for Codex convenience. It should remain fully decoupled from the framework.

Recommended policy:

- Treat it as an external consumer.
- Do not import from `temp/` in `src/`.
- Do not let framework APIs depend on GameDataEditor needs unless generalized.
- Use it as an integration reference after framework changes.
- Keep it out of npm package.

Open decision:

- Keep tracked under `temp/GameDataEditor`, or move to `examples/GameDataEditor`.

Recommendation:

- Short term: keep in `temp/`, document the boundary clearly.
- Later: move to `examples/GameDataEditor` only if it becomes a maintained public example.

## Demo boundary

Current boundary is healthy:

- `index.html` loads `dist/aeditor.js` first
- `demo/` consumes `aeditor`
- `src/` does not reference `Demo`

Keep this invariant.

## Acceptance criteria

- A new maintainer can identify the current design authority in under one minute.
- README links do not break in npm context.
- AGENTS no longer describes APIs that do not exist.
- `package.json.files` matches the chosen package strategy.
- `.gitignore` comments describe `temp/GameDataEditor` honestly.
- No framework source imports or references `temp` or `GameDataEditor`.
