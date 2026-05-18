# AEditor Skills

This directory stores copyable AI skills for agents that need to work inside
AEditor projects, live AEditor editor runtimes, or host apps.

The framework also ships runtime skills in `src/ai/skills.js`. They are loaded
by `aeditor-ai` and `aeditor-full`, and can be attached to AEditor agents
through `agent.skillRefs`.

Use the document form when an external AI system, a host app, or a project
workspace needs the same guidance outside the bundled runtime.

Skills teach workflow and taste. Exact API signatures are generated from
structured source comments into `doc/api`, `dist/aeditor-api.json`, and runtime
AI references. Agents should search/read those references when an API detail
matters.

Runtime discovery mirrors that split:

```text
aeditor://skills  choose the right skill
aeditor://api     read exact API signatures
```

- [aeditor-runtime-authoring/SKILL.md](./aeditor-runtime-authoring/SKILL.md):
  for agents running inside AEditor, editing workspace files and mounting or
  replacing live dock panels.
- [aeditor-library-authoring/SKILL.md](./aeditor-library-authoring/SKILL.md):
  for Codex-like agents using AEditor as a library in a repository or host app.
- [aeditor-authoring/SKILL.md](./aeditor-authoring/SKILL.md): compatibility
  umbrella with the older combined guidance.

Skill folders may include `references/` files. Agents should load those
references only when the current task needs the extra detail.
