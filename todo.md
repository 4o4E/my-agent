# TODO

本文记录当前项目对照 Cloud Agent Platform 题面后，仍需要补全或优化的能力。

优先级按当前提交节奏调整：明天 10 点前不优先做队列/worker、per-run 沙箱和资源配额这类平台级重构；这些能力正确但复杂度高，临近提交强行引入风险大。当前优先补齐能提升演示可信度、长任务稳定性和代码闭环质量的中小改动。

## P0：提交前优先完成

### 1. 支持 run 暂停、等待用户回答、恢复执行

现状：

- `ask_user` 工具只是返回“已向用户提问”，不会真正暂停 run 等用户输入。

要做：

- 新增 run 状态，例如 `waiting_for_user`。
- `ask_user` 触发事件后暂停 executor。
- 前端提供回答入口。
- 用户回答后写入 message / event，并恢复同一个 run。
- 超时未回答时支持取消或让 agent 按默认假设继续。

为什么：

- 真实任务常会遇到权限、歧义、危险操作确认。平台需要明确“问用户”和“自主继续”的边界。

### 2. 增加崩溃恢复和中断续跑

现状：

- 事件、消息、run 状态会落库。
- server 重启后不会自动恢复正在执行的 run。

要做：

- executor 每个 step 后记录可恢复检查点。
- worker 启动时扫描异常中断 run。
- 支持从最近完整 step 重建上下文并继续。
- 对正在执行的工具调用，按超时或 worker lease 失效处理。

为什么：

- 云端长任务不能因为进程重启直接丢执行能力。即使数据不丢，也需要恢复任务推进。

### 3. 增加无进展检测

现状：

- `hardStepCap` 只作为兜底。
- 没有检测重复工具调用、重复失败、空转 reasoning 或无有效状态变化。

要做：

- 记录最近 N 次 tool name + args + result 摘要。
- 检测重复调用、重复报错、空内容循环。
- 触发时让 agent 总结当前阻塞点，必要时进入 `waiting_for_user` 或失败退出。

为什么：

- 自主循环需要防止花费大量 token 和时间原地打转。

### 4. 实现 L3 锚定摘要

现状：

- 已有 Goal 锚点、L1 observation masking、L2 sliding window。
- `summarized` 标记已预留，但尚未真正生成 L3 摘要。

要做：

- 当 masking 和 sliding window 仍不足时，调用 LLM 生成锚定摘要。
- 摘要必须保留 intent、plan、decisions、next、关键文件路径、错误信息和已完成动作。
- 原始 messages 保留，LLM 视图使用 summary 替换旧区间。

为什么：

- 更长任务中，仅 masking 和窗口截断可能导致历史技术细节丢失。

### 5. 优化上下文预算和模型窗口配置

现状：

- 通过 `LLM_CONTEXT_BUDGET` 和估算比例控制上下文。
- 未按不同模型自动适配窗口大小。

要做：

- 为常用模型配置上下文窗口和建议预算。
- 根据 provider usage 校准 token 估算。
- 在 event 中展示压缩前后 token 估算和原因。

为什么：

- 不同模型窗口差异很大，统一预算容易过保守或过冒险。

## P1：提交前补强文档和验收

### 6. 修正文档和配置漂移

现状：

- README 已拆分出系统设计文档。
- `.env.example` 中仍可能存在旧配置口径，需要持续对齐代码。

要做：

- 对齐 `LLM_PROVIDER=aisdk`、`AGENT_HARD_STEP_CAP`、`TOOL_MAX_OUTPUT` 等当前代码默认值。
- 删除或标注 legacy provider 的定位。
- 在 `docs/system-design.md` 中保持“当前实现”和“后续规划”边界清晰。

为什么：

- 交付题目时，文档不一致会降低可信度。

### 7. 补一份题面导向的验收报告

要做：

- 按题面四个重点写验收文档：
  - Agent 编排与调度。
  - 沙箱与隔离执行。
  - LLM 集成与工具调用。
  - 整体架构与可扩展性。
- 每项列出已完成、未完成、演示方式和后续计划。
- 给出一条可复现 demo 任务，例如“读取仓库、找出 TODO、生成报告”。

为什么：

- 题面提交形式不限，验收报告能让评审快速理解项目完成度和设计取舍。

## P2：提交后平台化能力

### 8. 引入任务队列和 worker 调度

现状：

- run 由 HTTP 请求直接创建后，在当前 server 进程内 `fire-and-forget` 执行。
- 没有独立队列、worker、租约、心跳、失败重试和重启续跑。

要做：

- 将 `runs` 表作为持久化任务队列，或新增独立 queue 表。
- worker 通过状态和 lease 拉取 `pending` run。
- 增加 worker 心跳、超时回收、失败重试和最大重试次数。
- 服务启动时恢复卡在 `running` / `canceling` 的 run。
- 保证同一个 run 不会被多个 worker 同时执行。

为什么：

- 题面重点是“Agent 编排与调度”。当前实现更像单机原型，不足以证明完整云端平台调度能力。

### 9. 做到 per-run 隔离工作区

现状：

- 当前工具策略依赖全局 `TOOL_WORKSPACE_ROOT`。
- shell 可选 bwrap 沙箱，但默认关闭；`auto` 模式在 bwrap 不可用时会回落宿主执行。
- workspace 生命周期没有按 run 管理。

要做：

- 每个 run 创建独立 workspace，例如 `workspace/runs/<runId>/`。
- 文件工具和 shell 工具统一绑定到该 run workspace。
- run 完成后保留 artifact 索引，可配置清理策略。
- 明确上传文件、clone 仓库、生成报告等都落在 run workspace 内。
- 在 Linux 环境完成 `TOOL_SANDBOX=enforce + TOOL_SANDBOX_BACKEND=bwrap` 的真实验收。

为什么：

- 题面要求“云端隔离环境中执行”。这个方向正确，但临近提交不适合强行引入 workspace 生命周期重构。

### 10. 资源限制和执行保护

现状：

- 有工具超时和输出截断。
- 没有 CPU、内存、进程数、磁盘、网络等 run 级资源配额。

要做：

- 为 shell 子进程增加 CPU 时间、内存、进程数和最大输出限制。
- 为 run workspace 增加磁盘配额或软限制。
- 为网络访问增加开关和可选 allowlist。
- 对长时间无输出或重复失败的工具调用做熔断。
- 将资源超限写入 event，便于前端展示和后续审计。

为什么：

- 自主 agent 会执行未知命令，云端平台必须控制爆炸半径；但资源治理涉及宿主和部署环境，适合提交后集中做。

## P3：安全、多租户和审计

### 11. 增加鉴权和用户隔离

现状：

- API 没有用户身份和权限控制。
- thread、run、workspace 没有 owner 概念。

要做：

- 增加 users / projects / memberships 等基础模型。
- API 支持 JWT 或 API token。
- thread、run、workspace、settings 绑定 owner 或 project。
- 前端按当前用户展示自己的 thread 和 run。

为什么：

- “Cloud Platform” 默认是多用户系统。没有鉴权只能作为本地单用户 demo。

### 12. 增加工具策略审计

现状：

- 工具调用经过 policy，但策略决策没有完整审计字段。

要做：

- event 中记录工具是否被允许、拒绝原因、命中策略、输出截断信息。
- OpenTelemetry span 中写入 tool policy 属性。
- 后台或调试视图展示每次工具调用的安全决策。

为什么：

- 调试 agent 行为和排查安全问题时，需要知道“为什么这个工具能执行或被拦截”。
