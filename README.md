# editorframe

纯前端、零依赖、零构建的 **Blender 风格通用编辑器 UI 框架**。

[![npm](https://img.shields.io/npm/v/@gooooo/editorframe.svg)](https://www.npmjs.com/package/@gooooo/editorframe)
[![license](https://img.shields.io/npm/l/@gooooo/editorframe.svg)](./LICENSE)

editorframe 用一套极简统一的模型解决编辑器开发里最常见、也最容易变复杂的问题：布局、停靠、面板、工具栏、组件、属性编辑、日志、设置、AI 上下文和变更审批。开发者只需要写自己的 panel 和组件，再用 dock 把它们组织起来，就可以做数据编辑器、关卡编辑器、资源管理器、节点编辑器、调试工具、AI 辅助工作台等各种专业编辑器。

![EditorFrame screenshot](./screenshots/ScreenShot_2026-05-09_180752_282.png)

---

## 核心思想

编辑器不是一堆特殊页面，而是同一个结构的不同组合：

```text
Layout
└─ Dock
   ├─ Toolbar
   │  └─ toolbar component
   └─ Panel
      └─ component
```

- **Dock** 是可分裂、合并、拖拽调整、接收 panel 的矩形容器。
- **Panel** 是编辑器里的一个工作单元，例如表格、属性面板、资源浏览器、日志、AI 对话。
- **Component** 是真正渲染 UI 的函数，panel 内容、toolbar 按钮、tab 栏本质上都是 component。
- **Toolbar 没有特权组件**，tab 栏、按钮、菜单都走同一套 component 注册机制。
- **非 active panel 从 DOM detach**，不是 `display:none`，所以多标签编辑器可以保持状态又避免后台面板参与 layout/paint。
- **所有结构都是 JSON 可序列化的 tree**，方便保存、恢复、跨窗口迁移，也方便 AI 理解和修改。

这套设计的目标是：少概念、少例外、组合能力强。复杂编辑器不是靠堆特殊代码做出来，而是由 dock、panel、component、signal、bus 这几件事稳定组合出来。

---

## 适合做什么

- 多标签代码/文本/数据编辑器
- 游戏数据、关卡、资源、配置编辑器
- 类 Blender / Godot / VS Code 的 dock 工作台
- 内部工具、运营后台、调试面板、可视化工具
- 带 AI 助手的编辑器，让 AI 读取局部上下文、生成变更、等待用户审批后应用

editorframe 只负责通用编辑器框架，不绑定任何业务数据结构。业务层只需要注册自己的 panel、数据组件、AI tool 和上下文 provider。

---

## 特性

- **零构建**：直接 `<script>` 引入，`file://` 双击也能跑。
- **零依赖**：不用 React、Vue、npm runtime 或打包工具。
- **单命名空间**：所有 API 都在 `window.EF` 下。
- **Blender 风格 dock**：分裂、合并、拖动 tab、弹出窗口、focus mode、折叠 dock。
- **统一组件注册**：panel、toolbar、tab、内置 UI 都是同一种 component。
- **50+ 内置 UI 组件**：form、data、overlay、container、property editor、change review。
- **响应式 signal**：轻量 signal/effect/batch/onCleanup，不引入框架。
- **跨面板 bus**：panel 之间解耦通信，dispose 时自动退订。
- **主题系统**：dark / dracula / light，并支持语义化 CSS token 定制。
- **AI 集成层**：agent、tool、resource、context provider、rich prompt、change set、权限审批和多 provider 连接。

---

## AI 集成

editorframe 把 AI 当作编辑器框架的一等能力，而不是业务代码里的临时接口。核心目标是让开发者可以精确地把“当前编辑器里的某一部分”发送给 AI，并让 AI 通过受控 tool 读取、预览和修改数据。

AI 层提供：

- **Agent runtime**：创建 agent、发送消息、停止任务、查看 transcript。
- **Provider 连接**：OpenAI-compatible、Anthropic、DeepSeek、Ollama、OpenRouter、Groq、Mistral、xAI、本地 bridge 等。
- **Tool 注册**：业务编辑器可以注册 `project.getSummary`、`table.updateRows`、`asset.rename` 之类的工具。
- **Resource / target**：把当前选中的对象、文件、图片、表格行、节点树片段作为可引用资源插入 prompt。
- **Context provider**：按当前 agent、当前 panel、当前 selection 自动捕获上下文。
- **ChangeSet**：AI 生成的修改先变成可审查的 change set，用户 Apply / Reject 后才落地。
- **权限模型**：read / write / manage / send 等操作可以按 agent 和资源控制，也支持 Always allow。

示意：

```js
EF.ai.registerTool('game.table.createEntity', {
  title: 'Create Entity',
  description: 'Create one entity in a game data table.',
  schema: {
    table: 'string',
    entity: 'object',
  },
  run: function (args, ctx) {
    // 读取当前项目状态，返回预览或直接执行安全读操作
  },
  apply: function (args, ctx) {
    // 用户批准后真正写入
  },
})

EF.ai.registerContextProvider('current-selection', {
  capture: function (target, event, ctx) {
    return {
      panel: 'inspector',
      selection: window.currentSelectionSnapshot(),
    }
  },
})
```

这样 AI 不需要猜整个应用状态，也不需要硬编码业务逻辑。编辑器告诉 AI：你能看什么、能调用什么、哪些变更需要审批。

---

## 安装

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.js"></script>
```

```bash
npm install @gooooo/editorframe
```

加载后所有 API 挂在 `window.EF` 下。

---

## 快速开始

注册一个 component：

```js
EF.registerComponent('my-editor', {
  factory: function (propsSig, ctx) {
    var props = propsSig.peek() || {}
    var el = document.createElement('div')
    el.style.padding = '16px'
    el.textContent = 'Editing: ' + (props.file || 'untitled')
    return el
  },
})
```

创建 dock 布局：

```js
var layout = EF.createDockLayout(document.getElementById('app'), {
  tree: EF.split('horizontal', [
    EF.dock({
      toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
      panels: [
        EF.panel({ component: 'my-editor', title: 'main.js', props: { file: 'main.js' } }),
        EF.panel({ component: 'my-editor', title: 'style.css', props: { file: 'style.css' } }),
      ],
    }),
    EF.dock({
      toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
      panels: [
        EF.panel({ component: 'log', title: 'Log', icon: 'list' }),
      ],
    }),
  ], [0.65, 0.35]),
})
```

完成。你已经有了一个双栏、多标签、可拖拽分割、可继续扩展的编辑器。

---

## Component

Component 是 editorframe 的最小扩展单元。注册后，它可以作为 panel 内容，也可以作为 toolbar item。

```js
EF.registerComponent('my-component', {
  factory: function (propsSig, ctx) {
    var props = propsSig.peek() || {}
    var el = document.createElement('div')
    return el
  },

  defaults: function () {
    return { title: 'My Component', icon: 'box', props: {} }
  },

  dispose: function (el) {
    // 清理订阅、timer、WebSocket、Worker 等资源
  },

  serialize: function (el) {
    return { scrollTop: el.scrollTop }
  },

  deserialize: function (el, state) {
    el.scrollTop = state.scrollTop || 0
  },
})
```

`props` 必须是 JSON 可序列化的 plain object。需要跨 panel 通信时，用 `ctx.bus`；需要编辑器状态时，用 signal 或 context provider。

---

## ctx

每个 component 的 `factory(propsSig, ctx)` 都会收到统一上下文。

```js
ctx.panel.title()
ctx.panel.setTitle('New Title')
ctx.panel.setDirty(true)
ctx.panel.updateProps({ file: 'b.js' })
ctx.panel.close()
ctx.panel.popOut()
ctx.panel.promote()

ctx.dock.panels()
ctx.dock.activeId()
ctx.dock.addPanel({ component: 'editor', title: 'New' })
ctx.dock.activatePanel(panelId)
ctx.dock.toggleFocus()

ctx.bus.emit('file:saved', { path: '/main.js' })
ctx.bus.on('file:saved', function (data) {})

ctx.active
ctx.onCleanup(function () {})
```

Static toolbar component 没有 `ctx.panel`，但有 `ctx.dock`。这让 tab 栏、侧边栏按钮、dock 菜单都可以用同一套响应式上下文实现。

---

## Dock 模式

多标签编辑区：

```js
EF.dock({
  toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
  panels: [
    EF.panel({ component: 'editor', title: 'main.js' }),
    EF.panel({ component: 'editor', title: 'style.css' }),
  ],
})
```

侧边栏：

```js
EF.dock({
  toolbar: { direction: 'left', items: [{ component: 'tab-collapsible' }] },
  panels: [
    EF.panel({ component: 'file-tree', title: 'Files', icon: 'folder' }),
    EF.panel({ component: 'search', title: 'Search', icon: 'search' }),
    EF.panel({ component: 'settings', title: 'Settings', icon: 'settings' }),
  ],
})
```

固定 inspector：

```js
EF.dock({
  panels: [
    EF.panel({ component: 'inspector', title: 'Inspector' }),
  ],
})
```

预览 panel：

```js
layout.addPanel('editor-dock', {
  component: 'editor',
  title: 'preview.js',
  props: { file: 'preview.js' },
}, { transient: true })

ctx.panel.promote()
```

---

## 内置 UI

`EF.ui.*` 提供 50+ 组件，统一基于 caller-owned signal：

```js
var name = EF.signal('world')
var input = EF.ui.input({ value: name, placeholder: 'Name' })
var button = EF.ui.button({
  label: 'Greet',
  onClick: function () { alert('Hello ' + name()) },
})
```

- **Base**：button / iconButton / icon / tooltip / popover / badge / tag / spinner / divider
- **Form**：input / textarea / numberInput / vectorInput / slider / checkbox / switch / select / combobox / colorInput / dateInput / enumInput / tagInput
- **Editor**：gradientInput / curveInput / codeInput / pathInput / fileInput / assetPicker
- **Container**：section / propRow / card / scrollArea / tabPanel
- **Data**：list / tree / table / breadcrumbs / progressBar
- **Overlay**：menu / modal / drawer / alert / toast
- **Schema-driven**：propertyEditor / propertyPanel / TypeConfig / renderer registry
- **AI**：chat、agents、transcript、changeReview、rich prompt resources

---

## Runtime API

`createDockLayout` 返回 layout handle：

```js
layout.addPanel(dockId, { component: 'editor', title: 'New' })
layout.removePanel(panelId)
layout.activatePanel(panelId)
layout.movePanel(panelId, targetDockId)
layout.promotePanel(panelId)
layout.splitDock(dockId, 'horizontal', 'after', 0.5)
layout.mergeDocks(winnerId, loserId)
layout.tree()
layout.setTree(nextTree)
layout.subscribe(function (tree) {})
```

也可以直接用不可变纯函数操作 tree：

```js
EF.addPanel(tree, dockId, partial, opts)
EF.removePanel(tree, panelId)
EF.activatePanel(tree, panelId)
EF.movePanel(tree, panelId, dstDockId)
EF.updatePanel(tree, panelId, patch)
EF.splitDock(tree, dockId, dir, side, ratio, opts)
EF.mergeDocks(tree, winnerId, loserId)
```

---

## 主题

内置 `dark`、`dracula`、`light` 三套主题。

```js
EF.theme.set('dark')
EF.theme.set('dracula')
EF.theme.set('light')
```

自定义主题优先改语义 token：

```css
:root {
  --ef-surface-panel: #1f2329;
  --ef-surface-field: #171a20;
  --ef-text-primary: #f3f6fb;
  --ef-text-muted: #8b95a5;
  --ef-brand: #569eff;
  --ef-state-danger: #ff5c5c;
  --ef-r-2: 8px;
}
```

---

## 本地开发

```bash
git clone https://gitee.com/lazygoo/editor-frame.git
cd editor-frame
node tools/build.mjs --watch
npx http-server -p 5570
```

浏览器访问 `http://localhost:5570`。`src/` 改动后需要重新生成 `dist/ef.js` 和 `dist/ef.css`；`demo/` 下文件直接刷新即可。

检查：

```bash
npm run check
npm run check:dist
```

---

## 许可

[MIT](./LICENSE) © gooooo

---

## 更多

- [`AGENTS.md`](./AGENTS.md) — 架构设计、数据模型和项目约束
- [`doc/editor_style.html`](https://gitee.com/lazygoo/editor-frame/blob/master/doc/editor_style.html) — 视觉调色板参考
- [`index.html`](https://gitee.com/lazygoo/editor-frame/blob/master/index.html) — 组件浏览器 demo
