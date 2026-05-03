# AI Target System

EditorFrame 的 AI 集成不应该绑定某个具体编辑器。框架只定义“用户正在指向什么、想把什么交给 AI”的通用协议；GameDataEditor、动画编辑器、材质编辑器等项目把自己的对象注册进来。

## Goals

- **精准**: AI 收到的是稳定 URI 和可解析上下文，而不是一段模糊文字。
- **可落地**: 每个 Target 都能被资源 resolver 读取，也能和工具调用、patch 预览、审批流程衔接。
- **跨编辑器通用**: 表格行、属性字段、动画 track、关键帧、UV 顶点、图片资源、场景节点都走同一套协议。
- **低耦合**: UI 面板只声明“这个 DOM 对应哪个 Target”；聊天框只接收 Target；AI runtime 只解析 resource/tool/skill。
- **安全**: Target 只提供定位和上下文，不直接执行修改。修改必须通过工具、预览和权限策略。

## Core Model

```js
{
  uri: 'gde://entity/data/items/1001',
  kind: 'gde.entity',
  title: 'items / Iron Sword',
  summary: 'Weapon item, level 3, price 120',
  resolver: 'gde',
  meta: {
    table: 'data/items',
    id: '1001'
  },
  capabilities: ['read', 'patch', 'references'],
  tools: ['gde.getEntity', 'gde.proposePatch', 'gde.applyPatch']
}
```

`uri` 是唯一身份。`resolver` 决定如何把 Target 解析成 AI 上下文。`tools` 是提示模型优先使用哪些工具，不是权限豁免。

## Framework API

### Target Registry

```js
EF.ai.registerTargetProvider('gde', {
  match(source, ctx) { return true },
  capture(source, ctx) { return targetOrTargets }
})

EF.ai.captureTarget(source, ctx)
EF.ai.normalizeTarget(target)
EF.ai.addTarget(target)
EF.ai.attachTargetToAgent(agentId, target)
EF.ai.attachTargetsToAgent(agentId, targets)
```

Provider 负责把项目层对象、DOM、selection 或事件转换为 Target。框架不理解业务对象。

### DOM Binding

```js
EF.ai.bindTarget(el, () => ({
  uri: 'gde://field/data/items/1001/price',
  kind: 'gde.field',
  title: 'price of Iron Sword',
  resolver: 'gde'
}), {
  draggable: true,
  contextMenu: true
})
```

绑定后 DOM 可以拖到 AI Chat。开启 `contextMenu` 时，框架提供通用的 `Attach to AI` 和 `Ask AI` 入口；项目仍可以继续提供自己的右键菜单。

### Drop Targets

```js
EF.ai.installTargetDrop(composerEl, {
  onDrop(targets) {
    EF.ai.attachTargetsToAgent(EF.ai.activeAgentId(), targets)
  }
})
```

框架标准 MIME:

- `application/x-ef-ai-target`
- `application/x-ef-ai-target-list`

## Runtime Context Injection

Agent request 中的 `contextRefs` 会被 resolver 解析，并自动插入一条 system context 消息。模型会看到：

- 资源列表摘要
- 每个资源的 `uri/kind/title/summary/meta`
- resolver 返回的结构化 payload 摘要

完整数据仍然优先通过工具读取。system context 只用于定位和决策，避免一次性塞入大表。

## GameDataEditor Targets

| Kind | URI | Resolver | Primary Tools |
|---|---|---|---|
| `gde.project` | `gde://project` | `gde` | `gde.getProjectSummary` |
| `gde.type_config` | `gde://type-config` | `gde` | `gde.getTypeConfig` |
| `gde.table` | `gde://table/<pathKey>` | `gde` | `gde.getTableSchema`, `gde.queryRows` |
| `gde.entity` | `gde://entity/<pathKey>/<id>` | `gde` | `gde.getEntity`, `gde.proposePatch` |
| `gde.field` | `gde://field/<pathKey>/<id>/<field>` | `gde` | `gde.getField`, `gde.proposePatch` |
| `gde.asset` | `gde://asset/<asset-path>` | `gde` | `gde.findAssetReferences` |
| `gde.asset_folder` | `gde://asset-folder/<dir>` | `gde` | `gde.findAssetReferences` |
| `gde.card_style` | `gde://card-style/<key>` | `gde` | `gde.getCardStyle`, `gde.proposePatch` |
| `gde.selection` | `gde://selection/current` | `gde` | selected target tools |

Selection target should expand to concrete entity/field/asset/card-style refs whenever possible. `gde.selection` is only a fallback for complex multi-selection.

## Animation / Visual Editor Example

An animation editor can define:

- `anim.clip`: `anim://clip/<clipId>`
- `anim.track`: `anim://track/<clipId>/<trackId>`
- `anim.keyframe`: `anim://keyframe/<clipId>/<trackId>/<time>`
- `anim.sprite`: `asset://...`
- `mesh.vertex_selection`: `mesh://selection/<meshId>/<selectionId>`

The AI does not mutate the editor directly. It calls project tools such as `anim.proposePatch`, `anim.applyPatch`, `asset.generateImage`, `mesh.updateVertices`. Those tools return previews first when they affect user data.

## UX Contract

- Anything AI-addressable should be draggable to AI Chat.
- Right-click menu should include AI actions only where they are relevant.
- Context chips must show `kind + title`, removable by one click.
- Sending a message with pending targets attaches them to the active agent and includes them in that turn.
- Large targets should be summarized; AI can call tools for full data.

## Implementation Phases

1. Framework target protocol and drag/drop utilities.
2. Runtime context injection from resources into provider messages.
3. AI Chat context tray accepts Target drops and sends them with the next message.
4. GDE target helpers for table/entity/field/asset/card-style/selection.
5. GDE panel integration: table cards, asset browser actions, selection helpers.
6. Project-specific plugins can register additional target providers, tools, skills, and resource resolvers.

