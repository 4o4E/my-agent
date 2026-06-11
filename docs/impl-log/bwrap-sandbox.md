# bwrap 沙箱实施日志

> 对应 [tool-sandbox.md](../tool-sandbox.md) 阶段 B。日期:2026-06-11。

## 目标

把 `shell` 工具的子进程放进可插拔沙箱后端。默认仍保持原行为;当
`TOOL_SANDBOX=enforce` 且后端选择 bwrap 时,由 OS 层限制 shell 可见文件范围、
可执行命令和网络命名空间。

## 原逻辑

- `shell` 工具直接执行宿主 `/bin/sh -c <command>`。
- Phase 6 策略层只在 `registry.runTool` 前做应用层准入,能挡明显危险命令和越界 fs
  工具参数,但不能约束 shell 子进程真实可见的宿主文件系统。

## 已完成改动

1. 新增 `TOOL_SANDBOX_BACKEND`: `auto` / `none` / `bwrap`。`auto` 会探测 bwrap
   是否能实际启动沙箱,探测失败时直通并告警;`bwrap` 为强制模式,不可用时直接失败。
2. 新增 shell bwrap 后端:
   - 工作区用可写 bind mount 投射;
   - 动态库目录只读投射;
   - shell 与白名单命令逐个只读投射;
   - 默认隔离网络,需要时再显式共享网络。
3. `shell` 工具统一经后端执行;默认 `TOOL_SANDBOX=off` 仍直通宿主。
4. 新增 `SHELL_ALLOW_COMMANDS` 和 `SHELL_SHARE_NET`:
   - `SHELL_ALLOW_COMMANDS` 控制 bwrap 内可见的外部命令;
   - `SHELL_SHARE_NET=false` 时不共享宿主网络命名空间。
5. 补单测覆盖可执行文件解析、bwrap 参数生成、命令白名单解析和后端描述。

## 验收结果

- `cd server && npm run typecheck`:通过。
- `cd server && npm test`:通过,54/54。
- 本机 bwrap 冒烟:
  - `TOOL_SANDBOX_BACKEND=bwrap` 强制模式下,bwrap 启动失败:
    `Failed to make / slave: Permission denied`。
  - 原因是当前宿主/容器不允许 bwrap 创建所需 namespace/mount,不是应用参数生成失败。
  - `TOOL_SANDBOX_BACKEND=auto` 会探测到该限制,告警后回落到宿主 shell,避免默认把
    shell 工具变成不可用。

## 后续验证

在允许 bwrap 启动 namespace 的 Linux 宿主上补真实强制模式验收:

- 工作区内 `pwd && cat package.json` 可执行。
- 工作区外文件不可见。
- `SHELL_ALLOW_COMMANDS` 之外的外部命令返回 `command not found`。
- 默认不共享网络;`SHELL_SHARE_NET=true` 时网络按预期恢复。
