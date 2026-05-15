# AEditor Skills

This directory stores copyable AI skills for agents that need to work inside
AEditor projects or host apps.

The framework also ships a runtime skill named `aeditor.authoring` in
`src/ai/skills.js`. That built-in skill is loaded by `aeditor-ai` and
`aeditor-full`, and can be attached to AEditor agents through
`agent.skillRefs`.

Use the document form when an external AI system, a host app, or a project
workspace needs the same guidance outside the bundled runtime.

- [aeditor-authoring/SKILL.md](./aeditor-authoring/SKILL.md): build, modify,
  mount, and review AEditor components, panels, dock layouts, Inspector
  providers, AI contributions, and extension manifests.

Skill folders may include `references/` files. Agents should load those
references only when the current task needs the extra detail.
