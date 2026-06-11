# Phase 0 实施日志 · 抽象传输边界

> 对应 [refactor-plan.md](../refactor-plan.md) §6 Phase 0。
> 日期:2026-06-11 · 状态:✅ 完成

## 目标

在前端引入 `UiTransport` 接口,把现有 WS/REST 逻辑包成 `LegacyTransport`;
上层渲染只依赖归一化的 `UiEvent`,与具体传输协议解耦。为后续接入
AI SDK UI stream / AG-UI / A2UI part 预留唯一切换点。

## 改动

新增:

- [web/src/transport/types.ts](../../web/src/transport/types.ts)
  - `UserInput` —— 用户提交的一轮输入(对象形态,便于以后加附件等字段)。
  - `UiEvent` —— 渲染层消费的归一化事件联合,与线缆格式无关:
    `step_start | reasoning | text | tool | a2ui | final | error`。
    保留 `step`(引擎多步、UI 按 step 分组);`tool` 事件可带 `input`(调用)
    和/或 `output`(结果),由渲染层按 `id` 合并。`a2ui` 变体为 Phase 5 预留,
    现在即写入契约,避免日后改动边界。
  - `UiTransport` —— `send(threadId, input)` 启动一次 run、`subscribe(runId, …)`
    流式订阅 `UiEvent`;上层看不到底层 REST/WS。
- [web/src/transport/legacy.ts](../../web/src/transport/legacy.ts)
  - `toUiEvent(AgentEvent): UiEvent` —— 唯一知道旧 `AgentEvent` 线缆格式的地方;
    同时供历史 run(REST 拉取)做同样的归一化。
  - `legacyTransport` —— 用现有 `startRun` + `subscribeRun` 实现 `UiTransport`。

修改:

- [web/src/App.tsx](../../web/src/App.tsx)
  - 用 `transport.send` / `transport.subscribe` 取代直接调用 `startRun` /
    `subscribeRun`;顶部声明 `const transport = legacyTransport`,这是切换协议的
    唯一改动点。
  - `runsToTurns` 用 `toUiEvent` 归一化历史事件;`appendEvent` / 错误事件改用
    `UiEvent`(`kind` 字段)。
- [web/src/components/MessageList.tsx](../../web/src/components/MessageList.tsx)
  - `Turn.events`、`buildBlocks`、`StepGroup`、`TurnView` 全部改吃 `UiEvent`;
    `switch (e.type)` → `switch (e.kind)`;`tool` 事件按 `id` 合并 input/output
    (等价旧的 tool_call/tool_result 在位合并);`a2ui` 暂忽略(无 renderer)。

> 说明:`web/src/api.ts` 仍保留 `AgentEvent` 与 `startRun`/`subscribeRun` 作为
> **底层线缆客户端**,仅由 `transport/legacy.ts` 引用;上层不再直接依赖。

## 验收

- `tsc -b`:通过。
- `vite build`:通过(产物 976 kB,react-syntax-highlighter 占大头,Phase 1 解决)。
- 现有功能不变:事件→blocks、step 分组/折叠、流式累加、工具卡、思考面板、
  历史会话恢复均沿用同一渲染路径,仅事件来源从 `AgentEvent` 换为等价的 `UiEvent`。

## 后续

- 切换传输时,只需替换 `App.tsx` 顶部的 `transport` 与新增一个实现 `UiTransport`
  的适配器,渲染层零改动。
- `UiEvent.a2ui` 已在契约内,Phase 5 落 renderer 时无需改边界。
