# 架构改造方案 · 现成方案替换 + A2UI 预留

> 目标:一个**运行在操作系统上、可调用系统能力的通用 Agent**,同时具备
> **面向用户的高可读预览**与**面向调试的 debug 界面**。
> 原则:**能用成熟现成方案的地方尽量少自维护代码**,把精力集中在"OS 工具层 + 沙箱权限"。
>
> 本文为方向性方案 + 改造路线,不改变当前可运行版本;按阶段增量落地。

---

## 1. 背景与现状盘点

当前是一套能跑的自建实现(后端 Node/TS 单体 + 前端 React/Vite/Tailwind)。自维护代码的负担主要集中在**渲染、流式协议、provider 适配、调试**这些"本应有现成方案"的部分。

| 模块 | 行数 | 职责 | 是否该自维护 |
|---|---|---|---|
| `web/.../MessageList.tsx` | ~280 | 事件→blocks、step 分组/折叠、流式累加、final 去重、工具卡、思考面板 | ❌ 大部分可替换 |
| `web/.../App.tsx` + `api.ts` | ~185 | WS 订阅、流式增量累加、消息状态、thread 切换 | ❌ 流式/状态可替换 |
| `web/.../MarkdownContent` + `CodeBlock` | ~70 | react-markdown + react-syntax-highlighter | ❌ 有专用库 |
| `web/.../Sidebar/Composer/ChatView` | ~140 | 布局、输入、会话列表 | ⚠️ 用组件库重写 |
| `web/.../theme`、`useTheme` | ~38 | 深浅色 | ✅ 保留或换 next-themes |
| `server/.../llm/*` + `executor` + SSE | ~900 | provider 协议映射、流式 SSE、重试、工具循环、tool_call 拼装 | ❌ AI SDK 覆盖 |
| `server/.../tools/*`（shell/file/…) | ~300 | 调用系统能力 | ✅ **核心,保留** |
| `server/.../store/*`（PG thread/run/step) | ~400 | 持久化 | ✅ 保留(数据资产) |

---

## 2. 目标架构(分层 + A2UI 预留)

```
前端
├─ 渲染层(两条线,解耦)
│   ├─ 对话渲染   text / reasoning / tool   → AI Elements + Streamdown
│   └─ 声明式 UI  A2UI JSON                 → A2UI renderer + 组件 catalog
├─ 状态/流式      AI SDK useChat(UIMessage parts)
└─ 传输边界(抽象) 现 = AI SDK UI stream;预留 AG-UI

        ▲  UI message stream /(未来 AG-UI)
        ▼

后端(Node/TS 单体)
├─ Agent 引擎     AI SDK streamText + tools + stopWhen(多步)
├─ Provider       @ai-sdk/openai-compatible / openai / anthropic
├─ 工具层 ★自维护  shell(PowerShell) / file / glob / …
│                 └─ 结构化输出契约(可选返回 A2UI 描述,而非 bespoke UI)
├─ 沙箱/权限 ★自维护 进程隔离 / 资源策略
├─ 持久化 ★自维护  PostgreSQL thread/run/step,挂 onFinish
└─ 可观测          OTEL GenAI 语义约定 → Langfuse / Laminar
```

**分层要点**
- **对话层**与**声明式 UI 层**解耦:文本走 Streamdown,富交互 UI 走 A2UI renderer。
- **传输/UI 事件边界要抽象**:当前用 AI SDK 的 UI message stream;未来接 AG-UI 或直接下发 A2UI part,不重写上层。
- **工具层是唯一不外包的核心**,其输出契约要支持"结构化结果",以便将来转 A2UI。

---

## 3. 选型决策

| 关注点 | 处置 | 现成方案 | 理由 |
|---|---|---|---|
| 流式协议 / 消息状态 | 替换 | **AI SDK `useChat`**(UIMessage parts) | parts 模型自带 text/reasoning/tool 累加,`onFinish` 持久化 |
| 工具循环 / 多步 | 替换 | **AI SDK `streamText` + `tools` + `stopWhen`** | 多步、工具流式入参、错误态、`maxRetries` 内置 |
| 多 provider | 替换 | **`@ai-sdk/openai-compatible` / `openai` / `anthropic`** | 删自写协议翻译;deepseek reasoning 用 `extractReasoningMiddleware` |
| 流式 Markdown | 替换 | **Streamdown**(react-markdown drop-in) | 自动补全残缺 token、内置 Shiki/复制/行号/数学/mermaid |
| 代码高亮 | 替换 | **Shiki**(Streamdown 内置) | 移除 react-syntax-highlighter(体积大) |
| 聊天 UI 组件 | 替换 | **AI Elements** 或 **CopilotKit/assistant-ui** | 见 §5 选型;基于 shadcn/ui,copy-in 自有源码 |
| 声明式生成式 UI | 新增 | **A2UI**(renderer + 组件 catalog) | agent 主动描述富交互界面;声明式、不执行任意代码 |
| 调试 / 可观测 | 新增 | **OTEL → Langfuse / Laminar / Phoenix** | AI SDK 自带 `experimental_telemetry`,debug 界面≈零自维护 |
| 安全执行系统能力 | 评估引入 | **E2B / microsandbox / Docker 隔离** | "调系统能力"的沙箱化 |
| 组件基座 | 引入 | **shadcn/ui** | copy-in、可控;同时作为 A2UI 可信 catalog |
| OS 工具层 | **自维护** | — | 产品唯一核心价值 |
| PG 持久化 schema | **自维护** | — | 数据资产 |

---

## 4. A2UI 前瞻设计(防返工的三处轻量约束)

A2UI = Google 的**声明式、流式 JSON UI 协议**:agent 发 JSON 描述组件,客户端用**可信 catalog** 映射成原生组件,**传输无关**(A2A / AG-UI / SSE / WS)。它是"声明式生成式 UI"层,**不替代** Streamdown / AI SDK / Langfuse。

1. **渲染分两层**:preview 从一开始按 **"组件 catalog + renderer"** 搭,而非 bespoke artifact;可复用现成 React/Vue renderer。
2. **抽象传输 / UI 事件边界**:不要把 WS 消息格式写死;留出 AG-UI / A2UI-part 的接入口。
3. **可信组件 catalog + 工具结构化输出**:shadcn 组件注册成 catalog;工具除字符串外可返回结构化结果(将来转 A2UI 描述)。

### 边界接口草案(实现时遵循)

```ts
// (1) 传输边界:上层只认 UI 事件,不认具体协议
interface UiTransport {
  send(input: UserInput): void;
  subscribe(onEvent: (e: UiEvent) => void): () => void;
}
// 适配器: AiSdkTransport(现在) / AgUiTransport(未来) 实现同一接口

// (2) UI 事件:对话 part 与声明式 UI part 并存
type UiEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'reasoning'; delta: string }
  | { kind: 'tool'; id: string; name: string; input?: unknown; output?: unknown }
  | { kind: 'a2ui'; surfaceId: string; message: unknown } // A2UI JSON 直送 renderer
  | { kind: 'final' } | { kind: 'error'; message: string };

// (3) 可信组件 catalog:A2UI 类型 → 你的实现
const catalog = { Card, Button, Form, Table, Chart, Preview /* … */ };

// (4) 工具结构化输出契约
interface ToolResult {
  text: string;            // 给 LLM / 纯文本展示
  display?: { type: 'a2ui'; message: unknown } | { type: 'markdown'; text: string };
}
```

---

## 5. 前端库选型(取决于 A2UI 是否 near-certain)

| 场景 | 推荐 |
|---|---|
| A2UI 是明确未来 | **CopilotKit(AG-UI)** 或 **assistant-ui**——覆盖生成式 UI 三模式(Controlled→AG-UI、Declarative→A2UI、Open-ended→MCP),与 A2UI 路线对齐 |
| 仅需高质量对话渲染、最少锁定 | **AI Elements + Streamdown** + shadcn/ui(copy-in) |
| 纯文本/代码渲染 | **Streamdown**(无论选哪条线都用它) |

> 锁定提示:AI SDK / AI Elements 是软锁定(MIT、provider 无关、纯 Node/Vite 可用,不绑 Next/Vercel 部署)。OTEL 可观测层用标准协议,backend 可随时切换。

---

## 6. 改造路线(按 ROI 排序,增量、可回退)

> 每个阶段独立可交付、不阻塞当前可运行版本。

### Phase 0 — 抽象边界(地基,~0.5d)
- **动作**:在前端引入 `UiTransport` 接口,把现有 WS 逻辑包成 `LegacyTransport` 实现它;UI 只依赖 `UiEvent`。
- **产出**:上层渲染与传输解耦。
- **验收**:现有功能不变,`MessageList` 不再直接碰 WS。
- **风险**:低。

### Phase 1 — 文本/代码渲染替换为 Streamdown(收益最大、风险最低,~0.5d)
- **动作**:用 **Streamdown** 替换 `MarkdownContent` + `CodeBlock`;移除 react-markdown / react-syntax-highlighter。
- **产出**:删 ~70 行 + 两个重依赖;残缺 token 流式更稳、Shiki 高亮、数学/mermaid。
- **验收**:代码块高亮/行号/复制/限高滚动正常;流式中途不闪烁。
- **风险**:低(后端不动)。

### Phase 2 — 后端接 AI SDK(删自写 provider/SSE/重试/工具拼装,~1–2d)
- **动作**:`streamText` + 把 `shell/file/…` 注册为 AI SDK `tool({inputSchema, execute})`,`toUIMessageStreamResponse()` 输出;`@ai-sdk/openai-compatible` 接 tencentmaas;deepseek reasoning 加 `extractReasoningMiddleware`。
- **产出**:删 ~900 行 `llm/*` + SSE + 重试 + tool_call 拼装。
- **保留**:工具实现、PG 持久化(挂 `onFinish` / OTEL)、thread/run/step。
- **验收**:多步工具任务、流式、reasoning、重试均等价或更好;PG 落库不变。
- **风险**:中(核心链路);先在分支灰度,保留旧 executor 可回退。

### Phase 3 — 前端换 useChat + AI Elements(删渲染自建逻辑,~1–2d)
- **动作**:`useChat` 管消息/流式;parts 渲染用 AI Elements(text/reasoning/tool);保留 thread 侧栏与 PG 恢复;深浅色沿用。
- **产出**:删 `api.ts` 累加 + `MessageList` 的 blocks/累加/去重。
- **验收**:step/tool/reasoning/流式 Markdown 全部对齐现状或更好。
- **风险**:中。

### Phase 4 — 接入可观测/debug(~0.5–1d)
- **动作**:后端开 AI SDK `experimental_telemetry`(OTEL GenAI);部署 **Langfuse**(prompt 迭代)或 **Laminar**(调 agent)docker/helm;debug 面板额外渲染原始 A2UI/parts JSON。
- **产出**:面向调试的 debug 界面,≈零自维护。
- **验收**:能看到 `invoke_agent→chat/execute_tool` span、token、tool I/O。
- **风险**:低。

### Phase 5 — 声明式 UI / A2UI(按需,~按场景)
- **动作**:落 §4 的组件 catalog + A2UI renderer(优先用现成 React renderer);工具结构化输出转 A2UI;评估以 AG-UI 为传输 spine(CopilotKit 桥接 AI SDK)。
- **产出**:agent 可主动渲染表单/卡片/图表/可交互预览。
- **验收**:agent 输出 A2UI JSON → 安全映射到 catalog 渲染。
- **风险**:中(协议仍演进中,v1.0 candidate);先小范围试点。

### Phase 6 — 沙箱/权限强化(贯穿,核心)
- **动作**:OS 工具执行加隔离(E2B / microsandbox / Docker)与资源/工具策略(可参考 corint-cognition 的 data-permission/tool-policy 思路)。
- **产出**:"安全调系统能力"的可信边界。
- **风险**:中高;与产品安全目标强相关,优先级随暴露面提升。

---

## 7. 该自维护 vs 可外包

| 自维护(核心资产) | 可用现成方案(少维护) |
|---|---|
| OS 系统能力工具层 | 流式协议 / 工具循环(AI SDK) |
| 沙箱 / 权限 / 工具策略 | 对话渲染(AI Elements / Streamdown) |
| PG thread/run/step schema | 声明式 UI(A2UI renderer) |
| 产品级编排与业务逻辑 | 可观测 / debug(Langfuse / Laminar / OTEL) |
|  | 组件基座(shadcn/ui) |

---

## 8. 风险与锁定

- **AI SDK 软锁定**:MIT、provider 无关、纯 Node/Vite 可用;可接受。
- **A2UI 尚在演进**(v1.0 candidate):Phase 5 先试点,不作硬依赖;靠边界抽象隔离。
- **可观测用 OTEL 标准**:backend 可随时在 Langfuse/Laminar/Phoenix 间切换,无 re-instrument。
- **迁移风险**:Phase 2/3 走分支灰度 + 保留旧实现可回退;每阶段独立验收。

---

## 9. 参考

- AI SDK：<https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat> · <https://vercel.com/blog/ai-sdk-6>
- AI Elements：<https://elements.ai-sdk.dev/>
- Streamdown：<https://streamdown.ai/> · <https://github.com/vercel/streamdown>
- assistant-ui / CopilotKit 生成式 UI：<https://github.com/CopilotKit/generative-ui>
- A2UI：<https://a2ui.org/specification/v1.0-a2ui/> · <https://github.com/google/a2ui>
- AG-UI + A2UI 实战：<https://dev.to/copilotkit/a2ui-in-practice-build-agent-to-user-interfaces-using-a2a-ag-ui-3ng5>
- 可观测：Langfuse <https://github.com/langfuse/langfuse> · Laminar <https://laminar.sh/> · OTEL GenAI <https://opentelemetry.io/blog/2026/genai-observability/>
