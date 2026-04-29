# editorframe

纯前端、零依赖、零构建的 **Blender 风格编辑器 UI 框架**。

[![npm](https://img.shields.io/npm/v/@gooooo/editorframe.svg)](https://www.npmjs.com/package/@gooooo/editorframe)
[![license](https://img.shields.io/npm/l/@gooooo/editorframe.svg)](./LICENSE)

---

## 理念

你只需要做两件事:

1. **写 component** —— 每个 component 就是一个返回 DOM 元素的函数
2. **用 dock 组织它们** —— 把 component 放进 panel,把 panel 放进 dock,编辑器就写好了

不管是多标签编辑区、侧边栏树、可折叠底部面板、弹出窗口,都是**同一个 dock + 不同配置**。

```
Layout(N 叉分割树)
 └─ Dock ×M            ← 可分裂 / 合并 / 调整大小的矩形容器
     ├─ Toolbar         ← tab 栏 + 自定义按钮(可选)
     └─ Panel ×N        ← 每个 panel 装一个 component,同一时刻只显示 active 那个
```

---

## 安装

```html
<!-- CDN（推荐） -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.css">
<script src="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.js"></script>
```

```bash
# 或 npm
npm install @gooooo/editorframe
```

加载后所有 API 挂在 `window.EF` 下。

---

## 快速上手

### 第一步：注册 component

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

### 第二步：构建布局 + 挂载

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
        EF.panel({ component: 'my-editor', title: 'readme', props: { file: 'readme.md' } }),
      ],
    }),
  ], [0.5, 0.5]),
})
```

完成。你已经有了一个双栏、多标签、可拖拽分割的编辑器。

---

## Component

Component 是编辑器里的一切内容。通过 `EF.registerComponent(name, spec)` 注册,注册后在任何 dock 里当 panel 或 toolbar 组件用。

```js
EF.registerComponent('my-component', {
  // 必需：创建 DOM 元素
  factory: function (propsSig, ctx) {
    var props = propsSig.peek() || {}
    var el = document.createElement('div')
    // props 是面板的参数（JSON 可序列化的 plain object）
    // ctx 是框架提供的上下文（见下一节）
    return el
  },

  // 可选：面板关闭时清理资源
  dispose: function (el) { /* 取消订阅 / 关 WebSocket / ... */ },

  // 可选：新建面板时的默认参数（角拖分裂时框架会调这个）
  defaults: function () { return { title: 'My Component', props: {} } },

  // 可选：跨窗口弹出时的状态序列化
  serialize: function (el) { return { scrollTop: el.scrollTop } },
  deserialize: function (el, state) { el.scrollTop = state.scrollTop },
})
```

---

## ctx —— component 的全部能力

每个 component 的 `factory(propsSig, ctx)` 都会收到 `ctx`。**不需要访问全局变量,不需要轮询,不需要手动遍历 tree** —— `ctx` 提供的全是响应式 signal,值变了自动通知。

### ctx.panel —— 面板级操作

```js
// 读（都是 signal,用 EF.effect 订阅会自动重跑）
ctx.panel.title()              // 当前标题
ctx.panel.dirty()              // 是否有未保存的修改
ctx.panel.props()              // 当前 props

// 写
ctx.panel.setTitle('new name')
ctx.panel.setDirty(true)
ctx.panel.setIcon('📄')
ctx.panel.setBadge('3')        // tab 上的小角标
ctx.panel.updateProps({ file: 'b.js' })  // 浅合并到 props（低频操作）

// 动作
ctx.panel.close()              // 关闭自己
ctx.panel.popOut()             // 弹出为独立窗口
ctx.panel.promote()            // 从预览升级为常驻（见"Transient Panel"）
```

### ctx.dock —— 所在 dock 的操作

```js
// 读（signal）
ctx.dock.id()                  // dock id
ctx.dock.panels()              // 当前 dock 的所有 PanelData[]
ctx.dock.activeId()            // 当前 active panel 的 id
ctx.dock.collapsed()           // 是否折叠
ctx.dock.focused()             // 是否全屏聚焦

// 写
ctx.dock.activatePanel(panelId)
ctx.dock.removePanel(panelId)
ctx.dock.addPanel({ component: 'xxx', title: 'New' })  // 返回 { panelId }
ctx.dock.setCollapsed(true)
ctx.dock.toggleFocus()
```

### ctx.bus —— 跨面板通讯

```js
// 发事件
ctx.bus.emit('file:saved', { path: '/main.js' })

// 订阅事件（面板关闭时自动取消订阅,不泄漏）
ctx.bus.on('file:saved', function (data) {
  console.log('Saved:', data.path)
})
```

### ctx.active / ctx.onCleanup

```js
ctx.active      // signal<boolean>：我的 DOM 是否挂载在页面上
ctx.onCleanup(fn)  // 注册清理函数,面板销毁时自动调
```

### 重要：toolbar component 也有 ctx

**toolbar 组件和 panel 组件用的是同一套 ctx**。区别只有一点：

- **Panel component** 和 **dynamic toolbar component**：`ctx.panel` + `ctx.dock` 都有
- **Static toolbar component**（写在 `dock.toolbar.items[]` 里的）：只有 `ctx.dock`，没有 `ctx.panel`

所以自定义 toolbar 组件**不需要全局变量,不需要 `requestAnimationFrame` 轮询** —— 直接用 `ctx.dock.panels()` / `ctx.dock.activeId()` / `ctx.dock.collapsed()` 等 signal,配合 `EF.effect` 自动响应变化：

```js
EF.registerComponent('my-toolbar', {
  factory: function (propsSig, ctx) {
    var el = document.createElement('div')
    // 响应式：dock 的 panels 或 activeId 变了会自动重跑
    EF.effect(function () {
      var panels = ctx.dock.panels()
      var activeId = ctx.dock.activeId()
      el.innerHTML = ''
      panels.forEach(function (p) {
        var btn = document.createElement('button')
        btn.textContent = p.icon || p.title
        if (p.id === activeId) btn.classList.add('active')
        btn.onclick = function () { ctx.dock.activatePanel(p.id) }
        el.appendChild(btn)
      })
    })
    return el
  },
})
```

---

## Dock 配置

Dock 不是一种类型，是一种配法。以下是常见的几种模式：

### 多标签编辑区（最常见）

```js
EF.dock({
  toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
  panels: [
    EF.panel({ component: 'editor', title: 'main.js' }),
    EF.panel({ component: 'editor', title: 'style.css' }),
  ],
})
```

### 侧边栏（图标切换 + 点击折叠）

```js
EF.dock({
  toolbar: {
    direction: 'left',   // 工具栏在左侧，竖向图标条
    items: [{ component: 'tab-collapsible' }],  // 点击已激活的 tab 折叠 dock
  },
  panels: [
    EF.panel({ component: 'file-tree', title: 'Files', icon: '📁' }),
    EF.panel({ component: 'search',    title: 'Search', icon: '🔍' }),
    EF.panel({ component: 'settings',  title: 'Config', icon: '⚙' }),
  ],
})
```

### 可折叠底部面板（日志、终端）

```js
EF.dock({
  toolbar: {
    direction: 'top',
    items: [{ component: 'tab-collapsible' }],  // 点 tab 折叠/展开
  },
  collapsed: true,  // 初始折叠
  panels: [
    EF.panel({ component: 'log',      title: 'Log' }),
    EF.panel({ component: 'terminal', title: 'Terminal' }),
  ],
})
```

### 固定单面板（无 tab 栏）

```js
EF.dock({
  // 不配 toolbar = 没有 tab 栏，content 区占满整个 dock
  panels: [ EF.panel({ component: 'inspector', title: 'Inspector' }) ],
})
```

### 只有工具栏的 dock（无 panel content）

```js
EF.dock({
  toolbar: { direction: 'top', items: [{ component: 'my-menubar' }] },
  // panels 为空 = content 区是空 div
})
```

---

## 内置 Tab Component

框架自带三种 tab 组件，写在 `toolbar.items` 里直接用：

| Component 名 | 效果 | 典型场景 |
|---|---|---|
| `tab-standard` | 标准 tab 栏,带关闭按钮 | 多标签编辑区 |
| `tab-compact` | 紧凑模式,单 panel 时自动隐藏 tab 栏 | 预览面板 |
| `tab-collapsible` | 点击已激活的 tab 折叠/展开整个 dock | 侧边栏、底部面板 |

Tab 不是特殊机制 —— 它就是一个普通的 toolbar component，内部订阅 `ctx.dock.panels()` 来渲染 tab 按钮。你可以写自己的 tab 组件完全替换它。

---

## Transient Panel（预览模式）

单击预览、双击固定 —— VS Code / Blender 都用的模式：

```js
// 单击文件：打开预览（tab 显示斜体，新的预览自动替换旧的）
layout.addPanel('editor-dock', {
  component: 'editor', title: 'preview.js', props: { file: 'preview.js' }
}, { transient: true })

// 双击文件（或在 component 内部）：升级为常驻
ctx.panel.promote()
```

---

## 运行时 API（LayoutHandle）

`createDockLayout` 返回一个 handle，用于在运行时操作布局：

```js
var layout = EF.createDockLayout(el, { tree: tree })

// 添加面板（返回 { panelId }）
var result = layout.addPanel(dockId, { component: 'editor', title: 'New' })

// 关闭面板
layout.removePanel(panelId)

// 激活面板
layout.activatePanel(panelId)

// 移动面板到另一个 dock
layout.movePanel(panelId, targetDockId)

// 升级 transient 为常驻
layout.promotePanel(panelId)

// 分裂 dock（返回 { newDockId, newPanelId? }）
layout.splitDock(dockId, 'horizontal', 'after', 0.5)

// 合并 dock（返回 false 表示被 dirty panel 阻止）
layout.mergeDocks(winnerId, loserId)

// 读 / 写 / 订阅 tree
layout.tree()
layout.setTree(newTree)
layout.subscribe(function (tree) { /* tree 变了 */ })
```

---

## 纯函数 API

框架也暴露了一组不可变树的纯函数，用于直接操作 tree（高级场景）：

```js
// 查询
EF.findDock(tree, dockId)        // → { node, path } | null
EF.findPanel(tree, panelId)      // → { panel, dockId, path } | null

// 写入（返回新 tree，不可变）
EF.addPanel(tree, dockId, partial, opts)  // → { tree, panelId }
EF.removePanel(tree, panelId)             // → tree
EF.activatePanel(tree, panelId)           // → tree（注意：只需 panelId,不需要 dockId）
EF.movePanel(tree, panelId, dstDockId)    // → tree
EF.updatePanel(tree, panelId, patch)      // → tree
EF.promotePanel(tree, panelId)            // → tree
EF.setCollapsed(tree, dockId, bool)       // → tree
EF.setFocused(tree, dockId, bool)         // → tree
EF.splitDock(tree, dockId, dir, side, ratio, opts)  // → { tree, newDockId, newPanelId? }
EF.mergeDocks(tree, winnerId, loserId)    // → { tree, discardedPanels }
```

> **提示**：大多数场景用 `layout.xxx()` 就够了（它内部就是调纯函数 + setTree）。只有需要在一次 batch 里做多步操作时才需要直接操作纯函数。

---

## 内置 UI 组件库

`EF.ui.*` 提供 50+ 即用组件,全部基于"调用方持有 signal"的设计：

```js
var name = EF.signal('world')
var input = EF.ui.input({ value: name, placeholder: 'Enter name' })
var btn = EF.ui.button({ label: 'Greet', onClick: function () { alert('Hello ' + name()) } })
```

**Base**: button / iconButton / icon / tooltip / popover / kbd / badge / tag / spinner / divider
**Form**: input / textarea / numberInput / vectorInput / slider / rangeSlider / checkbox / switch / radio / segmented / select / combobox / colorInput / dateInput / enumInput / tagInput / tab
**Editor**: gradientInput / curveInput / codeInput / pathInput / fileInput / assetPicker
**Container**: section / propRow / card / scrollArea / tabPanel
**Data**（虚拟化）: list / tree / table / breadcrumbs / progressBar
**Overlay**: menu / modal / drawer / alert / toast
**Schema-driven**: **propertyEditor** / **propertyPanel** + **TypeConfig**（`setTypeConfig` / `resolveFieldDef` / `registerRenderer`）— declare a StructDef, get the whole inspector form for free

### 图标集

`ui.icon({ name: 'search' })` resolves to a framework-bundled [Lucide](https://lucide.dev) SVG icon (ISC-licensed, ~40 curated glyphs). `iconButton` / tab widgets accept the same name strings. Override or extend:

```js
EF.ui.registerIcon('my-icon', '<path d="M10 5v14"/>')
```

---

## 跨面板通讯

Signal 适合**状态**（有当前值,晚订阅也能读到），Bus 适合**事件**（一次性通知,错过不补）：

```js
// 状态 → signal
var currentFile = EF.signal('main.js')

// 事件 → bus
ctx.bus.emit('file:saved', { path: '/main.js' })
ctx.bus.on('file:saved', function (data) { /* ... */ })  // 面板关闭自动退订
```

---

## Dock 的交互能力

| 能力 | 说明 |
|---|---|
| **角拖分裂** | 拖拽 dock 角落的三角把一个 dock 拆成两个 |
| **边缘合并** | 拖拽三角到相邻 dock 吞并它（dirty panel 有保护） |
| **跨 dock 拖放** | 拖 tab 到另一个 dock,panel 连同状态一起迁移,零重建 |
| **弹出独立窗口** | `ctx.panel.popOut()` 或拖 tab 到窗口外 |
| **Focus 全屏** | `ctx.dock.toggleFocus()`,dock 铺满整个视口 |
| **折叠 / 展开** | `ctx.dock.setCollapsed(true)`,dock 缩成一条 toolbar |
| **Transient** | `addPanel(id, partial, { transient: true })`,单击预览 / 双击固定 |
| **Accept 白名单** | `dock({ accept: ['editor'] })`,只接受指定类型的 panel |
| **LRU 内存控制** | `createDockLayout(el, { tree, lru: { max: 10 } })`，自动淘汰最久未用的非 dirty panel |

---

## 主题

三套内置主题,通过 `data-ef-theme` 属性切换：

```js
// Dark（默认,Godot Minimal 风） —— 无需设置
// Dracula
document.documentElement.setAttribute('data-ef-theme', 'dracula')
// Light
document.documentElement.setAttribute('data-ef-theme', 'light')
```

所有颜色、间距、圆角、动画时长都是 `--ef-*` CSS 变量,可以单独覆盖：

```css
:root {
  --ef-c-accent: #ff6b6b;
  --ef-r-2: 8px;
  --ef-dur-slow: 300ms;
}
```

---

## 完整示例

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.css">
  <style> html, body { margin: 0; height: 100% } #app { width: 100vw; height: 100vh } </style>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@gooooo/editorframe@1/dist/ef.js"></script>
  <script>
    // 注册两个 component
    EF.registerComponent('note', {
      factory: function (propsSig, ctx) {
        var el = document.createElement('div')
        el.style.padding = '16px'
        el.appendChild(EF.ui.textarea({
          value: EF.signal(props.text || ''),
          placeholder: 'Type something...',
        }))
        return el
      },
      defaults: function () { return { title: 'Note', props: { text: '' } } },
    })

    EF.registerComponent('clock', {
      factory: function (propsSig, ctx) {
        var el = document.createElement('div')
        el.style.cssText = 'padding:16px; font-size:24px; font-family:monospace'
        var timer = setInterval(function () {
          el.textContent = new Date().toLocaleTimeString()
        }, 1000)
        ctx.onCleanup(function () { clearInterval(timer) })
        el.textContent = new Date().toLocaleTimeString()
        return el
      },
    })

    // 布局：左侧多标签笔记，右上单面板时钟，右下可折叠日志
    var layout = EF.createDockLayout(document.getElementById('app'), {
      tree: EF.split('horizontal', [
        EF.dock({
          toolbar: { direction: 'top', items: [{ component: 'tab-standard' }] },
          panels: [
            EF.panel({ component: 'note', title: 'Note 1', props: { text: 'Hello' } }),
            EF.panel({ component: 'note', title: 'Note 2', props: { text: 'World' } }),
          ],
        }),
        EF.split('vertical', [
          EF.dock({
            toolbar: { direction: 'top', items: [{ component: 'tab-compact' }] },
            panels: [ EF.panel({ component: 'clock', title: 'Clock' }) ],
          }),
          EF.dock({
            toolbar: { direction: 'top', items: [{ component: 'tab-collapsible' }] },
            collapsed: true,
            panels: [ EF.panel({ component: 'note', title: 'Scratch Pad' }) ],
          }),
        ], [0.7, 0.3]),
      ], [0.5, 0.5]),
    })
  </script>
</body>
</html>
```

---

## 常见误区

| 误区 | 正确做法 |
|---|---|
| 在 toolbar component 里用全局变量 + RAF 轮询 tree 状态 | 用 `ctx.dock.panels()` / `ctx.dock.activeId()` 等 signal + `EF.effect` 自动响应 |
| `EF.activatePanel(tree, dockId, panelId)` | 签名是 `EF.activatePanel(tree, panelId)`,不需要传 dockId |
| 自己写折叠/展开逻辑 | 用内置 `tab-collapsible` 或 `ctx.dock.setCollapsed(bool)` |
| 自己写 tab 栏组件 | 先试内置的 `tab-standard` / `tab-compact` / `tab-collapsible`，不满足再自定义 |
| 在 `factory(propsSig, ctx)` 里高频调 `ctx.panel.updateProps()` | `updateProps` 会触发 tree 重建,只在用户保存等低频时机调 |
| `props` 里塞函数 / DOM / Map | props 必须 JSON 可序列化,传行为用 `ctx.bus` |

---

## 本地开发

```bash
git clone https://gitee.com/lazygoo/editor-frame.git
cd editor-frame
node tools/build.mjs --watch     # src/ 变动自动重新拼接到 dist/
npx http-server -p 5570          # 浏览器访问 http://localhost:5570
```

`demo/` 下的文件不进 bundle,改完 reload 即可。

---

## 许可

[MIT](./LICENSE) © gooooo

---

## 更多

- [`CLAUDE.md`](./CLAUDE.md) —— 完整架构设计 / 数据模型 / 所有 API 定义
- [`doc/editor_style.html`](./doc/editor_style.html) —— 视觉调色板参考
- [`index.html`](./index.html) —— 组件浏览器 demo（50+ UI 组件现场演示）
