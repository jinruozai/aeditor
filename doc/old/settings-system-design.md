# Aiditor Settings System

Status: final framework design.

## 1. Goal

Aiditor provides a standard settings panel that applications and plugins can extend without rebuilding settings UI.

The system has two layers:

- schema settings for common key/value configuration
- custom settings pages for complex UI

Most integrations should use schema settings. Custom pages are reserved for settings that need bespoke layout or behavior.

## 2. Main Ideas

Settings are not business state. They are editor/application configuration.

The framework owns:

- registry
- value store
- default handling
- standard settings panel
- schema renderer
- page lifecycle

Applications and plugins contribute:

- sections
- schema fields
- optional custom pages

## 3. Comparison With Mature Editors

The design combines the strongest parts of common editor systems:

- VS Code style schema contribution: normal settings are declared and rendered automatically.
- JetBrains/Eclipse style configurable pages: complex settings can register a lazily mounted custom page.
- Godot style slash/path setting keys: keys remain stable, searchable, and easy to group.

## 4. Public Model

```js
aiditor.settings.sections      // signal<Section[]>
aiditor.settings.schemas       // signal<SchemaItem[]>
aiditor.settings.pages         // signal<Page[]>
aiditor.settings.values        // signal<object>
```

Section:

```js
{
  id,
  title,
  icon,
  order
}
```

Schema item:

```js
{
  key,              // "ai.openai.apiKey"
  section,          // "ai"
  label,
  type,             // "string" | "password" | "text" | "number" | "int" | "bool" | "select" | "color"
  default,
  scope,            // "global" | "workspace" | "project" | "agent"
  description,
  options,
  sensitive,
  order
}
```

Page:

```js
{
  id,
  section,
  title,
  icon,
  order,
  factory(ctx) => HTMLElement
}
```

## 5. API

```js
aiditor.settings.registerSection(id, spec)
aiditor.settings.registerSchema(sectionId, schema)
aiditor.settings.registerPage(id, spec)

aiditor.settings.get(key)
aiditor.settings.set(key, value)
aiditor.settings.reset(key)
aiditor.settings.resetSection(sectionId)
aiditor.settings.exportValues()
aiditor.settings.importValues(values)
```

`registerSchema` accepts a single item or an array.

## 6. Rendering Rule

The standard `settings` panel renders navigation on the left and content on the right.

If a section has schema settings, the framework renders a generated schema page.

If a custom page is registered, the panel mounts it lazily when selected.

Page factories receive:

```js
{
  settings: aiditor.settings,
  section,
  page
}
```

The panel disposes the previous page before mounting the next page.

## 7. Built-In Sections

Framework built-ins:

- `theme`
- `ai`

Theme includes:

- theme mode

AI includes:

- default provider
- provider schema settings

## 8. AI Provider Settings

Providers can contribute settings through their registration spec:

```js
aiditor.ai.registerProvider("openai", {
  name: "OpenAI",
  models: ["gpt-5.5"],
  settings: [
    { key: "ai.openai.apiKey", type: "password", sensitive: true },
    { key: "ai.openai.baseURL", type: "string" }
  ],
  send(request, ctx) {}
})
```

The settings system renders these under the AI section.

Provider runtime reads settings through:

```js
aiditor.settings.get("ai.openai.apiKey")
```

## 9. Persistence

The framework store is runtime-only by default.

Applications may persist settings by observing `aiditor.settings.values` and writing to localStorage, IndexedDB, project files, or host APIs.

The framework should not force a persistence backend.

## 10. Design Rules

- Use schema settings for normal fields.
- Use custom pages only when schema rendering is not enough.
- Settings panel must use existing `aiditor.ui` components.
- Setting keys are stable API.
- Plugin settings must live under plugin/provider namespaces.
- Sensitive values are marked in schema but storage/encryption is a host concern.
