# editorframe — Claude 工作交接

> 这个文件是给 Claude 看的项目状态说明,任何新的 Claude 会话开始前都必须读完。
> 用户在不同电脑之间切换工作环境,本文件保证上下文不丢失。

---

## 1. 项目是什么

**editorframe** —— 一个纯前端、零依赖、Blender 风格的通用编辑器 UI 库。

- **零构建**:经典 `<script>` 标签,直接 `file://` 双击 `index.html` 就能跑
- **零依赖**:不用 npm,不用打包工具,不用任何框架
- **单命名空间**:所有东西挂在 `window.EF` 下
- **三层架构**:Dock(布局容器)/ Panel(内容单元)/ Component(UI 组件)
- **核心机制**:不可变 N 叉分割树 + 自研 ~70 行响应式 signal + 按 dock id 的 keyed reconciliation

### 核心思想(读完这一段等于看懂了一半)

整个框架就是这一张图:

```
Layout(Blender 风格的 N 叉分割树)
 └─ Dock ×M                      ← 可以被分裂 / 合并 / 调整大小的矩形容器
     ├─ Toolbar(可选,top/bottom/left/right 四选一条)
     │   ├─ Static Items          ← dock 配置写死的(方向、初始按钮等)
     │   └─ Dynamic Items         ← active panel 动态贡献的,切 active 自动装卸
     └─ Panel ×N(同一时刻只有 1 个 active,也可能 0 个)
         └─ Component(真正渲染内容的 UI 组件)
```

**关键结论**(每一条都是一条硬约束,后面章节会细化):

1. **Dock 里装 0 ~ N 个 panel**,有 panel 时**总有一个 active**,只 active 的那个显示。
2. **Dock 的显示 = toolbar + panel content**,toolbar 可无,content 区永远存在(空 dock 时是空 div)。
3. **Toolbar 组件不分种类**:`tab-standard`、"关闭按钮"、"文件切换器"全都是平等的 toolbar 组件。tab component 的"特殊性"仅仅是它订阅了所在 dock 的 `panels` 和 `activeId` signal 从而能渲染成 tab 栏 —— 但框架不给它开任何特权 API,它用的 ctx 和别的 toolbar 组件完全一样。
4. **Toolbar 组件有两种来源**:
   - **Static**:dock 配置里写的,随 dock 生命周期存在
   - **Dynamic**:active panel 在 PanelData 里声明的 `toolbarItems[]`,panel 激活时自动挂到 toolbar,切走自动卸载。panel 跨 dock 移动时,动态 items 自然跟着 panel 走。
5. **Panel 可跨 dock 拖放,也可弹独立窗口**。Dock 可以配 `accept` 白名单限定只接受哪些 component 类型的 panel。跨 dock 拖放和同 dock 切 active 共享同一条 detach/re-attach 代码路径;跨窗口则走 `serialize`/`deserialize` 协议(§ 4.14)。
6. **多 panel 的性能要求是真的"只有 active 存在"**:非 active panel 的 contentEl **直接从 DOM detach**(不是 display:none,不是 content-visibility:hidden),浏览器对它零 layout、零 paint、零事件开销。切回 active 时 re-append,DOM 状态和 JS 对象完全保留。这是 § 4.3 的唯一实现路径。
7. **Panel / Dock 之间通讯走一条统一的解耦总线 `EF.bus`**:pub/sub,topic + payload,通过 `ctx.bus` 自动在 panel dispose 时取消订阅。没人直接持有别人的引用。

本文件是**唯一**的设计权威。视觉调色板参考 `doc/editor_style.html`,除此之外无其他设计文档。

---

## 2. 硬规则(不可违反)

这些是和用户多次对话后确立的红线,违反会让用户失望。

### 2.1 零应用级快捷键
**框架代码绝对不许内置"应用级/业务级"快捷键**。
我们是通用库,不是某个特定的编辑器应用。Focus Mode、关闭 panel、切换 tab、保存、命令面板、撤销/重做……所有"属于应用决策"的快捷键都**只暴露 API**(例如 `ctx.dock.toggleFocus()`),由调用方决定要不要绑键、绑哪个键。Demo 里可以演示一种绑法,但绝不写进 `src/`。

**但"组件内部语义键"允许,且必须有**——这不是快捷键,是组件自身功能的一部分,删掉组件就废了:
- **输入/编辑组件的编辑键**:textarea 的 Tab 缩进、codeInput 的 Tab、input 的 Enter 提交等。浏览器默认行为不满足组件语义时,组件必须自己 `preventDefault` + 处理
- **Overlay 的 dismiss 键**:modal / drawer / popover / menu 按 ESC 关闭最上层(由 `_overlay.js` 统一管,LIFO 栈)
- **Focus trap 的 Tab 循环**:modal 打开时 Tab 在 modal 内部循环,防止焦点跑到背后不可见元素。这是 WAI-ARIA 对 modal dialog 的硬性要求
- **进行中的交互的取消键**:拖拽 splitter / 拖 panel 过程中按 ESC 取消本次拖拽

判据很简单:**这个键绑了之后,是在替用户决定应用该怎么响应,还是在完成组件自己必须做的事?** 前者禁止(写 API 让调用方绑),后者允许(组件自己绑)。拿不准就当作前者。

### 2.2 零构建、零模块系统
**不许用 ES modules,不许引入打包工具,不许写 `import/export`。**
所有源文件都是 IIFE,挂载到 `window.EF`:
```js
;(function (EF) {
  'use strict'
  // ...
  EF.something = something
})(window.EF = window.EF || {})
```
HTML 用 `<script src="...">` 按依赖顺序加载。用户必须能双击 `index.html` 直接看到运行效果。

### 2.3 设计先行(Design-First)
**任何非平凡的改动,先写计划,等用户明确说"开始"再动代码。**
顺序:
1. 列数据模型 / 文件清单 / API 表面
2. 列出待决问题并明确请用户拍板
3. 用户回复后修订计划,可能多轮
4. 用户回复"开始" / "go" / "确认开始"才动代码

用户在动代码之前更正过设计方向多次。如果你跳过这一步直接动手,会浪费工作量。当用户说"先不着急改代码"或类似的话,意思就是只设计不写代码。

### 2.4 一个独立功能一个文件
独立的功能单元住在独立的文件里。`src/` 下用子目录把相关关注点分组(`core/`、`tree/`、`components/`、`dock/`、`style/`)。不要把 6 个不相关的概念塞进一个 800 行的文件。但也不要把 30 行的"焦点模式"硬拆出去 —— 见 § 5 的目录方案。

### 2.5 不写防御性代码
框架内部相互调用是受信任的契约,不需要 try/catch、null 检查、参数兜底。**只有在用户 component 调用边界用 `safeCall` 包裹**(因为用户代码可能抛错)。不为不可能发生的情况写代码。

### 2.6 不擅自加功能
- 没让你做的功能不要做("顺手清理一下"、"加点配置项"、"补个 docstring"全都不要)
- 没让你重构的代码不要重构
- 修 bug 时不连带改无关代码
- 不在没改的代码上加注释 / 类型 / 文档
- 不为假想的未来需求做准备

### 2.7 不擅自破坏性操作
不未经允许:`git push --force`、`git reset --hard`、删文件、改 git 配置、`--no-verify`。

---

## 3. 当前代码状态(已实现)

> § 6 的 Phase 1 在用户的"Phase 1 范围就是全部实现,直接按最终版本做"指令下被一次性整体落地。本节是给"上一个会话结束后回来的 Claude"看的最新快照 —— 读完这一节就知道当前代码到什么程度了,**不要再去 git log 一行一行查**。

### 3.1 目录(实际落盘)

```
editor-frame/
  index.html                       # demo 入口 — 引用 dist/ef.{css,js} + demo widgets
  CLAUDE.md                        # 本文件 — 唯一设计权威
  doc/
    editor_style.html              # 视觉调色板参考(只读,不改)

  tools/
    build.mjs                      # § 2.2 零构建承诺的载体:cat 带 banner,
                                   # 把 src/ 里 62 个 .js 和 9 个 .css 拼成
                                   # dist/ef.js + dist/ef.css。支持 --watch

  dist/                            # 已 commit 的 bundle 产物(保证零环境双击运行)
    ef.js                          # ~174 KB,62 个 IIFE 文件按依赖序拼接
    ef.css                         # ~68 KB,9 个 CSS 文件拼接

  .claude/
    launch.json                    # Claude Preview 的 dev server 配置
                                   # (npx http-server -p 5570)

  src/
    core/                          # ⚠ 原 src/core/ 已并入这里(重构后的现状)
      signal.js                    # signal / effect / derived / batch / onCleanup
      errors.js                    # EF.errors signal + reportError + safeCall + 全局 window 兜底
      bus.js                       # EF.bus pub/sub + auto-unsubscribe
      registry.js                  # registerComponent / resolveComponent / componentDefaults
      context.js                   # ComponentContext 工厂(panel + dock + bus + signals)
    tree/
      tree.js                      # 不可变 N 叉树所有纯函数 + 框架级 transient 预览槽驱逐
    dock/
      runtime.js                   # PanelRuntime 生命周期 + activate + LRU + detached DOM
      render.js                    # reconcile / build / toolbar 两段渲染
      interactions.js              # splitter 拖拽 + 角拖 split/merge + 3×3 hover
      panel-drag.js                # tab tear-out + 跨 dock drop + pop-out(§ 4.14)
      migrate.js                   # 跨窗口 BroadcastChannel 协议 + serialize/deserialize
      layout.js                    # createDockLayout 入口胶水 + LayoutHandle(含 promotePanel)
    style/
      theme.css                    # 三层 token(原子色 → 角色 → 组件)+ dark(Godot)/dracula/light 三主题
      dock.css / component.css        # 框架自己的 dock + tab + toolbar 样式
      ui-base.css / ui-form.css / ui-editor.css / ui-container.css / ui-data.css / ui-overlay.css
    ui/                            # ⭐ UI 组件库(EF.ui.* 命名空间),按类别分目录
      _internal/                   # _portal / _floating / _drag / _signal / _overlay
      base/                        # button / iconButton / icon / tooltip / popover / kbd / badge / tag / spinner / divider
      form/                        # input / textarea / number / vector / slider / rangeSlider / checkbox / switch / radio /
                                   # segmented / select / combobox / colorInput / enumInput / tagInput / tab
      editor/                      # gradientInput / curveInput / codeInput / pathInput / fileInput
      container/                   # section / propRow / card / scrollArea / tabPanel
      data/                        # list / tree / table / breadcrumbs / progressBar(全部虚拟化)
      overlay/                     # menu / modal / drawer / alert / toast
      panel/                       # 能被 registerComponent 注册的 "panel 级" 内置 component
                                   # dock-tabs(tab-standard/compact/collapsible 三套预设) / log(error-log)

  demo/                            # ⚠ 上一个 Claude 做了一次重构:单文件 ui-showcase.js 拆成 4 份
    catalog.js                     # 全部组件的 catalog(signals / mount / editFor)数据
    state.js                       # window.Demo 命名空间(selected / select / openCategory / signal cache)
    components/                    # 5 个 panel component,全都走 registerComponent
      component-tree.js            # 左侧面板:按 category 分组的平铺树,单击 preview / 双击 permanent
      component-search.js          # 搜索面板:list 过滤,onSelect=preview onActivate=permanent
      showcase.js                  # 'showcase-<cat>' 6 个,按分类渲染 ui.card 网格 + 点击同步 Demo.selected
      property-panel.js            # 右侧面板:订阅 Demo.selected 构造编辑表单
      theme-config.js              # 实时改主题 token + 亮暗模式切换,localStorage 持久化
      demo.css                     # 以上 5 个 component 的额外样式
```

**关键提示给下一个会话的 Claude**:
- **目录分层**(重构后):
  - `src/core/` = 零依赖底层 + 注册表 + context 工厂(原 `src/core/` 的 registry/context 已并入这里)
  - `src/ui/` = `EF.ui.*` 通用 UI 元件库(50+ 个)
  - `src/ui/panel/` = 内置 panel 级 component(dock-tabs / log),用 `registerComponent` 注册,能直接塞进 dock
  - `demo/` = 用户层 demo,catalog+state 负责数据,components/ 负责 5 个面板
- 改完 `src/` 下任何文件**必须** `node tools/build.mjs` 重新生成 `dist/ef.{js,css}`,index.html 是直接引用 dist 的,不重建就看不到改动
- **`demo/` 下的文件不进 bundle** —— index.html 直接 `<script>` 加载 demo/*.js,改完 reload 即可
- 写 dev server 时用 `.claude/launch.json` 已配好的 `ef-demo`(端口 5570),不要自己拉新端口
- 文件加载顺序看 `tools/build.mjs` 的 `JS_ORDER` / `CSS_ORDER` 数组,**那是依赖序的唯一权威**

### 3.2 已实现的能力(完整清单)

**框架核心(§ 4 全部条款已落地)**:
- 不可变 N 叉分割树 + 所有纯函数写接口(addPanel/removePanel/movePanel/splitDock/mergeDocks/...,生成 id 的返回 `{tree, id}` 元组)
- 响应式核心 signal/effect/derived/batch/onCleanup,带依赖追踪
- 错误系统 EF.errors / reportError / safeCall + window error/unhandledrejection 全局兜底(§ 4.7)
- 通讯总线 EF.bus(pub/sub + auto-unsubscribe + 每个 handler 独立 safeCall 包裹)(§ 4.13)
- Component 注册表 + ComponentContext 工厂(§ 4.8 / § 4.9)
- Dock 多 panel + detached DOM activate(§ 4.3)+ LRU dispose(§ 4.3)
- Toolbar 两段渲染(static + dynamic items)(§ 4.10)
- Focus mode / Collapsed / Transient(§ 4.4 / § 4.5)
- Blender 角拖 split + sibling merge + dirty 检查 + 3×3 hover(§ 4.1 / § 4.2)
- Panel 跨 dock 拖放(detach contentEl → re-attach,零重建)(§ 4.14)
- Pop out 独立窗口 + BroadcastChannel handshake + serialize/deserialize(§ 4.14)
- 内置 component:`tab-standard` / `tab-compact` / `tab-collapsible` / `error-log`

**UI 组件库(EF.ui.* 50 个组件)**:
- 全部基于 caller-owned `value: signal<T>` 的"信号优先"设计 —— 组件不持有自己的 state
- 全部走统一 cleanup 协议:`el.__efCleanups: fn[]` + `EF.ui.dispose(el)`
- Overlay 走 `_portal.js` 的 `#ef-portal-root` 单例
- 数据组件(list/tree/table)直接虚拟化,tree 先 flatten 再复用 list 行
- 全部 50 个组件 + 内部辅助 + 9 个 CSS 文件 = 已经 100% 编出 dist 并在 demo 里可以点

**主题系统**:
- `src/style/theme.css` 三层 token:Layer 1 原子(`--ef-c-00..11` + 4 个语义色)→ Layer 2 角色(`--ef-bg-N` / `--ef-fg-N` / `--ef-border*` / `--ef-accent*`) → Layer 3 组件(`--ef-toolbar-h` 之类极少数特例)
- 派生半透明色统一用 `color-mix(in srgb, var(--ef-c-XX) NN%, transparent)`
- **三套内置主题**,通过 `:root[data-ef-theme=...]` 切换(缺省属性 = dark):
  - **dark(默认)** —— Godot Minimal 风:`#272727` 中性炭灰 ramp,`#569eff` 冷蓝 accent,"inset 输入框"角色映射(`--ef-bg-2` 比 `--ef-bg-1` 深)
  - **dracula** —— 冷调深灰 + `#7b6ef6` 紫 accent,"raised 输入框"映射(`--ef-bg-2` 比 `--ef-bg-1` 亮) + 更强阴影
  - **light** —— 白面板 + 浅灰 inset 字段 + `#5b4ee0` 深紫 accent;显式锁定 bg/border 角色映射,不继承 :root 的"inset in dark"约定
- 每个非默认主题块都**显式声明**自己的 bg/border 角色映射 + shadow 级别 —— 因为 :root 的 Godot"inset input"约定不是中性默认,被光亮 primitives 继承会反过来变成"raised in light"。三套各自独立锁定,零耦合
- 用户 demo 的 theme-config component 通过 `documentElement.style.setProperty` 写 token,localStorage 持久化

**UX 微交互(2026-04-15 那一轮专门打磨)**:
- 按钮:hover 上抬 1px + 阴影,按下 `scale(0.985)` 内阴影,`::before` 伪元素 click flash,3px accent glow 替代实心 outline
- Primary button:accent 渐变背景 + hover accent glow 投影
- Checkbox:勾选符号 `cubic-bezier(.34,1.56,.64,1)` 弹簧 scale-rotate
- Switch:knob spring 滑动 + 按住时横向拉长(像被拽住)
- Radio:中心点 spring scale-in
- Slider thumb:hover/active 时 scale + 半透明 ring
- Segmented:active 项 accent 渐变背景 + 按下 `scale(0.96)`
- Menu item:hover 时 padding-left 微移 + active 项左侧 2px accent 标记条
- Tooltip / popover:`ef-fade-in` / `ef-pop-in` 入场动画
- Modal:backdrop `backdrop-filter: blur(4px)` 渐入 + modal 体微微上抛入场
- Toast / alert:进入 spring 缓动
- Dock tab:底部 2px 指示条用 `left/right` 滑动展开,hover 时撑到 30%,active 时铺满 + accent 光晕
- 全部包了 `@media (prefers-reduced-motion: reduce)` 降级

### 3.3 已知坑(给下一个 Claude 的避雷指南)

1. **`ui.bind(el, sig, fn)` 会同步触发一次 fn**。任何在 `fn` 里访问的变量必须在 `bind` 之前已经声明并初始化,否则 TDZ 报错。`demo/components/theme-config.js` 修过这个坑(`allSigs` / `refreshAll` 必须在 `ui.bind(modeSel, ...)` 之前定义)。
2. **`EF.effect(() => ...)` 也是同步触发**。如果 effect 体里向 `documentElement.style` 写 inline CSS variable,初次挂载那一刻就会把当前 signal 值写成 inline 样式,**inline specificity 会覆盖 `[data-ef-theme="light"]` 之类的属性选择器,主题切换从此失效**。修复模板:在 effect 里读 `getComputedStyle` 的 effective value,和想写的 literal 比较,相同就 return 跳过写入 —— 初次挂载零污染,只有用户真的编辑才写 inline。详见 `demo/components/theme-config.js` 的 `bindWriter`。
3. **不要在 component `factory(propsSig, ctx)` 里调 `ctx.panel.updateProps()` 高频化**(§ 4.9 已警告)。它写回 tree 触发 reconcile,keystroke 级别会卡。
4. **改了 `src/` 没 rebuild = 看不到改动**。每次都跑 `node tools/build.mjs`(或 `--watch`)。**改 `demo/` 不用 rebuild**,demo 是 `<script>` 直挂的,reload 即可。
5. **`registerComponent` 重名 throw**。同一个 component 不能注册两次,reload 时如果 demo component 文件被加载两次会炸。`index.html` 里 demo component 用 `<script>` 标签,默认不会重复。
6. **dist/ef.{js,css} 是已 commit 的产物**。改了源码之后 commit 时记得把 dist 一起 commit,否则克隆出去的人看不到效果。
7. **focus mode 有 CSS containing block 限制**(§ 4.5 已记录)。EF root 的祖先不能有 `transform/filter/perspective/will-change`。
8. **`addPanel(..., { transient: true })` 自动驱逐同 dock 已有 transient**(§ 4.4 框架级预览槽语义,2026-04-15 落地)。调用方不用自己写"找到现有 transient 再删"的胶水 —— tree 层已经做了。`LayoutHandle.promotePanel(panelId)` 负责"单击→preview / 双击→固定"的升级路径。
9. **所有可调常数的唯一存储是 `src/style/theme.css` 的 `--ef-*` token**(2026-04-16 "统一配置" 轮落地,见 § 8 item 13)。**不要**在 JS 里新写任何"默认时长 220ms / 默认阈值 6px / icon 映射表"。判据:"JS 要不要对这个值做数值运算?" 否 → CSS `var()`/`calc(var())`/`content: var()`;是 → `EF.ui.readNum('--ef-xxx', fallback)`。消费者看 `drawer.js` / `interactions.js` / `panel-drag.js` 的写法,不要复制旧习惯。

---

## 4. 架构决策(全部要遵守)

这些是和用户反复讨论后定下的,**不要再改**。如果觉得某条不对,先问用户,不要自作主张。

### 4.1 Split 角拖语义
分裂逻辑是**统一**的 —— 看来源 dock 的 active panel:
- **有 active**:新 dock 初始 panel 用同样的 component 类型 + 注册表的 `defaults()` 拿默认参数(**不是**克隆 active panel 的状态),panel id 框架生成
- **无 active**(panels 为空):新 dock 也是空 `{ panels: [], activeId: null }`

也就是说,如果 active panel 是一个打开了 `foo.ts` 的 monaco 编辑器,新 dock 出来的是一个**空白的** monaco 编辑器,不是另一个打开 `foo.ts` 的副本。这对齐 Blender 的语义(分割 area 后两半都是同类型编辑器但状态独立)。空 dock 分裂出空 dock 是这条规则的自然结果,不是特殊情况。

### 4.2 Merge 语义
合并时**直接吞并**,被吞 dock 的所有 panels 默认**直接丢弃**。winner dock 保持自己的 panels 和 active 不变,只是面积扩大。这是 Blender-correct 的 —— merge 不是数据合并,是几何吞并。

**但是 dirty panel 不能静默丢失**(Blender 的 area 没有 dirty 概念,我们有,这里要偏离原版语义):
- 纯函数 `mergeDocks(tree, dockId, dir)` 的返回值从单 tree 改成 `{ tree, discardedPanels }`(仍无副作用,`discardedPanels` 是被吞 dock 的 `panels[]` 快照)
- `interactions.js` 在 commit merge 前检查 `discardedPanels.some(p => p.dirty)`:
  - 无 dirty → 正常 commit
  - 有 dirty → 默认**阻止 merge**,preview 回滚,不弹任何 UI(框架不绑对话框)
- 可选钩子 `EF.hooks.onDirtyDiscard?: (panels) => 'discard' | 'cancel'`:用户设置后,有 dirty 时调钩子,钩子返回 `'discard'` 才允许 merge。钩子缺省时永远当成 `'cancel'`

### 4.3 多 panel 的实现:Detached DOM(高效的本质)
这是最重要的性能决策,也是最简单的那个:**dock 的 content 容器在任何时刻只挂 active panel 的 contentEl,其他 panel 的 contentEl 从 DOM 完全 detach,保留在 runtime map 里作为 reference。**

切 active 的动作就三步:
1. 旧 active 的 `contentEl.remove()`(从 content 容器移除,**不销毁**,runtime map 还持有引用)
2. 新 active 的 `contentEl` 如果没创建过 → 懒调 `component.factory(propsSig, ctx)` 创建
3. `content.appendChild(newActive.contentEl)`

这就带来了架构性的收益:
- **浏览器对非 active panel 零渲染** —— 不 layout、不 paint、不触发 event handler、querySelector 查不到。对于 Monaco / WebGL / video 这种重组件,detached 状态下几乎不占 CPU
- **状态零丢失** —— DOM 节点和 JS 对象都还在,`<input>` 的 value、`scrollTop`、canvas 像素、Monaco 的撤销栈,全部保留。因为没销毁过
- **同窗口内的所有场景共享这一个机制**:切 active、tab 点击、跨 dock 拖放(§ 4.14)全部走同一条"detach → move reference → re-attach"的代码路径。不重建 component,不调序列化。跨窗口迁移是另一个场景,那个必须序列化(§ 4.14)
- **不需要 `content-visibility` / `display: none`** —— 这些还要走 style invalidation,detach 更彻底
- component 内部的定时器 / `setInterval` / WebSocket / `requestAnimationFrame` 框架不代管,component 作者订阅 `ctx.active`(一个 signal,见 § 4.9 ctx 表面)自己决定 detached 时是否暂停

**`ctx.active` 的精确语义**:"我的 `contentEl` 是否挂在 DOM 上"。注意它**不等于**"用户是否看得见我":
- **Collapsed dock**:只是 CSS `display:none` 整个 dock body,内部 contentEl 仍在 DOM 上。`ctx.active` **不受 collapsed 影响**,仍为 true
- 想对"看不看得见"做反应,component 自己订阅 `ctx.dock.collapsed` / `ctx.dock.focused`

"DOM 在不在" 和 "用户看不看得见" 是两个正交维度,框架各给一个 signal,component 按需订阅。

**LRU 作为"内存上限"策略**:
- 默认 `lru.max = -1`(不限,所有创建过的 panel runtime 一直留着)
- `lru.max = N`:runtime map 的条目数上限 = N
  - active panel 永远占一个名额,不会被淘汰
  - dirty panel 跳过淘汰(不丢未保存的东西)
  - 其他候选按 `lastActivatedAt` 升序,最老的**真 dispose**:调 `component.dispose(contentEl)` → 把 detached 的节点丢弃 → runtime map 删条目
  - **PanelData 仍留在 tree 里**,所以下次再 activate 这个 panel 时会重新走 `component.factory(propsSig, ctx)`,相当于"从 props 重建一次"。**只有 transient DOM state 会丢**:scroll 位置、未保存输入框草稿、撤销栈、canvas 像素、运行中的 WebGL context……凡是 component 没主动 `ctx.panel.updateProps(...)` 写回 tree 的东西都会丢。这是显式语义(像浏览器丢弃后台标签页),用户配 `lru.max` 就是在接受这个权衡
- `removePanel()` 也走 dispose 分支,且会**同时把 PanelData 从 tree 移除**(panel 被删就是被删,不是缓存淘汰)

这个模型的美感:**"非 active = detached"的规则统一了 LRU、切 active、tab 点击、跨 dock 拖放所有场景**。跨 dock 拖放的实现同样是 detach + move runtime + re-attach,零额外机制(§ 4.14)。

### 4.4 Transient Panel
**仅 API 层支持**,不做双击 / 编辑触发的自动升级:
- `addPanel(tree, dockId, panel, { transient: true })` —— 标记瞬态
- `ctx.panel.promote()` —— component 主动升级为常驻
- Tab 上瞬态 panel 标题用斜体显示
- 不监听双击事件,不监听编辑事件

### 4.5 Focus Mode
**仅 API 层支持**,纯 CSS 切换:
- `ctx.dock.toggleFocus()` / `ctx.dock.setFocus(bool)`
- 实现:给 dock 加 `data-focused` 属性,CSS `position:fixed; inset:0; z-index:100`
- **绝不绑任何快捷键**(参见 § 2.1)
- **已知限制**:当 EF root 元素的某个祖先设置了 CSS `transform` / `filter` / `perspective` / `will-change: transform` 时,`position:fixed` 会相对该祖先建立包含块而不是视口,focus 模式的 dock 不会铺满屏幕。这是 CSS 规范行为,框架不兜底;需要时调用方自己把 EF root 挂到 `<body>` 直接子级或用 `<dialog>` portal

### 4.6 Tab Component(就是一种 toolbar 组件,没特权)
Tab component **就是一个普通 toolbar 组件**,没有任何特殊 API。它"像 tab 栏"仅仅是因为:
- 它在 `factory(propsSig, ctx)` 里订阅了 `ctx.dock.panels`(signal)和 `ctx.dock.activeId`(signal)
- 它把每个 panel 渲染成一个按钮
- 点击调 `ctx.dock.activatePanel(id)`
- 关闭按钮调 `ctx.dock.removePanel(id)`

任何第三方 component 都能做同样的事。框架不给它开任何后门。

三个内置 tab component,**实现是同一个组件 + 三套预设默认 props**(不要写三份代码):
| Component | 关键默认 props |
|---|---|
| `tab-standard` | `closeButton:'hover', addButton:true` |
| `tab-compact` | `closeButton:'never', minShowCount:2`(单 panel 时 tab 栏隐藏) |
| `tab-collapsible` | `collapsible:true`(点击已激活 tab 折叠/展开整个 dock) |

**Tab component 永远是 static toolbar item**(写在 `dock.toolbar.items[]` 里,不随 panel 切换),因为它订阅的是整个 dock,不属于任何单一 panel。这意味着 tab component 的 ctx **没有 `ctx.panel`**,只有 `ctx.dock`,写代码时按这个约定即可。
Tab 上的 pointerdown 是 panel drag 会话的起点:tab component 在按钮上挂 pointerdown 监听,识别为 drag 后把控制权交给 `dock/interactions.js`,由它统一处理同 dock reorder / 跨 dock drop / pop out。tab component 自己**不做任何 drag 逻辑**,只负责"起个头"。

### 4.7 错误处理系统
统一的错误处理 + panel 错误隔离:
- `EF.errors`:`signal([])`,每条 `{ id, time, source: { scope, dockId?, panelId?, component? }, error, message, stack }`
- `EF.reportError(source, err)` / `EF.clearErrors()` / `EF.dismissError(id)`
- `EF.safeCall(source, fn)`:try/catch 包裹,失败 push 到 errors 并返回 `null`
- 所有 component `factory` / `dispose` 的调用都走 `safeCall` 包裹(同步边界)
- 单个 panel 出错只显示红色错误框,**不影响其他 panel**
- 内置 component `error-log`:订阅 `EF.errors` 渲染错误列表,用户可以把它放进任何 dock 当 "Problems" 面板用

**异步错误兜底**:`safeCall` 只抓同步调用栈,component 内部 `setTimeout` / `Promise` / `addEventListener` 抛的错抓不到。框架入口(`createDockLayout` 首次调用时)注册一次性的全局监听:
- `window.addEventListener('error', e => EF.reportError({ scope: 'global' }, e.error))`
- `window.addEventListener('unhandledrejection', e => EF.reportError({ scope: 'global' }, e.reason))`
- source 的 `scope: 'global'` 区分于 `scope: 'component'`,`error-log` component 可以按 scope 分组或过滤
- component 作用域的异步错误,component 作者可选地用 `ctx.safeCall(fn)` 手动包裹获得 panel-scoped 归因

**`signal.js` 的 effect cleanup 错误走 `console.error`,不路由 `EF.errors`**。这是架构分层必然的裁决:`errors.js` 用 `signal([])` 定义 `EF.errors`,因此依赖 `signal.js`;反过来若 `signal.js` 调 `EF.reportError`,就成了循环依赖。边界划清 —— **signal.js 是零依赖底层,它的错误路径只走 `console.error`**。语义上也是对的:effect cleanup 失败是框架底层契约破裂(component 的 `onCleanup` 回调崩了),属于"fail-loud 到控制台"的范畴,不是归到某个 panel 的软错误列表里可以慢慢看的事。

### 4.8 Component 注册表(一种形态,无妥协)
**所有 component 必须先注册,panel 和 toolbar item 引用 component 只能用已注册名(string)。** 没有匿名 spec、没有 function 简写、没有未注册 component。这是一条硬规矩 —— 代价换来的是:tree 严格 JSON 可序列化、跨窗口迁移无需特殊分支、`accept` 白名单规则统一、文档只讲一种写法。

```js
EF.registerComponent(name, {
  factory: (propsSig, ctx) => HTMLElement,   // 必需
  defaults?: () => ({ title?, icon?, props?, toolbarItems? }),
  dispose?: (el) => void,
  serialize?: (el) => any,                // 可选,跨窗口迁移时用(§ 4.14)
  deserialize?: (el, state) => void,      // 可选,配对
})
```

- `factory(propsSig, ctx)` 必需,返回 component 的根 element;框架把它作为 `contentEl` 挂到 dock 的 content 区(panel component)或 toolbar 区(toolbar component)
- `defaults()` 可选,返回新建 panel 时的默认字段。§ 4.1 角拖分裂调这个。未提供则 fallback 到 `{ title: name, props: {} }`
- `dispose(el)` 可选,component 需要清理资源(取消订阅、关 WebSocket、terminate Worker)时实现
- `serialize` / `deserialize` 可选,**仅跨窗口迁移时调用**(§ 4.14)。同窗口内的 panel 切换、tab 点击、跨 dock 拖放都不经过序列化 —— 那些场景下 contentEl 本身就被整体迁移(detached DOM,§ 4.3)

**硬性 props 约束**:`panel.props` 和 `toolbarItem.props` 必须是 **JSON 可序列化的 plain object**。不许塞函数、DOM node、class instance、Map/Set、循环引用。理由:tree 要能跨窗口 `structuredClone`,要能 JSON 持久化。想传"行为"?通过 bus 发事件或订阅 signal,不要塞进 props。这条约束由调用方保证,框架不做运行时校验(§ 2.5 不写防御性代码)。

**配套 API**:
- `EF.registerComponent(name, spec)` —— 注册,重名 throw,名字必须是合法 string
- `EF.resolveComponent(name)` —— 查表返回 spec,未注册 throw
- `EF.componentDefaults(name)` —— `resolveComponent(name).defaults?.() ?? {}`,调用点不用判空
- 所有内置 component(`tab-standard` / `tab-compact` / `tab-collapsible` / `error-log`)本身也通过 `registerComponent` 注册,作为示范,不走后门

### 4.9 数据模型(完整,唯一来源)
本节是整个框架**所有数据结构的唯一定义处**。别的章节只讲行为,结构回这里查。

**数据分 6 层,依赖方向自上而下(下层只被上层引用,绝无反向)**:

```
Layer 1 │ LayoutConfig            ← 用户调 createDockLayout 的入参
Layer 2 │ Tree 结构(可序列化)    ← LayoutTree / SplitNode / DockData / PanelData / ToolbarConfig / ToolbarItemSpec
Layer 3 │ 注册表                   ← ComponentSpec(全局 Map)
Layer 4 │ 运行时外壳(内存)       ← LayoutRuntime / DockRuntime
Layer 5 │ Component 运行时            ← ComponentRuntime(3 种 kind 统一)+ ComponentContext
Layer 6 │ 纯函数 API(无 DOM)     ← tree/*.js 的全部写接口 + 返回值约定
```

**关键原则**(贯穿 6 层):
- **Layer 1~2 必须 `structuredClone` 安全**:tree 要能持久化、要能跨窗口 postMessage、要能 JSON 存盘。禁止塞函数 / DOM / Map / Set / class instance / 循环引用
- **Layer 4~5 绝不复制 tree 的状态**:所有"当前标题 / dirty / active / collapsed"都是从 tree 派生的 signal,不是 runtime 里另存一份。**single source of truth = tree**
- **Layer 6 结构共享**:所有写接口返回的新 tree 和旧 tree 共享未改动的子树,`===` 相等 → reconcile 零开销扫过

#### Layer 1 — LayoutConfig(入口契约)

```
createDockLayout(container: HTMLElement, config: LayoutConfig) → LayoutHandle

LayoutConfig = {
  tree:   LayoutTree,                // 初始布局(必填)
  lru?:   { max: number },           // 默认 { max: -1 }(不限,见 § 4.3)
  hooks?: {
    onDirtyDiscard?: (panels: PanelData[]) => 'discard' | 'cancel',   // § 4.2
  },
}

LayoutHandle = {
  tree():        LayoutTree,         // 只读快照
  setTree(t):    void,
  subscribe(fn): () => void,         // tree 变化订阅,返回退订

  // 便利 API = 对应纯函数 + setTree + 返回生成的 id
  addPanel(dockId, partial, opts?):               { panelId },
  removePanel(panelId):                           void,
  activatePanel(panelId):                         void,
  movePanel(panelId, dstDockId, dstIndex?):       void,
  splitDock(dockId, dir, side, ratio?, opts?):    { newDockId, newPanelId? },
  mergeDocks(winnerId, loserId):                  boolean,   // false = 被 dirty 阻止(§ 4.2)
}
```
LayoutHandle 是用户手里**唯一**持有的引用。想操作布局,就只用它 —— 不要直接持有 DockRuntime / ComponentRuntime(它们是内部实现)。

#### Layer 2 — Tree 结构(可序列化)

整个 tree 是**不可变 + 结构共享**的,任何写操作返回新根,未变的子树 `===` 旧引用。全部节点 JSON 可序列化。

- **LayoutTree**(根):
  ```
  LayoutTree = SplitNode | DockData
  ```
  根可以是一个 split,也可以是单个 dock(极小布局:只有 1 个 dock 填满容器)。

- **SplitNode**(布局骨架,N 叉):
  ```
  {
    type:      'split',
    direction: 'horizontal' | 'vertical',     // horizontal = 行(左→右),vertical = 列(上→下)
    sizes:     number[],                       // 归一化到和 ≈ 1,长度 = children.length
    children:  Array<SplitNode | DockData>,    // n ≥ 1;n = 1 时应被上游压平
  }
  ```
  **SplitNode 无 id** —— 它是结构骨架,没有"这个 split 是哪个"的需求。需要定位时走 `path: number[]`(从根到目标节点的 children 下标序列)。keyed reconcile 的 key 是 **dockId**,split 节点每次 reconcile 都廉价重建 div 壳子(见 § 4.3 注释)。

- **DockData**(叶子,矩形容器):
  ```
  {
    id:         string,                        // 框架生成 'dock-N'(§ 4.11)
    type:       'dock',
    panels:     PanelData[],                   // 0 ~ N 个
    activeId:   string | null,                 // panels 为空时必为 null;非空时必指向 panels 里某个 id
    toolbar?:   ToolbarConfig,                 // 无此字段 = 不渲染 toolbar,见 § 4.10
    accept?:    string[] | '*',                // panel 白名单(§ 4.12),默认 '*'
    collapsed?: boolean,                        // 默认 false(§ 4.5 的 focused 和这个正交)
    focused?:   boolean,                        // 默认 false,全 tree 至多 1 个 dock 为 true
  }
  ```

- **PanelData**(内容单元):
  ```
  {
    id:            string,                     // 框架生成 'panel-N'(§ 4.11)
    component:        string,                     // 必须是已注册 component 名(§ 4.8)
    title?:        string,                     // 默认 = component 名
    icon?:         string,                     // 图标标识(emoji / 名字),可无
    dirty?:        boolean,                    // 默认 false,merge 时用(§ 4.2)
    badge?:        string | null,              // 小角标文字(未读计数等),默认 null
    props?:        object,                     // 传给 component.factory 的 props,默认 {},必须 JSON 可序列化
    transient?:    boolean,                    // 默认 false(§ 4.4,瞬态显示斜体)
    toolbarItems?: ToolbarItemSpec[],          // 此 panel 激活时贡献的动态工具栏项(§ 4.10)
  }
  ```
  **`props` 的硬性约束**(和 § 4.8 同一条):不许塞函数 / DOM / class instance / Map / Set / 循环引用。想传"行为"走 `EF.bus`,不要塞进 props。框架不做运行时校验 —— 这是调用方契约(§ 2.5)。
  **`lastActivatedAt` 不在这里** —— 它是运行时缓存,放 ComponentRuntime(见 Layer 5)。

- **ToolbarConfig**(dock 级 toolbar 配置):
  ```
  {
    direction: 'top' | 'bottom' | 'left' | 'right',    // 位置 4 选 1
    items:     ToolbarItemSpec[],                        // static 工具项(§ 4.10)
  }
  ```
  字段缺失 = 不渲染 toolbar。动态 items 来自 active panel 的 `PanelData.toolbarItems`,和这里的 static items 渲染时拼接(见 § 4.10)。

- **ToolbarItemSpec**(工具栏项,static / dynamic 共用同一结构):
  ```
  {
    id:     string,                            // 框架生成 'ti-N'(§ 4.11)
    component: string,                            // 必须是已注册 component 名(§ 4.8)
    props?: object,                            // JSON 可序列化,默认 {}
    align?: 'start' | 'end',                   // 默认 'start'(工具栏的起始端 / 结束端)
  }
  ```
  tab component 也是这种 spec,framework 不给它开任何特权字段(§ 4.6)。

#### Layer 3 — 注册表(ComponentSpec)

**ComponentSpec 的完整字段定义见 § 4.8**,这里不重复。

仅补一条:注册表是进程全局(`Map<string, ComponentSpec>`),不属于任何 LayoutRuntime —— 同一页面多个 createDockLayout 共享一套 component 定义。

#### Layer 4 — 运行时外壳(LayoutRuntime / DockRuntime)

运行时外壳**绝不重复存储 tree 里已有的状态**。它只存"为了给 DOM / component 服务必须有的东西":keyed reconcile 的锚点、component 实例的归属、全局计数器、hooks。

- **LayoutRuntime**(一个 createDockLayout 一份):
  ```
  {
    container:         HTMLElement,                // 调用方传入的根
    treeSig:           Signal<LayoutTree>,          // 唯一 tree 信号
    dockRuntimes:      Map<dockId, DockRuntime>,    // keyed reconcile 用:tree 里还在的 dock 才保留
    activationCounter: number,                      // 全局单调递增,给 ComponentRuntime.lastActivatedAt 派号
    lruMax:            number,                      // 来自 config.lru.max
    hooks:             LayoutConfig['hooks'],
    broadcastChannel:  BroadcastChannel | null,     // 首次 popOut 时懒建(§ 4.14)
  }
  ```
  - `dockRuntimes` 是 reconcile 循环的**keyed 查表**:新 tree 走一遍 → 见到某 dockId 已存在 → 复用 runtime + 复用 DOM;没存在 → 新建 runtime + 建 DOM;旧 tree 里有但新 tree 没有 → dispose runtime + 丢 DOM。这就是 § 4.3 "keyed reconciliation by dock id" 的实际载体。

- **DockRuntime**(每个 tree 里的 dock 一份):
  ```
  {
    id:                    string,                       // = DockData.id
    dataSig:               Signal<DockData>,              // tree 里该 dock 的实时镜像
    dockEl:                HTMLElement,                   // .ef-dock 根(keyed reconcile 的锚点)
    toolbarEl:             HTMLElement | null,            // .ef-toolbar(无 toolbar 时为 null)
    contentEl:             HTMLElement,                   // .ef-dock-content(active panel 的唯一挂载点)
    panelRuntimes:         Map<panelId, ComponentRuntime>,   // kind='panel',懒建懒销
    staticToolbarRuntimes: ComponentRuntime[],               // kind='toolbar-static',随 dock 生灭
  }
  ```
  - `dataSig` 是 dock 数据的 signal 镜像,`ctx.dock.panels` / `activeId` / `collapsed` 等都是 `derived(() => dataSig().xxx)`。reconcile 里只 `dataSig.set(newDockData)`,component 端自动沿链重算。
  - **动态 toolbar runtimes 不住在这里**,它们挂在贡献者 panel 的 ComponentRuntime 上(跟父 panel 走,见 Layer 5)。这是跨 dock 移动 panel 时"动态 items 自然跟着走"的根本原因。

#### Layer 5 — ComponentRuntime(三 kind 统一)

**所有 component 实例在运行时用统一的 `ComponentRuntime` 结构包装**,住在 DockRuntime 里(panel / static toolbar)或父 panel runtime 的 `dynamicToolbarRuntimes` 数组里(dynamic toolbar)。这是本架构的关键统一点 —— panel component / 静态 toolbar component / 动态 toolbar component **不是三种不同的对象**,而是**一个概念,三种生命周期**。

```
ComponentRuntime = {
  kind,                     // 'panel' | 'toolbar-static' | 'toolbar-dynamic'
  component,                   // string,已注册 component 名(§ 4.8)
  contentEl,                // HTMLElement | null,懒创建 + detached DOM(§ 4.3)
  ctx,                      // ComponentContext(kind 决定暴露哪些字段)
  cleanups,                 // Array<() => void>,dispose 时顺序跑完
  active,                   // signal<boolean>,§ 4.3 的"DOM 是否挂载"语义

  // 仅 kind === 'panel':
  data?,                    // signal<PanelData>,tree 中该 panel 的实时镜像
  dockRef?,                 // signal<string>,当前所在 dockId
  dynamicToolbarRuntimes?,  // Array<ComponentRuntime>,此 panel 贡献的 dynamic items
  lastActivatedAt?,         // 单调递增数字,用于激活选择 + LRU
}
```

**三种 kind 的归属与生命周期**(表):

| kind | 住在哪里 | 生命周期 | ctx 暴露字段 |
|---|---|---|---|
| `panel` | dock 的 `panelRuntimes: Map<panelId, ComponentRuntime>` | `addPanel` 建 / `removePanel` 或 LRU 销 | `ctx.panel` + `ctx.dock`(动态跟随 `dockRef`) |
| `toolbar-static` | dock 的 `staticToolbarRuntimes: ComponentRuntime[]` | 随 dock 整体生灭 | 仅 `ctx.dock`;`ctx.active` 常量 `true` |
| `toolbar-dynamic` | 父 panel runtime 的 `dynamicToolbarRuntimes` 数组 | 跟父 panel 走;父 panel 销则同销 | `ctx.panel` = 贡献方 panel;`ctx.dock` = panel 当前所在 dock(跟父 `dockRef` 动态) |

**三种 runtime 的架构统一点**(不是巧合,是设计):

1. **`cleanups` 字段三种 runtime 都有**。`ctx.bus.on(topic, h)` 永远把退订函数 push 进"当前 runtime 的 cleanups",runtime dispose 时一起跑 —— **订阅泄漏/static toolbar 没挂载点的问题从机制上不存在**。auto-unsubscribe 是 runtime 层的性质,不是 panel 层的特权
2. **`contentEl` 的懒创建 + detached DOM 规则(§ 4.3)三种 kind 共用**。切 active 的 detach / re-attach 代码路径一套
3. **跨 dock 移动**只操作 `kind='panel'` 的 runtime —— 把它从源 dock `panelRuntimes` 挪到目标 dock,改它的 `dockRef` signal。它的 `dynamicToolbarRuntimes` 是 panel runtime 的字段 —— 自然跟着走,零额外逻辑

#### `data` 是 signal,所有 panel 派生字段从它读

单一真源 = tree,单一更新路径 = `tree → data signal → derived`:

- reconcile tree 时,框架对每个 panel runtime 做 `runtime.data.set(newPanelData)`
- tree 是结构共享的不可变树,**未改动的 PanelData 对象在新旧 tree 里是 `===` 同一引用** —— signal 的 `Object.is` 脏检查自动跳过 notify。未变动的 panel 在 reconcile 里走过是零开销
- `ctx.panel.title` / `dirty` / `props` 全部是 `derived(() => runtime.data().xxx)` 形式,没有"runtime 里复制一份"的状态
- `ctx.panel.setTitle(s)` 的实现就是 `treeSig.set(updatePanel(treeSig.peek(), id, { title: s }))` —— 这次写入下一 reconcile 自动沿 data signal 传到 derived

**runtime 没有重复状态,没有同步问题**。

#### 为什么这样分

**为什么 `lastActivatedAt` 放 runtime 不放 PanelData?**
- 每次切 active 都触发 tree 不可变重建太重(新 dock、新 panels 数组、新 panel 对象)
- LRU 淘汰和"关闭 active 后新 active 选谁"两个用途都在 runtime 层查,不用碰 tree
- 跨窗口迁移时对端 `_activationCounter` 从 0 开始,丢失本端的激活历史是**正确的**(新环境自己产生新的"最近使用"序列)

**为什么 `dockRef` 是 signal?**
- Panel 跨 dock 移动(§ 4.14)时,component 订阅的 `ctx.dock.panels` / `activeId` / `collapsed` 等要自动指向新 dock
- 实现:`ctx.dock.panels = derived(() => tree.find(dockRef()).panels)`。dockRef 变 → derived 重算 → component effect 自动 re-run
- component 不感知自己被移动过,代码完全透明

#### ctx 完整表面

**共享部分**(三种 kind 都有):
```
ctx.active               // signal<boolean>
ctx.bus                  // auto-unsub 版 EF.bus,on() 自动挂当前 runtime 的 cleanups
ctx.onCleanup(fn)        // 手动注册 cleanup(给非 bus 的场景)
ctx.safeCall(fn)         // 异步回调归因到当前 runtime
ctx.dock = {
  id:        signal<string>,
  panels:    signal<PanelData[]>,
  activeId:  signal<string|null>,
  collapsed: signal<boolean>,
  focused:   signal<boolean>,
  activatePanel(id), removePanel(id), addPanel(partial),
  toggleFocus(), setFocus(b), setCollapsed(b),
}
```

**仅 `kind='panel'` 或 `kind='toolbar-dynamic'` 有**:
```
ctx.panel = {
  id,
  title: signal<string>,   setTitle(s),
  icon:  signal<string>,   setIcon(s),
  dirty: signal<boolean>,  setDirty(b),
  badge: signal<string|null>, setBadge(s),
  props: signal<object>,   updateProps(patch),
  promote(), close(), popOut(),
}
```

**`toolbar-static` component 的 ctx 没有 `ctx.panel`**,按约定使用即可,框架不做 null 检查(§ 2.5)。

#### `ctx.panel.updateProps(patch)` 是低频持久化点

这是 component 把"想持久化的状态"写回 tree 的**唯一通道**。每次调:浅合并到 `PanelData.props` → 提交新 tree → reconcile → derived 沿链传播。这是重操作,**不要在 keystroke / scroll / pointermove 等高频事件里调**。高频状态存 component 内部,在用户显式保存 / panel dispose / pop-out 之前 flush 一次即可。

典型例子:
- monaco component 打开新文件 → 调 `updateProps({ filePath: '...' })`(低频,用户动作触发)
- 实时光标位置 → **不调** updateProps,存在 component 实例字段里,需要时再 flush
- LRU 真 dispose 后重建,`factory(propsSig, ctx)` 拿到的 `props` 只包含被 updateProps 写回去的字段。其他全部是"只存在 contentEl 里"的临时状态 —— 这是显式契约,用户配 `lru.max` 时就在接受

#### Layer 6 — 纯函数 API(tree/tree.js,无 DOM)

所有写接口是**纯函数**:输入旧 tree,输出新 tree(结构共享);契约违反直接 throw(§ 2.5)。约定:**生成 id 的写函数返回 `{ tree, 新id }` 元组;不生成 id 的返回 tree 本身;`mergeDocks` 返回 `{ tree, discardedPanels }`(§ 4.2)。**

| 函数 | 签名 | 返回 | 备注 |
|---|---|---|---|
| `findDock` | `(tree, dockId)` | `{ node, path } \| null` | path = 从根到该 dock 的 children 下标序列 |
| `findPanel` | `(tree, panelId)` | `{ panel, dockId, path } \| null` | path 指向所在 dock |
| `getAt` | `(tree, path)` | `node \| null` | |
| `addPanel` | `(tree, dockId, partial, opts?)` | `{ tree, panelId }` | `opts.transient?: boolean`;`accept` 拒收则 throw(§ 4.12) |
| `removePanel` | `(tree, panelId)` | `tree` | 若删的是 active,按激活计数选新 active(§ 4.11) |
| `updatePanel` | `(tree, panelId, patch)` | `tree` | 浅合并到 PanelData |
| `activatePanel` | `(tree, panelId)` | `tree` | 只改所在 dock 的 `activeId` |
| `promotePanel` | `(tree, panelId)` | `tree` | 清 transient(§ 4.4) |
| `movePanel` | `(tree, panelId, dstDockId, dstIndex?)` | `tree` | 省略 `dstIndex` = append;`accept` 拒收则 throw;srcDock === dstDock 时退化为 reorder |
| `reorderPanel` | `(tree, panelId, newIndex)` | `tree` | = `movePanel(..., 同 dock, newIndex)` 的语法糖 |
| `updateDock` | `(tree, dockId, patch)` | `tree` | 浅合并 DockData(排除 panels / activeId) |
| `setCollapsed` | `(tree, dockId, bool)` | `tree` | |
| `setFocused` | `(tree, dockId, bool)` | `tree` | 置 true 时自动清其他 dock 的 `focused` |
| `splitDock` | `(tree, dockId, direction, side, ratio?, opts?)` | `{ tree, newDockId, newPanelId? }` | `side: 'before' \| 'after'`;`ratio ∈ (0,1)`,默认 0.5;新 dock 按 § 4.1 初始化(active component 的 defaults 或空) |
| `mergeDocks` | `(tree, winnerId, loserId)` | `{ tree, discardedPanels }` | 仅允许直接兄弟(§ 4.2);dirty 检查由调用方(`interactions.js`)做 |
| `resizeAt` | `(tree, splitPath, newSizes)` | `tree` | 直接改某个 split 的 sizes |
| `swapDocks` | `(tree, dockA, dockB)` | `tree` | 整个 DockData 对换位置(面板全跟着走) |

**id 生成永远走全局计数器**:`EF._nextPanelId()` / `EF._nextDockId()` / `EF._nextToolbarItemId()`,这三个计数器挂在 `EF` 上,进程内单调,跨 LayoutRuntime 共享。用户不传 id、不看 id(除非从返回值里读)—— 这是 § 4.11 的硬规矩。

### 4.10 Toolbar —— 单条,两种来源
**一个 dock 最多 1 条 toolbar,在 4 个方向(top/bottom/left/right)选 1 个。** 位置由 `dock.toolbar.direction` 决定。

**Toolbar 里的组件来自两种来源**(渲染时按顺序拼出来):
1. **Static items** —— 写在 `dock.toolbar.items[]` 里,随 dock 生命周期存在,不随 panel 切换变化
2. **Dynamic items** —— active panel 在 `PanelData.toolbarItems[]` 里声明,**panel 激活则显示,不激活则消失**

**ToolbarItemSpec 的字段定义见 § 4.9 Layer 2**。这里只讲它的行为。

**动态 items 的生命周期**:
- Dynamic items 的 contentEl 跟 panel contentEl 一样走**懒创建 + detached DOM**:panel 第一次激活时调 `component.factory(propsSig, ctx)` 创建,切走 active 时从 toolbar DOM detach(**不销毁**),切回来 re-append
- Panel 跨 dock 移动时,dynamic items 的 contentEl 跟着 panel 走,component 不重建;它们订阅的 `ctx.dock.*` signals 通过 PanelRuntime 的 `dockRef`(§ 4.9)自动指向新 dock
- Panel dispose 时,所有它贡献的 dynamic items 一起 dispose(走 `component.dispose`)

**渲染规则**:
- 切换 active panel 时 toolbar **不整体重建**,只 reconcile dynamic items 部分(static items 永远不动)
- **component 类型决定它能访问哪些 ctx 字段**(契约,不是检查):
  - **Panel component**(出现在 dock content 区):`ctx.panel` 指向自己 + `ctx.dock` 指向所在 dock
  - **Static toolbar component**(写在 `dock.toolbar.items`):只有 `ctx.dock`,没有 `ctx.panel`。tab component 属于这一类
  - **Dynamic toolbar component**(写在 `PanelData.toolbarItems`):`ctx.panel` 指向贡献它的 panel + `ctx.dock` 指向 panel 当前所在的 dock(跟随 `dockRef` 迁移)
  - component 作者按注册场景决定用哪些字段,框架不做 null 检查,不写 fallback

**Dock 无 toolbar 时**:整个 toolbar 区域完全不渲染,content 占满整个 dock。**不要默认插入 `tab-standard`**,这是显式契约 —— 用户没写 toolbar 就真的没有。dynamic items 此时也不显示(没挂载点)—— 这是 panel 作者应自检的边界(想显示就选个会配 toolbar 的 dock)。

**`activeId` 为 null 时**:content 区就是一个空 div,不显示提示文字、不接受 emptyContent 渲染器。想要占位,自己注册一个占位 component 当默认 panel。

### 4.11 id 生成 & active 自动切换
**所有 id 由框架生成,用户不传、不指定、不看见(除非主动从返回值读)。**
- `panel.id`:框架内部计数器 `panel-1 / panel-2 / ...`
- `dock.id`:框架内部计数器 `dock-1 / dock-2 / ...`
- 对应 API 改为只接 "部分 PanelData"(不含 id),执行后返回新生成的 id:
  - `addPanel(tree, dockId, partial, opts?) → { tree, panelId }`
  - `splitDock(tree, dockId, dir, opts?) → { tree, newDockId, newPanelId? }`(分裂出空 dock 时 `newPanelId` 为 `undefined`)
  - `createDockLayout(config)` 顶层配置允许用"锚点名"(如 `name: 'sidebar'`)做稳定引用,内部依然生成 id 并维护一张 `name → id` 的查找表
- 重复 id 理论上不会发生(框架生成,全局单调)

**active 切换用激活计数,不用"前/后邻居"。**
- 全局单调递增 `EF._activationCounter`(进程内)
- `activatePanel(dockId, panelId)` 执行时,在对应 PanelRuntime 上写 `runtime.lastActivatedAt = ++EF._activationCounter`(这是 runtime 的字段,不写回 tree)
- 删除 active panel 后,新 active = 剩余 panels 里 `lastActivatedAt` 最大的那个 runtime 对应的 panelId;dock 空了则 `activeId = null`
- 同一个字段被 § 4.3 的 LRU 复用:`lru.max = N` 时,按 runtime 的 `lastActivatedAt` 升序挑最小的 **dispose**(真 dispose,不是 hide)

### 4.12 Panel 白名单(dock.accept)
每个 dock 可以声明自己接受哪些类型的 panel —— 这条规则同时服务于跨 dock 拖放的 drop zone 校验(§ 4.14):
- `dock.accept` 默认 `'*'`(接受任何 component 类型)
- 可以写成 `['monaco', 'preview']`(仅接受这两个注册名)
- **校验发生在纯函数层**:`addPanel(tree, dockId, partial)` 和 `movePanel(tree, srcDockId, panelId, dstDockId)` 在构造新 tree 之前检查目标 dock 的 `accept`,不匹配直接 throw(不是防御性代码,是显式契约)
- **拖放 UI 亮灯用的是同一份规则** —— preview 时查一次 `accept`,决定 drop zone 是绿还是红
- 因为 panel.component 字段永远是 string(§ 4.8),这条规则不存在边界 case

### 4.13 通讯总线 EF.bus(pub/sub,自动清理)
**所有 panel / dock / component 之间的解耦通讯走同一条总线。没人直接持有别人的 reference,也没人直接调别人的方法。**

API 极简:
```js
EF.bus.on(topic, handler) → unsubscribe fn
EF.bus.off(topic, handler)
EF.bus.emit(topic, payload)
```

- `topic` 是任意字符串,命名由用户自定(例如 `'file:opened'` / `'selection:changed'` / `'build:done'`),框架不限制也不校验
- `handler` 同步执行,`emit` 返回后所有订阅者都跑完了
- **每个 handler 都被 `safeCall` 单独包裹**:某个 handler 抛错只会路由到 `EF.errors`(source 带订阅者所在 panel 的 dockId/panelId),**不会中断同一 emit 的其他订阅者**。这是 § 4.7 错误隔离规则的延伸 —— 一条总线上互不信任的 component 需要有这个保证
- **auto-unsubscribe**:component 通过 `ctx.bus.on(topic, h)` 订阅时,框架自动把退订函数塞进 panel runtime 的 `cleanups` 列表,panel dispose 时一起清,**不存在订阅泄漏**。component 直接用 `EF.bus.on` 就没有自动清理,需要自己管
- 框架内置几个系统 topic(component 可订阅,也可不订阅):
  - `ef:panel:activated` → `{ dockId, panelId }`
  - `ef:panel:removed` → `{ dockId, panelId }`
  - `ef:panel:moved` → `{ panelId, fromDockId, toDockId }`(跨 dock / 跨窗口都发,跨窗口时 fromDockId 是对端 id,by 约定 prefix 区分)
  - `ef:dock:focus-changed` → `{ dockId, focused }`
  - `ef:errors:new` → 新增 `EF.errors` 条目时(`error-log` component 其实就订阅这个)
- **只做单向 emit**,不做 request/response。要"问/答"语义,自己定义两个 topic(`'foo:request'` / `'foo:response'`)+ 自带 correlation id
- bus 不做持久化,不做离线回放,订阅之前 emit 的事件收不到(这对系统 topic 来说是正确的,因为它们反映的是瞬时状态)

**Bus vs Signal —— 用哪个?** 框架同时提供两套通讯原语,区分清楚不是教条而是性能和正确性问题:

| 维度 | `signal`(§ core/signal.js) | `bus`(§ 4.13) |
|---|---|---|
| 形态 | **状态**(有"当前值") | **事件**(只有"发生过") |
| 订阅时机 | 晚订阅也能通过 `signal()` 读到当前值 | 晚订阅收不到 emit 之前的事件 |
| 多源 | 一个 signal 一个 owner,谁拥有谁 set | 任何 component 都能 emit 到任何 topic |
| 重复值 | 同值 set 不通知(脏检查) | 每次 emit 都触发 |
| 数据流向 | 内层 → 外层(子组件读父 ctx 的 signal) | 横向(panel ↔ panel,跨 dock) |
| auto-cleanup | `effect` 通过 `onCleanup` 收集 | `ctx.bus.on` 通过 panel runtime cleanups 收集 |

**判定规则(一句话)**:**晚一点订阅的人,需不需要知道"我订阅之前发生的最后一次"?需要 → signal;不需要 → bus。**

具体落地:
- "当前 active panel 是哪个" → **signal**(`ctx.dock.activeId`),因为新挂载的 tab component 必须立刻知道当前是谁
- "panel 已激活" 通知 → **bus**(`ef:panel:activated`),因为这是事件,错过了不需要补
- "文件内容已修改"(dirty 标记) → **signal**(`ctx.panel.dirty`),状态
- "文件已保存" → **bus**(`'file:saved'` 之类),事件
- 跨 panel 共享的"当前选中的对象" → **signal**(由某个权威 panel 持有,放在 `EF` 上或通过 bus 广播一次拿到 ref;真要解耦还是首选"权威 panel emit 事件,关心方各自维护本地 cache")
- 一次性命令(关闭 / 保存 / 编译) → **bus**

### 4.14 Panel 跨 dock 拖放 & 弹出独立窗口
**这是核心能力,不是可选扩展。**

**跨 dock 拖放(同窗口内)**:
- Tab 栏上的 panel 可拖出,进入另一个 dock 的 tab 栏或 content 区 → 执行 `movePanel(tree, srcDockId, panelId, dstDockId)`
- 拖放过程中框架 hit-test 目标 dock,查目标 dock 的 `accept` 白名单(§ 4.12),不匹配 → 红色禁入 overlay;匹配 → 绿色 drop zone
- 实现上就是 **detach contentEl from src dock's content → attach to dst dock's content**,不重建 component,不丢状态。PanelRuntime 整个从源 dock 的 map 移到目标 dock 的 map
- 同 dock 内 tab reorder 是这个操作的退化场景(src === dst,只改 panels 数组顺序)

**弹出独立窗口**:
- `ctx.panel.popOut()` 或拖 panel 到窗口外触发
- 框架调 `window.open()` 开一个新 browser 窗口,加载同一份 `index.html`
- 新老窗口通过 `BroadcastChannel('ef-layout')` 建立连接
- 源窗口:调 `component.serialize(contentEl) → state`(可选 hook,不提供则 `state = undefined`),`BroadcastChannel.postMessage({ action: 'migrate', panelData, state })`,等目标窗口 ack,收到后才在源窗口 `component.dispose(contentEl)` + `removePanel`
- 目标窗口:收到 migrate → 决定落点 dock → `addPanel` → 懒激活时调 `component.factory(propsSig, ctx)` + 若有 state 再调 `component.deserialize(contentEl, state)`,完成后发 ack
- **Component spec 新增两个可选字段**配合跨窗口:
  ```
  serialize?:   (el) => any         // 返回一个可 structured-clone 的 state
  deserialize?: (el, state) => void // 在新创建的 el 上恢复 state
  ```
- 两个字段都没实现的 component **仍然可以跨窗口迁移**,只是状态只保留 `props`(等于重建)
- 细节:跨窗口期间的"谁拥有这个 panel"竞态用"源先冻结 → 发消息 → 目标 ack → 源清理"的两阶段 handshake 处理
- 独立窗口关闭时,它里面的 panel 消失(跟浏览器关标签页一样,框架不做自动回流)

### 4.15 明确不做的(out of scope)
**下列能力项目不做,即使功能上看起来"顺手就能加",也不做。** 要做请单独立项讨论。
- **Transient panel 的双击 / 编辑自动升级**:不监听双击、不监听编辑事件。只保留 `ctx.panel.promote()` API
- **Overlay / Peek**(VS Code 风格的悬浮编辑器):不在范围
- **命令系统**(command palette):框架不提供,用户自己搭
- **菜单系统**(右键菜单、顶栏菜单):同上
- **主题切换运行时 API**:只保证 CSS 变量命名规范(§ 5),不做 `setTheme()`
- **任何内置快捷键**(再次强调,见 § 2.1)

---

## 5. 目录结构

```
editorframe/
  index.html
  CLAUDE.md            # 本文件(唯一的设计权威)
  doc/
    editor_style.html  # 视觉调色板参考

  src/
    core/
      signal.js        # 响应式核心:signal / effect / derived / batch / onCleanup
      errors.js        # 全局错误信号 + reportError + safeCall + window 兜底
      bus.js           # EF.bus:pub/sub + auto-unsubscribe(§ 4.13)

    tree/
      tree.js          # 不可变树节点 + 所有纯函数(无 DOM)

    core/
      registry.js      # registerComponent / resolveComponent / componentDefaults(§ 4.8)
      context.js       # ComponentContext 工厂(panel + dock + bus + errors 接口)
    ui/panel/
      dock-tabs.js     # 单 tab 组件 + 三套预设(standard/compact/collapsible)
      log.js           # 内置 error-log component

    dock/
      runtime.js       # PanelRuntime + activate/transient/focus/collapsed + LRU dispose
      render.js        # reconcile / build / createSplit / createDock / createToolbar
                       # toolbar 分 static + dynamic 两段;content 区只挂 active contentEl
      interactions.js  # splitter drag + corner drag(split/merge) + 3×3 hover
                       # panel drag(tab drag-out + cross-dock drop + pop-out window)
      migrate.js       # 跨窗口迁移协议(BroadcastChannel handshake + serialize/deserialize)
      layout.js        # createDockLayout 入口胶水

    style/
      dock.css         # dock / split / splitter / corner / overlay / focused / collapsed
      component.css       # toolbar / tab / error-log / panel-error
```

**`<script>` 加载顺序**(依赖自顶向下,无环):
```html
<script src="./src/core/signal.js"></script>
<script src="./src/core/errors.js"></script>
<script src="./src/core/bus.js"></script>
<script src="./src/tree/tree.js"></script>
<script src="./src/core/registry.js"></script>
<script src="./src/core/context.js"></script>
<script src="./src/dock/runtime.js"></script>
<script src="./src/dock/render.js"></script>
<script src="./src/dock/interactions.js"></script>
<script src="./src/dock/migrate.js"></script>
<script src="./src/dock/layout.js"></script>
<script src="./src/ui/panel/dock-tabs.js"></script>
<script src="./src/ui/panel/log.js"></script>
```

**行数预算**(每个文件目标上限,超了反思粒度切错没):

| 文件 | 上限 |
|---|---|
| core/signal.js | 100 |
| core/errors.js | 100 |
| core/bus.js | 80 |
| tree/tree.js | 450 |
| core/registry.js | 60 |
| core/context.js | 200 |
| components/tab.js | 300 |
| components/error-log.js | 80 |
| dock/runtime.js | 280 |
| dock/render.js | 320 |
| dock/interactions.js | 350 |
| dock/migrate.js | 150 |
| dock/layout.js | 80 |
| style/dock.css | 260 |
| style/component.css | 200 |

**编码规范(从第一行就遵守,不留债):**

- **CSS 变量前缀 `--ef-*`**:所有颜色、边距、圆角、阴影、字号、时长都走 `var(--ef-*, fallback)` 形式,第一行就开始,不要硬编码散落。这不是主题系统(框架不提供运行时 `setTheme()`),只是命名规范。默认值对齐 `doc/editor_style.html` 的调色板。分类约定:
  - `--ef-color-bg-*` / `--ef-color-fg-*` / `--ef-color-border` / `--ef-color-accent` / `--ef-color-hover` / `--ef-color-active`
  - `--ef-space-1..5`(4 / 8 / 12 / 16 / 24)
  - `--ef-radius-sm / --ef-radius-md`
  - `--ef-shadow-sm / --ef-shadow-md / --ef-shadow-lg`
  - `--ef-font-ui / --ef-font-mono`
  - `--ef-dur-fast`(80ms,hover/active)/ `--ef-dur-med`(200ms,面板过渡)
- **DOM 卫生**:
  - 每个 `.ef-dock` 元素加 `contain: layout style paint`,把布局/绘制隔离在 dock 内,外部变化不 invalidate dock 内部,dock 内部变化不冒泡出去
  - 所有可交互组件统一四态,由 CSS 变量供色:`hover` → `--ef-color-hover`,`active` → `--ef-color-active`,`focus` → `outline: 2px solid var(--ef-color-accent)`,`disabled` → `opacity: 0.38; pointer-events: none`
  - 尊重 `@media (prefers-reduced-motion: reduce)` —— 里面把所有 transition 归零
  - 禁止 `filter: drop-shadow` / `text-shadow` / `box-shadow spread > 0`,阴影只用分层预设
- **拖放视觉反馈**(§ 4.14 的视觉层规约):
  - 被拖的 tab:`opacity: 0.5`
  - 跟手 ghost:`position: fixed` + `will-change: transform` + `--ef-shadow-lg`
  - 合法 drop zone:`--ef-color-accent` 半透明蒙层;非法(被 `accept` 白名单拒):红色 1px 描边 + 禁入光标
  - 分割线 hover:`--ef-color-accent` 高亮;拖动时全局 cursor 锁定
- **不写自动化测试**:没有 vitest、没有 jest、没有 puppeteer。验证完全靠 `index.html` demo + console 断言。数据层变更通过在 demo 里临时跑几行 `console.assert` 验证;UI 变更靠肉眼 + DevTools。零构建、零依赖的承诺排除了测试框架,手动验证足够快
- **Component 引用永远是 string**:`PanelData.component` / `ToolbarItemSpec.component` 必须是已注册的名字。所有读取点统一走 `EF.resolveComponent(name)`,未注册立即 throw,不写 `typeof` 分支,不写 fallback。这是 § 4.8 的延伸编码规范

---

## 6. 实现顺序(历史档案 — 全部完成)

> ⚠ 这一节是**历史档案**,Phase 1~7 已经在用户的"Phase 1 范围就是全部实现,直接按最终版本做"指令下被一次性整体落地。当前代码状态见 § 3。本节保留原始分期文字给"想知道当初是怎么计划的"的下一个 Claude 看 —— **不要再按这个节奏重新走一遍**。

每个 Phase 结束有可验证的里程碑(原计划如下,现已全部实现):

1. **Phase 1 — 核心层(零 tree / 零 UI 改动)** ✅
   - `core/signal.js`:加 `derived`(在当前 IIFE 上扩充),其它不动
   - `core/errors.js`:全局错误系统 —— `reportError` / `safeCall` / `EF.errors` signal(**此时不挂 window 监听**,留到 layout 入口)
   - `core/bus.js`:`EF.bus` 的 on/off/emit + auto-unsubscribe 辅助(见 § 4.13)
   - `core/registry.js`:`registerComponent` / `resolveComponent` / `componentDefaults`(§ 4.8,只接 spec)
   - **此阶段不碰 `tree.js` 和 `dock.js` / `dock.css`** —— 保持现有 demo 行为完全不变
   - **也不写 `core/context.js`** —— 因为 ctx 工厂要用 tree 层的新字段(§ 4.9),留到 Phase 2b 和 dock runtime 一起做
   - 阶段验证:console 跑 `EF.signal(0)` / `EF.bus.on(...).emit(...)` / `EF.registerComponent(...)` / `EF.reportError(...)` 各一次,确认挂载正确;**现有 demo 完全不回归**(因为 tree.js / dock.js 一行没动)

2. **Phase 2a — 机械拆分(不改能力)** ✅
   - 把现有 `src/dock.js` 按边界切开成 `dock/runtime.js` / `dock/render.js` / `dock/interactions.js` / `dock/layout.js` 四个 IIFE 文件,**不引入任何新概念**(还是单 panel 模式,没有 panels[]、没有 tab、没有 toolbar、没有 LRU、没有跨 dock 拖放)
   - 把 `src/dock.css` 搬到 `src/style/dock.css`,顺手把硬编码颜色换成 `--ef-*` 变量(默认值对齐 editor_style.html)
   - HTML 按新顺序加 `<script>`
   - **阶段验证**:demo 行为必须和 Phase 2a 之前完全一致 —— keyed reconciliation、splitter 拖拽、corner split、corner merge、input/counter 状态保留全部不回归。commit 讲得清 "pure refactor, no behavior change"
   - 完成后 commit 一次,再进 2b

3. **Phase 2b — tree 层扩展 + Dock 多 panel + toolbar 两段** ✅
   - `tree/tree.js`:扩展 DockData 字段(`panels[]` / `activeId` / `toolbar` / `accept` / `collapsed` / `focused`)+ 全局 id 计数器 + 激活计数器 + 所有新纯函数(`addPanel` / `removePanel` / `activatePanel` / `movePanel` / `reorderPanel` / `updatePanel` / `promotePanel` / `updateDock` / `setCollapsed` / `setFocused` / `findPanel`),按 § 4.11 让写接口不接 id 而是返回新 id,按 § 4.12 做 accept 白名单校验,按 § 4.1 修正 `splitDock`(含空 dock + 返回 `{ tree, newDockId, newPanelId? }`),按 § 4.2 修正 `mergeDocks`(返回 `{ tree, discardedPanels }`)
   - `core/context.js`:ComponentContext 工厂 —— 暴露 `ctx.panel` / `ctx.dock` / `ctx.bus`(auto-unsub 版)/ `ctx.safeCall` / `ctx.active`(signal)。共享 / panel-only 两段按 § 4.9
   - `dock/runtime.js`:PanelRuntime 生命周期 + contentEl 懒创建 + activate 切换实现为 detach + re-attach(§ 4.3) + `ctx.active` signal 维护 + focus/collapsed/transient 状态 + LRU dispose 超出上限逻辑
   - `dock/render.js`:toolbar 两段渲染(static + dynamic)+ dock body 两段式(toolbar + content) + content 区域切 active 时的 DOM 操作 + dynamic toolbar items 的 reconciliation。替换 Phase 2a 留下的单 panel 渲染分支
   - `dock/interactions.js`:split 角拖按 § 4.1 跑 component defaults;merge 前按 § 4.2 检查 dirty;3×3 hover 保持原样
   - `dock/layout.js`:`createDockLayout` 入口对齐新 `LayoutConfig` 契约(§ 4.9 Layer 1),挂全局 `error` / `unhandledrejection` 监听一次(§ 4.7)
   - **阶段验证**:单 dock 多 panel API 切 active 无状态丢失、focus mode / collapsed API、角拖新 dock 是默认参数、merge 遇 dirty 被阻止

4. **Phase 3 — Tab Component(作为普通 toolbar 组件)** ✅
   - `components/tab.js`:单组件 + 三套预设默认 props,内部只通过 `ctx.dock.panels` / `ctx.dock.activeId` signals 和 `ctx.dock.activatePanel` / `ctx.dock.removePanel` API 工作,无特权
   - 阶段验证:三种 tab 样式都能用,collapsible 折叠正常;把同一个 tab component 当成 static item 和 dynamic item 分别验证,行为一致

5. **Phase 4 — 错误隔离 + bus 通讯** ✅
   - `components/error-log.js`:订阅 `EF.errors` 的列表 component,同时订阅 `ef:errors:new` bus topic 以便测试 bus 路径(两条数据源等价)
   - Demo 里注册一个 buggy component 抛同步错 → 只影响这个 panel
   - Demo 里注册一个 async-buggy component 用 `setTimeout(() => { throw })` 抛异步错 → global scope 兜底路由到 error-log
   - Demo 里写两个假 component 互相通过 `ctx.bus.emit('demo:ping', ...)` 通讯,验证 auto-unsubscribe:关一个 panel 后另一个 emit 不再被收

6. **Phase 5 — Panel 拖放(同窗口跨 dock)** ✅
   - `dock/interactions.js` 扩展:从 tab 按下 → 拖移 → 目标 dock hit-test(查 `accept` 白名单) → drop zone 高亮 → pointerup commit `movePanel`
   - 同 dock 内 tab reorder 作为退化场景
   - 实现上 runtime 整体从源 dock map 迁到目标 dock map,contentEl 跟着走,不调序列化
   - 阶段验证:demo 里把一个 panel 从左 dock 拖到右 dock,input 内容保留;被 `accept:['monaco']` 限制的 dock 拒收 preview panel

7. **Phase 6 — Pop out 独立窗口** ✅
   - `dock/migrate.js`:BroadcastChannel 协议 + 两阶段 handshake + `component.serialize`/`deserialize` 调用
   - `ctx.panel.popOut()` API 和拖 panel 到窗口外触发两条入口
   - Demo 里一个 component 实现 `serialize`,另一个不实现,都能成功 pop out,区别是前者状态保留、后者只有 props
   - 阶段验证:pop out 后主窗口 panel 消失,独立窗口出现;关闭独立窗口 panel 跟着消失不回流

8. **Phase 7 — Demo 收尾** ✅(实际收尾形态:`demo/components/ui-showcase.js` + `theme-config.js`,而非 fake monaco/preview/terminal —— 用户改了方向,直接做"展示完整 UI 库 + 现场调主题"的双 panel demo)
   - `index.html`:注册 monaco-fake / preview-fake / terminal-fake / buggy / error-log 等假 component
   - 多 dock 配多 panel,演示 Focus / Collapsed / Promote Transient / pop out
   - 验证 Split 克隆语义(角拖出新 dock 是默认参数的同 component)
   - 验证空 dock 也能被角拖分裂出空 dock
   - 验证关闭 active panel 后新 active 是"最近用过的"而不是邻居
   - 验证 LRU `max = 3` 时第 4 个非 dirty panel 被 dispose,状态丢失是预期的

---

## 7. 与用户协作的方式

- **用户用中文**,你也用中文回复
- **简洁优先**,不要长篇大论解释你"打算怎么做",直接给方案
- **不要在每条回复末尾总结你刚刚做了什么**,用户能看 diff
- **不要无脑同意**,有更好的方案要直说,但要给充分理由
- **拿不准就问**,用户喜欢明确的开放问题清单,不喜欢含糊的"差不多吧"
- **遇到设计冲突时,以用户已确认的为准**,即使和本文件当前文字不一致也以用户为准(然后同步回本文件)
- **每个 commit 都要 Co-Authored-By: Claude**,但不要在 commit message 里写"我"或自我吹嘘

---

## 8. 当前会话状态(2026-04-16)

> 用户在家里和公司之间切换电脑。这一节让下一个 Claude 一打开就能"接着干"。

**已完成的全部工作(按时间线)**:

**更早的会话(家里)**:
1. Demo 目录重构:单文件拆成 `demo/catalog.js` + `demo/state.js` + 5 张 panel component
2. `src/core/` 并入 `src/core/`;tab/error-log 搬到 `src/ui/panel/`
3. 修了 sidebar dock toolbar 方向、log 顶栏 Copy/Clear 不可见、bottom dock 折叠
4. 框架级 transient 预览槽语义(addPanel 自动驱逐同 dock 已有 transient)
5. 修了 Light 主题 inline 污染 bug(§ 3.3 已知坑 #2)
6. Demo 手写元素换成 ui.* 组件(ui.card / ui.tag)
7. UX 微交互全面精修(按钮/表单/overlay/tab spring 动画 + glow 焦点环)
8. showcase 加了 Tabs 分类(三种 dock tab mock)

**2026-04-16 这一轮(家里)**:
9. **修了 showcase 卡片尺寸不适配**(方案 A+B):
   - `demo/components/demo.css`:`.demo-showcase-body` 从 `grid` 改成 `flex-wrap: wrap; align-items: flex-start`,卡片按内容高度自然排列不再被同行最高卡撑开
   - `demo/catalog.js`:gradientInput / curveInput / codeInput / fileInput 四个大组件标 `stageSize: 'lg'`
   - `demo/components/showcase.js`:读 `entry.stageSize === 'lg'` 加 `.demo-showcase-card-wide` class(`flex: 1 1 280px; max-width: 420px`,默认卡片 `flex: 1 1 200px; max-width: 320px`)
   - 验证:editor 分类卡片参差排列,curveInput(h=214)不再撑高 gradientInput(h=130);form 分类 15 张小卡 3 列均匀排布

10. **审计一轮 8 处硬 bug 的"最终优雅形态"修复**(不是补丁式,是直接按应该的样子重写):
    - `src/style/ui-data.css`:`--ef-warning` → `--ef-warn`(L217/218/240)、`--ef-radius-sm` → `--ef-r-2`(L230)—— theme.css 只定义了 `--ef-warn` 和 `--ef-r-*`,老名字静默 fall back 到 initial
    - `src/dock/interactions.js`:splitter `onUp` 补 `classList.remove('ef-splitter-active')`,对齐 pointerdown 的 add
    - `src/ui/form/numberInput.js`:Escape 从"重写 txt.value + blur 触发 exitEdit(true)"改成直接 `exitEdit(false); txt.blur()`;`exitEdit(false)` 先置 `editing = false`,随后 blur 的 `exitEdit(true)` 被 `if (!editing) return` 守卫吞掉,不再虚假回写精度化的值
    - `src/ui/editor/pathInput.js`:在 hidden file input 上补 `cancel` 事件监听,cancel 和 change 都走统一 `cleanup()` 移除 DOM 节点,用户点 Cancel 不再泄漏
    - `src/core/signal.js`:提取 `teardown(eff)` 共享函数,`run` 和 `dispose` 都复用;`dispose` 加 `if (eff.disposed) return` 守卫,重复 dispose 不再重复跑 cleanups
    - `src/dock/migrate.js`:popOut 单一 cleanup 路径(ack / reject / popup-closed 三条都走同一个 `cleanup()`),加 `pollClosed = setInterval(…, 500)` 监测 popup 关闭,`clearInterval` 一并清
    - `src/ui/overlay/menu.js`:加 `openSubs[]` 跟踪,`closeSubs()` 递归关闭;sibling-row mouseenter 时关掉前一个 submenu,避免孤立子菜单
    - `src/core/context.js`:`ctx.bus` 丢弃 `off(topic, handler)` 表面,只留 `on` 返回的 disposer;disposer 幂等 + 自行从 `cleanups` 里 splice 自己,彻底防止 dispose 留 stale 条目

11. **审计二轮 5 处"架构级"统一**(同样最终形态,不妥协):
    - `src/dock/runtime.js`:新增 `layout.movePanel` 和 `layout.promotePanel` 作为 authoritative mutation —— 和已有的 `addPanel/removePanel/activatePanel` 并列。`movePanel` 自带 markActivation;所有调用点(`handle.movePanel`、`interactions.js` 拖放、`panel-drag.js`、migrate.js)统一走这条路径,markActivation 不会再被忘
    - `src/dock/layout.js`:`handle.movePanel`/`promotePanel` 瘦成 `function (…) { layout.…(…) }` 纯代理
    - `src/core/context.js`:`ctx.panel.promote()` 委派给 `layout.promotePanel`;`ctx.dock.addPanel(partial)` 返回 `{ panelId }` 对象,和 `handle.addPanel` 形状一致("一个操作一种形状")
    - `src/dock/interactions.js`:删掉内联 `treeSig.set(EF.movePanel(...)) + markActivation`,改 `layout.movePanel(panelId, resolvedDock, resolvedIndex)` 单行
    - `src/dock/migrate.js` `acceptMigration`:同理,改 `layout.addPanel(targetId, …)` 单行,不再自己 setTree+markActivation

12. **拆 `interactions.js`**(442 → 228 行,纳入 350 预算):
    - 新增 `src/dock/panel-drag.js`(234 行),装 `beginPanelDrag` + `computeTabInsertionIndex` + `makeDropIndicator` + `makeGhost`
    - `interactions.js` 只保留 splitter drag(§ 4.1)+ corner drag split/merge(§ 4.1/§ 4.2)+ helpers(`canMergeInto` / `makeMergeLabel` / `clamp`)
    - `DRAG_THRESHOLD` 最初两个文件各持一份 local const —— 被下一轮"统一配置"(item 13)清理,改为都从 `--ef-drag-threshold` 读
    - `tools/build.mjs` 的 `JS_ORDER` 把 `dock/panel-drag.js` 插到 `dock/interactions.js` 之后、`dock/migrate.js` 之前
    - preview 验证:真实 pointerdown/move/up 序列跑一遍 reorder,ghost 挂载、indicator 绘制、`layout.movePanel` 提交、pointerup 全部清理 —— 无错误;17 个 `EF._dock.*` 公共函数全部健在

13. **统一配置总线(单一存储 + 两种消费形态)** —— 把散落在 JS 里的可调常数(drag threshold、z-index 磁数、setTimeout 时长、icon 字符映射)全部迁到 `src/style/theme.css` 作为 `--ef-*` token,JS 侧只留**一条**通道读取:
    - 新增 `src/ui/_internal/_css.js`,导出唯一 JS 桥 `EF.ui.readNum(name, fallback)` —— `getComputedStyle(documentElement).getPropertyValue(name)` + `parseFloat`
    - `src/style/theme.css` Layer 3 扩 5 个 token:`--ef-drag-threshold: 6` 一个交互阈值 + `--ef-icon-info/success/warn/error` 四个 CSS 字符串(带引号,给 `content:` 用)
    - `src/style/ui-overlay.css` 加 alert/toast 的 `.ef-ui-*-icon::before { content: var(--ef-icon-<kind>) }` 规则
    - `alert.js` / `toast.js` 删掉本地 `const ICONS` 映射表,icon span 留空(只给 `aria-hidden`)由 CSS `::before` 填字符 —— 换图标集改 token 一行搞定
    - `_portal.js` / `_overlay.js` z-index 从 JS 写 hardcoded 数字改为 `style.zIndex = 'var(--ef-z-popover)'` / `'calc(var(--ef-z-popover) + ' + depth + ')'`,**计算延迟到浏览器** —— 主题改 `--ef-z-popover` 立刻生效,JS 零感知
    - `drawer.js` / `toast.js` 的 `setTimeout(..., 220)` 硬编码改 `ui.readNum('--ef-dur-slow', 240)` —— 动画时长改 theme 同步
    - `interactions.js` / `panel-drag.js` 的 DRAG_THRESHOLD 模块常数删除,改每次 drag 会话开始时 `ui.readNum('--ef-drag-threshold', 6)` 读一次存 local(不在 pointermove 内层循环里 re-read)
    - `tools/build.mjs` `JS_ORDER` 把 `ui/_internal/_css.js` 排在 Layer 5 UI internals 首位(必须先于 `_overlay.js` 等消费者)
    - preview 实测:4 个 toast kind 的 `::before` content 肉眼 + `getComputedStyle` 双验通过(ⓘ/✓/⚠/⨯);`portalRoot().style.zIndex` 内联 = `var(--ef-z-popover)`,computed = 1000;`ui.readNum('--ef-dur-slow')` = 240;控制台零报错
    - **架构意义**:单一存储(CSS tokens)+ 判据收敛(只有一个问题:"JS 要不要对这个值做运算",不做 → `var()`/`calc()`/`content: var()`,做 → `ui.readNum`)+ 零 JS 映射表 —— 换主题/换图标集/换触控尺寸,全部只改 theme.css 一份
    - **2026-04-16 晚些时候**补完 § 8 时间线(本 item)、写了项目 README.md、推 Gitee

14. **内置主题扩到三套,默认改 Godot Minimal 风**(2026-04-16 当晚):
    - 缘起:用户指出"原先 dark 主题其实带冷蓝 + 紫,叫 dark 不合适",要求按 [passivestar/godot-minimal-theme](https://github.com/passivestar/godot-minimal-theme) 的配色重做默认 dark,老默认搬到 `Dracula` 名下
    - 通过 WebFetch 直接读 `minimal_theme.tres` 拿到官方**字面值**(非主观调色):surface_base `#272727` / accent `#569eff` / warn khaki `0.83, 0.78, 0.62` / success forward+ green `0.55, 0.75, 0.39` / low-contrast 0.3–0.35 ramp luminance step
    - `src/style/theme.css` 重写:
      - `:root` 装 Godot Minimal(`--ef-c-00..11` 中性炭灰 ramp 锚 `#272727`,`--ef-c-accent: #569eff`,低对比度 + "inset input" 角色映射 `--ef-bg-2` 用 `--ef-c-01` 比 `--ef-bg-1=--ef-c-03` 更深)
      - 新增 `:root[data-ef-theme="dracula"]` 块,搬老默认的**冷调深灰 + `#7b6ef6` 紫 accent + "raised input"**(bg-2=c-03 比 bg-1=c-01 亮)+ 更强 shadow alpha
      - `:root[data-ef-theme="light"]` **显式锁定** bg-1=c-01(白)/bg-2=c-03(浅灰 inset)/border 三条角色映射 + shadow 级别 —— 因为 :root 改 "inset in dark" 后光亮 primitives 再继承会反向变成 "raised in light",必须各主题各自 lock
    - `demo/components/theme-config.js`:mode select 从 Dark/Light 两项扩成 Dark/Dracula/Light 三项;`applyThemeMode()` 改为"dark 去属性,其他全部 setAttribute"的统一写法
    - 用户明确"不需要考虑任何兼容性,直接按最好的设计来做"—— 所以 localStorage 无迁移脚本、无 version 字段,旧用户上来就是新默认 + 自动清理(modeSig 若旧值 'dark' 直接重用,否则 select 默认到 dark)
    - 验证(preview 真实点击 dropdown 三档):
      - dark(attr=null):bg1=#272727, bg2=#1a1a1a, accent=#569eff, inset 约定 OK
      - dracula(attr=dracula):bg1=#111113, bg2=#1c1c20, accent=#7b6ef6, raised 约定 OK
      - light(attr=light):bg1=#ffffff, bg2=#e6e6ec, text=#18181c, accent=#5b4ee0, inset gray 约定 OK
      - 零控制台报错;theme-config 的 refreshAll() 在 mode 切换后正确 re-pull 每个 token 到 signal,palette 面板 swatch 立刻同步
    - rebuild:`dist/ef.css` 从 ~68K → 83010 bytes(三主题块 + light 显式锁定 role 映射)
    - README.md + CLAUDE.md § 3.1 注释 + § 3.2 主题段均同步

15. **v1.1.0 — TypeConfig / propertyPanel / icon set / framework hardening**(2026-04-21):
    - 缘起:审计第三方项目 `GameDataEditor` 对库的用法(`temp/GameDataEditor/`),暴露 4 个框架级问题 + 7 个项目级错用。用户拍板把合理能力补进库、把不合理用法在项目里修掉
    - **F1 — splitter collapsed dock 挤出视口**:复盘发现是项目 `#app { height: 100vh }` 在 topbar 之下仍然占满视口,不是框架 bug。改 `#app { height: 100% }` 继承父 `.gde-body` 的高度就好。框架侧 `canCollapseDock` + `flex: 0 0 auto` 的折叠逻辑本身正确
    - **F2 — `--ef-bg-raised` + `--ef-shadow-raised` role**:补"浮起卡片"语义(一步 LIGHTER 于 dock body 的背景,配合 subtle shadow)。dark/dracula/light 三主题各显式声明。消费者:项目 `.gde-card` 一键升级
    - **F3 — SVG 图标库 + `EF.ui.registerIcon`**(方案 C):
      - 新 `src/ui/base/icon-set.js` 内嵌 Lucide ISC-licensed 精选子集 ~40 个(plus/minus/x/check/chevron-{up,down,left,right}/search/filter/folder/file/trash/edit/copy/save/refresh/arrow-{left,right}/arrow-up-down/table/database/columns/grid/list/image/music/calendar/clock/info/alert-{triangle,circle}/check-circle/help-circle/menu/more-{horizontal,vertical}/maximize/minimize/eye/eye-off/settings/user/hash/tag/link/type/palette)
      - `ui.icon({ name })` 优先 resolve 到注册的 SVG,fallback 到 `glyph` 文本(legacy),再 fallback 到把 name 自身当字符显示 —— 老代码 `ui.icon({ glyph:'＋' })` 不回归
      - `EF.ui.registerIcon(name, innerMarkup)` 允许用户覆盖 / 扩展
      - `iconButton` / `tab` component 的 icon 字段都走 name → SVG 路径;CSS `.ef-ui-icon svg { width:1em; height:1em }` + 按 size 变体 sm/md/lg 跟 `var(--ef-size-icon-*)`
    - **F4 — TypeConfig + propertyEditor + propertyPanel(核心新一等能力)**:
      - `src/ui/form/typeconfig.js`:`EF.ui.setTypeConfig(builtin, { overrides })` / `resolveType` / `resolveFieldDef` / `registerRenderer` / `getRenderer` / `listRenderKinds`。内置默认 builtin(int/float/string/struct/array/var/enum_int/enum_string/range_int/range_float/id/ref_id/color/img/snd/date/bool)
      - `src/ui/form/propertyEditor.js`:`EF.ui.propertyEditor(fieldDef, value, onChange, ctx)` 把一个字段分发到已注册 renderer。内建 14 种 renderer(input_string/textarea/input_int/input_float/range/enum/toggle/color/date/img/snd/id/ref_id/struct/array),全部复用 `EF.ui.*` 基础组件,**不写一个裸 `<input>`**
      - `src/ui/form/propertyPanel.js`:`EF.ui.propertyPanel({ schema, value, onChange, ctx })` 从 `StructDef` 自动生成一整张 "label · editor" 表单。value/schema 可以是 plain 对象也可以是 signal,内部 `EF.effect` 跟踪重建
      - CSS `.ef-ui-prop-{panel,row,label,cell,empty}` / `.ef-ui-struct-*` / `.ef-ui-array-*` 补到 ui-form.css
      - 业务项目的 450 行 `renderers.js` → 彻底作废,改用 `ui.propertyPanel` + `ui.registerRenderer` 自定义覆盖 `ref_id`(跨表跳转)就搞定
    - **F5 — 补缺组件**:
      - `ui.dateInput`:基于原生 `<input type=date>` + `.ef-ui-field` 外框,支持 value/min/max/disabled signal
      - `ui.assetPicker`:路径 input + 预览缩略图 + browse 按钮,`kind: 'image'|'audio'|'file'`,`onBrowse` hook 允许调用方接自定义 picker 对话框,缺省 fallback 到 hidden `<input type=file>`
      - `ui.numberInput` 扩展 `radix: 'dec'|'hex'|'bin'` + `percent` —— fmt/parse/commit 分支处理
      - `ui.colorInput` 扩展 `valueKind: 'hex'|'int'` —— 24-bit int(0xRRGGBB) / hex string 双模式,swatch/picker 内部统一 hex,边界翻译
    - **Framework 硬化**(发现的两个 reactive bug):
      - `EF.untracked(fn)` 新增:运行 fn 时把 `currentEffect = null`,读 signal 不会订阅外层 effect。用于"在 effect scope 里执行不应建立响应关系的代码"
      - `dock/runtime.js` 的 `materializeComponentEl` 把 `safeCall(factory)` 包在 `EF.untracked(...)` 里 —— component.factory 在 reconcile effect 内被调用,component 代码的 ctx.* 读取不应让 reconcile 订阅无关 signal,否则后续 signal.set 会引发递归 reconcile(发现时的症状:"Maximum call stack size exceeded at materializeComponentEl")
      - `core/bus.js` 的 `emit()` 把每个 handler 也包在 `untracked(...)` 里 —— bus 语义就是 fire-and-forget,handler 读 signal 不应把它订阅到上游 effect(症状:发射 'selection:changed' 的 effect 被订阅到 handler 读的 `State.gameData` 上,后续 `setEntityField` 写 gameData → 反向触发 effect 内 doWrite → onChange → setEntityField → loop)
    - `tools/build.mjs` JS_ORDER 把 `ui/base/icon-set.js` 排在 `ui/base/icon.js` 前,`ui/form/dateInput.js` 放到 colorInput 后,`ui/form/typeconfig.js`/`propertyEditor.js`/`propertyPanel.js` 放在 tab.js 后(form layer 末),`ui/editor/assetPicker.js` 放在 fileInput 后
    - README / package.json 版本 1.0.0 → 1.1.0
    - 配合 `temp/GameDataEditor/` 改造(删 gde-log → 用内置 'log' / emoji → framework icon 名 / renderers.js 瘦成 2 个工具函数 / inspector 改用 propertyPanel);自动验证点击 card → Inspector 渲染 10 个字段 iron sword 编辑器零报错

**下一步给下个 Claude 的提示**:
- 进项目第一件事:`node tools/build.mjs --watch` + `.claude/launch.json` 的 `ef-demo`(端口 5570)
- 改 `src/` 下文件**必须 rebuild**;改 `demo/` 文件只需 reload
- 用户给新需求时按 § 2.3 design-first 流程(先列计划等用户说"开始")
- 新踩的坑补到 § 3.3

**Gitee 远程**:`https://gitee.com/lazygoo/editor-frame.git`。
