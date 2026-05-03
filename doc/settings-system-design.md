# EditorFrame Settings System

Status: final framework design.

## 1. Goal

EditorFrame provides a standard settings panel that applications and plugins can extend without rebuilding settings UI.

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
EF.settings.sections      // signal<Section[]>
EF.settings.schemas       // signal<SchemaItem[]>
EF.settings.pages         // signal<Page[]>
EF.settings.values        // signal<object>
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
EF.settings.registerSection(id, spec)
EF.settings.registerSchema(sectionId, schema)
EF.settings.registerPage(id, spec)

EF.settings.get(key)
EF.settings.set(key, value)
EF.settings.reset(key)
EF.settings.resetSection(sectionId)
EF.settings.exportValues()
EF.settings.importValues(values)
```

`registerSchema` accepts a single item or an array.

## 6. Rendering Rule

The standard `settings` panel renders navigation on the left and content on the right.

If a section has schema settings, the framework renders a generated schema page.

If a custom page is registered, the panel mounts it lazily when selected.

Page factories receive:

```js
{
  settings: EF.settings,
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
EF.ai.registerProvider("openai", {
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
EF.settings.get("ai.openai.apiKey")
```

## 9. Persistence

The framework store is runtime-only by default.

Applications may persist settings by observing `EF.settings.values` and writing to localStorage, IndexedDB, project files, or host APIs.

The framework should not force a persistence backend.

## 10. Design Rules

- Use schema settings for normal fields.
- Use custom pages only when schema rendering is not enough.
- Settings panel must use existing `EF.ui` components.
- Setting keys are stable API.
- Plugin settings must live under plugin/provider namespaces.
- Sensitive values are marked in schema but storage/encryption is a host concern.
