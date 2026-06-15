import type { Tool, ToolRunContext } from './types.js';
import { formatCommandResult, parseShellActor, parseWaitMode, shellManager } from '../shell/manager.js';
import { shellBus } from '../shell/bus.js';
import { store } from '../store/index.js';
import { requiresDatabaseAccess } from './databaseAccessGuard.js';

function requireShellContext(ctx: ToolRunContext | undefined): { threadId: string; runId?: string; stepId?: string; step?: number } {
  if (!ctx?.threadId) throw new Error('托管 shell 需要当前 threadId，上下文缺失。');
  return { threadId: ctx.threadId, runId: ctx.runId, stepId: ctx.stepId, step: ctx.step };
}

function numberArg(value: unknown, fallback: number | null = null): number | null {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function boolArg(value: unknown): boolean {
  return value === true || value === 'true';
}

export const shellSessionOpenTool: Tool = {
  name: 'shell_session_open',
  description: '创建一个托管 shell session。后续用 shell_exec 在该 session 中执行命令；session 默认绑定当前 thread 和 workspace，可跨 run 复用。',
  parameters: {
    type: 'object',
    properties: {
      pinned: { type: 'boolean', description: '是否固定该 session，固定后 run 取消不会关闭 session。' },
      ttl_ms: { type: 'number', description: '空闲回收时间，单位毫秒；默认 30 分钟。' },
    },
  },
  async run(args, ctx) {
    const settings = ctx?.settings;
    if (!settings) throw new Error('缺少工具配置');
    const shellCtx = requireShellContext(ctx);
    const session = await shellManager.openSession({
      threadId: shellCtx.threadId,
      settings,
      runId: shellCtx.runId,
      pinned: boolArg(args.pinned),
      ttlMs: numberArg(args.ttl_ms, null),
      step: shellCtx.step,
    });
    return `已创建 shell session：${session.id}\nworkspace: ${session.workspace_root}\nbackend: ${session.backend}`;
  },
};

export const shellSessionReuseTool: Tool = {
  name: 'shell_session_reuse',
  description: '复用当前 thread/workspace 下已有的托管 shell session；没有可用 session 时会创建一个。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '指定要复用的 session id；不填则自动选择当前 thread 下可用 session。' },
    },
  },
  async run(args, ctx) {
    const settings = ctx?.settings;
    if (!settings) throw new Error('缺少工具配置');
    const shellCtx = requireShellContext(ctx);
    const session = await shellManager.reuseSession({
      threadId: shellCtx.threadId,
      settings,
      runId: shellCtx.runId,
      step: shellCtx.step,
      sessionId: typeof args.sessionId === 'string' && args.sessionId.trim() ? args.sessionId.trim() : undefined,
    });
    return `可用 shell session：${session.id}\nstatus: ${session.status}\nworkspace: ${session.workspace_root}\nbackend: ${session.backend}`;
  },
};

export const shellSessionListTool: Tool = {
  name: 'shell_session_list',
  description: '列出当前 thread/workspace 下的托管 shell session 和最近命令。',
  parameters: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const settings = ctx?.settings;
    if (!settings) throw new Error('缺少工具配置');
    const shellCtx = requireShellContext(ctx);
    const sessions = await shellManager.listSessions(shellCtx.threadId, settings);
    if (!sessions.length) return '当前 thread 没有可用 shell session。';
    const lines: string[] = [];
    for (const session of sessions) {
      const commands = await store.listShellCommandsBySession(session.id, 3);
      lines.push(`- ${session.id} status=${session.status} lease=${session.lease_actor ?? 'none'} pinned=${session.pinned}`);
      for (const cmd of commands) lines.push(`  - ${cmd.id} ${cmd.status} ${cmd.command.slice(0, 120)}`);
    }
    return lines.join('\n');
  },
};

export const shellExecTool: Tool = {
  name: 'shell_exec',
  description:
    '在托管 shell session 中执行命令。wait=foreground 时等待完成或等待超时；wait=background 时立即返回 commandId，后续用 shell_poll 查看进度。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'shell session id。可先调用 shell_session_reuse 获取。' },
      command: { type: 'string', description: '要执行的 shell 命令。' },
      wait: { type: 'string', enum: ['foreground', 'background'], description: 'foreground=等待完成；background=后台运行。' },
      timeout_ms: { type: 'number', description: 'foreground 最多等待多久；超时后命令继续后台运行。默认 60000。' },
      soft_timeout_ms: { type: 'number', description: '软超时；到点提示但不终止。默认 10 分钟。' },
      hard_timeout_ms: { type: 'number', description: '硬超时；到点终止。默认 30 分钟。' },
    },
    required: ['sessionId', 'command'],
  },
  async run(args, ctx) {
    const settings = ctx?.settings;
    if (!settings) throw new Error('缺少工具配置');
    const command = String(args.command ?? '');
    if (requiresDatabaseAccess(command) && !ctx?.env?.DB_WORKLOAD_TOKEN) {
      return '数据库 CLI 或 database-access SDK 脚本需要先激活 database-access skill，由本次 run 的 workload token 换取短期凭证；不要跨 run 复用旧凭证。';
    }
    const shellCtx = requireShellContext(ctx);
    const result = await shellManager.exec({
      sessionId: String(args.sessionId ?? '').trim(),
      command,
      settings,
      context: shellCtx,
      waitMode: parseWaitMode(args.wait),
      waitTimeoutMs: numberArg(args.timeout_ms, null) ?? undefined,
      softTimeoutMs: numberArg(args.soft_timeout_ms, null),
      hardTimeoutMs: numberArg(args.hard_timeout_ms, null),
      actor: parseShellActor(args.actor),
      env: ctx?.env,
    });
    return formatCommandResult(result);
  },
};

export const shellPollTool: Tool = {
  name: 'shell_poll',
  description: '查看 shell session 或 command 的最新状态和增量输出。',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'shell session id 或 shell command id。' },
      sinceSeq: { type: 'number', description: '只返回大于该 seq 的日志。' },
    },
    required: ['id'],
  },
  async run(args) {
    const id = String(args.id ?? '').trim();
    const sinceSeq = numberArg(args.sinceSeq, 0) ?? 0;
    const result = await shellManager.poll(id, sinceSeq);
    if (!result.command) {
      return `shell session: ${result.session?.id}\nstatus: ${result.session?.status}\n暂无命令。`;
    }
    return formatCommandResult({ command: result.command, logs: result.logs });
  },
};

export const shellKillTool: Tool = {
  name: 'shell_kill',
  description: '终止正在运行的 shell command。默认先 SIGTERM，未退出再由后端升级 SIGKILL。',
  parameters: {
    type: 'object',
    properties: {
      commandId: { type: 'string', description: '要终止的 shell command id。' },
      reason: { type: 'string', description: '终止原因。' },
    },
    required: ['commandId'],
  },
  async run(args) {
    const command = await shellManager.kill(String(args.commandId ?? '').trim(), String(args.reason ?? 'agent_requested_kill'));
    return `已请求终止 shell command：${command.id}\nstatus: ${command.status}`;
  },
};

export const shellSessionCloseTool: Tool = {
  name: 'shell_session_close',
  description: '关闭托管 shell session；如果还有运行中命令，需要先终止命令。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'shell session id。' },
    },
    required: ['sessionId'],
  },
  async run(args, ctx) {
    const shellCtx = requireShellContext(ctx);
    const sessionId = String(args.sessionId ?? '').trim();
    const session = await store.getShellSession(sessionId);
    if (!session) throw new Error(`shell session 不存在：${sessionId}`);
    if (session.thread_id !== shellCtx.threadId) throw new Error('shell session 不属于当前 thread');
    const commands = await store.listShellCommandsBySession(sessionId, 20);
    const running = commands.filter((cmd) => cmd.status === 'running' || cmd.status === 'queued');
    if (running.length) return `shell session 仍有运行中命令，请先 shell_kill：${running.map((cmd) => cmd.id).join(', ')}`;
    await store.updateShellSession(sessionId, { status: 'closed', lease_actor: null, lease_run_id: null });
    await store.addShellSessionEvent(sessionId, 'agent', 'closed', { runId: shellCtx.runId ?? null });
    shellBus.publish(shellCtx.threadId, { type: 'shell_session_closed', step: shellCtx.step ?? 0, sessionId });
    return `已关闭 shell session：${sessionId}`;
  },
};

export const managedShellTools: Tool[] = [
  shellSessionOpenTool,
  shellSessionReuseTool,
  shellSessionListTool,
  shellExecTool,
  shellPollTool,
  shellKillTool,
  shellSessionCloseTool,
];
