# Phase 5 实施日志 · 声明式 UI / A2UI(只读)

> 对应 [refactor-plan.md](../refactor-plan.md) §6 Phase 5 + §4。
> 日期:2026-06-11 · 状态:Stage 3(前端 renderer)✅ / Stage 4(后端产出)见后续追加

## 目标

agent 用 **A2UI 风格 JSON** 声明富展示界面,前端用**自有 renderer + shadcn 可信
catalog** 安全渲染(声明式数据,不执行任意代码)。本轮**只读展示型**。

## 设计

- A2UI 消息为**扁平组件表 + 数据模型**:组件以 id 互相引用(adjacency list),
  属性可为字面量或 `{ path }` JSON Pointer 绑定。对齐 A2UI v0.9 的精简子集。
- 承载:复用 Phase 0 `UiEvent.a2ui` + AI SDK **data part**。`a2ui` 事件 →
  `{ type:'data-a2ui', id: surfaceId, data: message }` 分片(按 surfaceId 原地更新),
  在 `message.parts` 中以同形 data part 出现 → 交给 A2UI renderer。

## Stage 3 改动(web,前端先行;后端 Stage 4)

新增 `web/src/a2ui/`:

- [types.ts](../../web/src/a2ui/types.ts) —— `A2uiMessage { surfaceId, root, components, dataModel }`、
  `A2uiComponent { id, component, child?, children?, [prop] }`、`A2uiValue<T> = T | { path }`
  (前后端镜像)。
- [pointer.ts](../../web/src/a2ui/pointer.ts) —— RFC6901 `resolvePointer` + `resolveValue` /
  `resolveString`(字面量或 `{path}` 绑定)。
- [catalog.tsx](../../web/src/a2ui/catalog.tsx) —— **可信 catalog**:`renderNode` 把组件类型映射到
  shadcn:`Card/Column/Row/Stack/Text/Heading/Badge/Divider/Image/CodeBlock/Markdown/KeyValue/Table`;
  未知类型 → 降级占位(安全)。深度上限防御。
- [A2uiSurface.tsx](../../web/src/a2ui/A2uiSurface.tsx) —— 按 id 建索引,从 `root` 递归渲染,
  环引用守卫。

接 `data-a2ui` 分片:

- [transport/aiSdkChat.ts](../../web/src/transport/aiSdkChat.ts):`uiEventStreamToChunks` 的
  `a2ui` 分支 → `data-a2ui` 分片(id=surfaceId)。
- [history.ts](../../web/src/history.ts):`foldUiEventsToParts` 的 `a2ui` → 同形 data part(历史恢复)。
- [components/Conversation.tsx](../../web/src/components/Conversation.tsx):`PartView` 增
  `data-a2ui` → `<A2uiSurface message={part.data}/>`。

## 验收(Stage 3)

- `tsc -b` + `vite build`:绿。
- SSR `renderToStaticMarkup(<A2uiSurface message={mock}/>)`:Card 标题、`{path:/user/name}`
  绑定(Alice)、绑定数组 `/rows` 的 Table、Badge、未知组件降级 —— 全部正确。
- 配线冒烟:`a2ui` 事件经流转出 `start data-a2ui#s1 finish`;历史折叠出 `data-a2ui` + text part。

## 后续(Stage 4 — 后端产出)

- server `AgentEvent` 加 `a2ui`;工具结果契约 `{ text, display }`;`render_ui` 工具;
  executor 在 tool_result 外额外 emit `a2ui` 事件;前端 `api.ts`/`legacy.ts` 镜像。
