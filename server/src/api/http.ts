import { Router } from 'express';
import { executeRun } from '../agent/executor.js';
import { store } from '../store/index.js';
import { filesApi } from './files.js';
import { settingsApi } from './settings.js';
import { datasourcesApi } from './datasources.js';
import { runtimeApi } from './runtime.js';
import { releaseRunLeases } from '../datasources/accountPool.js';
import type { AskUserAnswer, AskUserOption, AskUserSpec } from '../agent/types.js';
import { shellManager } from '../shell/manager.js';
import { shellBus } from '../shell/bus.js';
import { getToolSettings } from '../settings.js';
import { createPolicy } from '../tools/policy.js';

export const api = Router();

api.use('/files', filesApi);
api.use('/settings', settingsApi);
api.use('/datasources', datasourcesApi);
api.use('/runtime', runtimeApi);

async function killRunShellCommands(runId: string): Promise<void> {
  try {
    await shellManager.killRunCommands(runId, 'run_cancel');
  } catch (err) {
    const message = (err as Error).message;
    if (!message.includes('relation "shell_commands" does not exist')) {
      console.warn(`shell command cleanup during cancel failed: ${message}`);
    }
  }
}

function normalizeShellSignal(value: unknown, fallback: NodeJS.Signals): NodeJS.Signals {
  return value === 'SIGINT' || value === 'SIGTERM' || value === 'SIGKILL' ? value : fallback;
}

// --- Threads ---

// 创建 thread。
api.post('/threads', async (req, res) => {
  const title = req.body?.title ? String(req.body.title) : undefined;
  const thread = await store.createThread(title);
  res.status(201).json(thread);
});

// 列出所有 thread。
api.get('/threads', async (_req, res) => {
  res.json(await store.listThreads());
});

// thread 详情：包含 run 和事件，用于恢复对话。
api.get('/threads/:id', async (req, res) => {
  const thread = await store.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'thread 不存在' });
  const runs = await store.listRuns(thread.id);
  const withEvents = await Promise.all(
    runs.map(async (run) => ({ ...run, events: await store.getEvents(run.id) })),
  );
  res.json({ thread, runs: withEvents });
});

// 删除 thread 及关联 run 数据，级联删除由 PostgreSQL 负责。
api.delete('/threads/:id', async (req, res) => {
  const deleted = await store.deleteThread(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'thread 不存在' });
  res.status(204).send();
});

// 在 thread 内启动一次 run。
api.post('/threads/:id/runs', async (req, res) => {
  const thread = await store.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'thread 不存在' });
  const input = String(req.body?.input ?? '').trim();
  if (!input) return res.status(400).json({ error: 'input 为必填' });

  const run = await store.createRun(thread.id, input);
  // 后台执行：agent 循环在当前进程内运行，并通过 WebSocket 推送事件。
  void executeRun(run.id);
  res.status(201).json({ id: run.id, threadId: thread.id, status: run.status });
});

// --- Runs ---

// run 详情：包含事件，前端按 step 分组展示。
api.get('/runs/:id', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run 不存在' });
  const events = await store.getEvents(run.id);
  res.json({ run, events });
});

// 取消 run。运行中的 run 走协作式取消；等待用户回答时 executor 已暂停，
// 需要直接落成 canceled，避免刷新后继续卡在 ask_user。
api.post('/runs/:id/cancel', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run 不存在' });
  if (run.status === 'waiting_for_user') {
    const step = (await store.getLastStepIndex(run.id)) + 1;
    await killRunShellCommands(run.id);
    await store.addEvent(run.id, null, { type: 'user_cancel', step, reason: '用户已取消 run。' });
    await store.setRunStatus(run.id, 'canceled', { error: '用户已取消 run。' });
    await releaseRunLeases(run.id);
    return res.json({ id: run.id, status: 'canceled' });
  }
  if (run.status === 'pending' || run.status === 'running') {
    await killRunShellCommands(run.id);
    await store.setRunStatus(run.id, 'canceling');
    return res.json({ id: run.id, status: 'canceling' });
  }
  res.json({ id: run.id, status: run.status });
});

// 回答暂停中的 run，并恢复同一个 run。空回答表示“按默认假设继续”。
api.post('/runs/:id/answer', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run 不存在' });
  if (run.status !== 'waiting_for_user') return res.status(409).json({ error: `run 当前状态为 ${run.status}，不是 waiting_for_user` });

  const spec = latestAskUserSpec(await store.getEvents(run.id));
  const answer = normalizeAnswer(req.body?.answer, spec);
  const invalid = validateAnswer(answer, spec);
  if (invalid) return res.status(400).json({ error: invalid });
  await store.addMessage(run.thread_id, run.id, null, {
    role: 'user',
    content: `用户回答：\n${formatAnswerForModel(answer)}`,
  });
  await store.addEvent(run.id, null, { type: 'user_answer', step: (await store.getLastStepIndex(run.id)) + 1, answer });
  await store.setRunStatus(run.id, 'pending');
  void executeRun(run.id, { resume: true });
  res.json({ id: run.id, threadId: run.thread_id, status: 'running' });
});

// --- Managed shell ---

api.get('/shell-sessions', async (req, res) => {
  const threadId = String(req.query.threadId ?? '').trim();
  if (!threadId) return res.status(400).json({ error: 'threadId 为必填' });
  const settings = await getToolSettings();
  const sessions = await store.listShellSessions(threadId, settings.workspaceRoot);
  const result = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      commands: await store.listShellCommandsBySession(session.id, 50),
    })),
  );
  res.json({ sessions: result });
});

api.post('/shell-sessions', async (req, res) => {
  const threadId = String(req.body?.threadId ?? '').trim();
  if (!threadId) return res.status(400).json({ error: 'threadId 为必填' });
  const thread = await store.getThread(threadId);
  if (!thread) return res.status(404).json({ error: 'thread 不存在' });
  const settings = await getToolSettings();
  const decision = createPolicy(settings).check('shell_session_open', { command: '' });
  if (!decision.ok) return res.status(403).json({ error: decision.reason });
  const session = await shellManager.openSession({
    threadId,
    settings,
    pinned: req.body?.pinned === true,
    ttlMs: typeof req.body?.ttl_ms === 'number' ? req.body.ttl_ms : null,
  });
  res.status(201).json({ session });
});

api.get('/shell-sessions/:id/commands', async (req, res) => {
  const session = await store.getShellSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'shell session 不存在' });
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  res.json({ session, commands: await store.listShellCommandsBySession(session.id, limit) });
});

api.post('/shell-sessions/:id/close', async (req, res) => {
  const session = await store.getShellSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'shell session 不存在' });
  const commands = await store.listShellCommandsBySession(session.id, 50);
  const running = commands.filter((cmd) => cmd.status === 'queued' || cmd.status === 'running');
  if (running.length && req.body?.force !== true) {
    return res.status(409).json({ error: `shell session 仍有运行中命令：${running.map((cmd) => cmd.id).join(', ')}` });
  }
  for (const command of running) {
    await shellManager.kill(command.id, 'session_close', 'SIGTERM');
  }
  await store.updateShellSession(session.id, { status: 'closed', lease_actor: null, lease_run_id: null });
  await store.addShellSessionEvent(session.id, 'user', 'closed', { force: req.body?.force === true });
  shellBus.publish(session.thread_id, { type: 'shell_session_closed', step: 0, sessionId: session.id, reason: '用户关闭 session。' });
  res.json({ session: await store.getShellSession(session.id) });
});

api.post('/shell-sessions/:id/commands', async (req, res) => {
  const session = await store.getShellSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'shell session 不存在' });
  const command = String(req.body?.command ?? '').trim();
  if (!command) return res.status(400).json({ error: 'command 为必填' });
  const settings = await getToolSettings();
  const policy = createPolicy(settings);
  const decision = policy.check('shell_exec', { command });
  if (!decision.ok) return res.status(403).json({ error: decision.reason });
  const result = await shellManager.exec({
    sessionId: session.id,
    command,
    settings,
    context: { threadId: session.thread_id },
    waitMode: req.body?.wait === 'foreground' ? 'foreground' : 'background',
    waitTimeoutMs: Number(req.body?.timeout_ms ?? 1000),
    softTimeoutMs: typeof req.body?.soft_timeout_ms === 'number' ? req.body.soft_timeout_ms : null,
    hardTimeoutMs: typeof req.body?.hard_timeout_ms === 'number' ? req.body.hard_timeout_ms : null,
    actor: 'user',
  });
  res.status(201).json({ command: result.command, timedOutWaiting: result.timedOutWaiting, tail: result.tail });
});

api.get('/shell-commands/:id/logs', async (req, res) => {
  const command = await store.getShellCommand(req.params.id);
  if (!command) return res.status(404).json({ error: 'shell command 不存在' });
  const sinceSeq = Math.max(0, Number(req.query.sinceSeq ?? 0));
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit ?? 200)));
  res.json({ command, logs: await store.getShellCommandLogs(command.id, sinceSeq, limit) });
});

api.post('/shell-commands/:id/kill', async (req, res) => {
  const signal = normalizeShellSignal(req.body?.signal, 'SIGTERM');
  const command = await shellManager.kill(req.params.id, String(req.body?.reason ?? 'user_requested_kill'), signal);
  res.json({ command });
});

api.post('/shell-sessions/:id/takeover', async (req, res) => {
  const session = await store.getShellSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'shell session 不存在' });
  await store.updateShellSession(session.id, { status: 'attached_by_user', lease_actor: 'user', lease_run_id: null });
  await store.addShellSessionEvent(session.id, 'user', 'takeover', {});
  shellBus.publish(session.thread_id, { type: 'shell_lease_changed', step: 0, sessionId: session.id, actor: 'user', runId: null });
  res.json({ session: await store.getShellSession(session.id) });
});

api.post('/shell-sessions/:id/release', async (req, res) => {
  const session = await store.getShellSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'shell session 不存在' });
  await store.updateShellSession(session.id, { status: 'idle', lease_actor: null, lease_run_id: null });
  await store.addShellSessionEvent(session.id, 'user', 'release', {});
  shellBus.publish(session.thread_id, { type: 'shell_lease_changed', step: 0, sessionId: session.id, actor: null, runId: null });
  res.json({ session: await store.getShellSession(session.id) });
});

function latestAskUserSpec(events: Awaited<ReturnType<typeof store.getEvents>>): AskUserSpec | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'user_question' && event.spec) return event.spec;
  }
  return null;
}

function normalizeAnswer(value: unknown, spec: AskUserSpec | null = null): AskUserAnswer {
  if (!value || typeof value !== 'object') {
    const text = String(value ?? '').trim();
    return {
      mode: spec?.mode ?? 'text',
      selected: [],
      customOptions: [],
      text,
      note: text || '按默认假设继续。',
      usedRecommended: !text,
    };
  }
  const raw = value as Record<string, unknown>;
  const selected = Array.isArray(raw.selected)
    ? raw.selected
        .map((item) => (item && typeof item === 'object' ? item as Record<string, unknown> : null))
        .filter((item): item is Record<string, unknown> => !!item)
        .map((item) => ({
          id: String(item.id ?? item.label ?? '').trim(),
          label: String(item.label ?? item.id ?? '').trim(),
          description: typeof item.description === 'string' ? item.description : undefined,
          recommended: item.recommended === true,
          required: item.required === true,
        }))
        .filter((item) => item.label)
    : [];
  return {
    mode: spec?.mode ?? (raw.mode === 'single' || raw.mode === 'multiple' || raw.mode === 'text' ? raw.mode : 'text'),
    selected,
    customOptions: Array.isArray(raw.customOptions) ? raw.customOptions.map((x) => String(x).trim()).filter(Boolean) : [],
    text: typeof raw.text === 'string' ? raw.text.trim() : '',
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    usedRecommended: raw.usedRecommended === true,
  };
}

function validateAnswer(answer: AskUserAnswer, spec: AskUserSpec | null): string | null {
  if (!spec) return null;
  if (answer.mode !== spec.mode) return '回答类型与 ask_user 表单不匹配';
  if (spec.mode === 'text') {
    if (spec.required && !answer.text.trim()) return '文本回答为必填';
    return null;
  }

  if (spec.mode === 'single' && answer.selected.length > 1) {
    return '单选 ask_user 只能选择一个选项';
  }

  const optionById = new Map(spec.options.map((option) => [option.id, option]));
  const selectedIds = new Set(answer.selected.map((option) => option.id));
  const missingRequired = spec.options.filter((option) => option.required && !selectedIds.has(option.id));
  if (missingRequired.length) {
    return `缺少必选项：${missingRequired.map((option) => option.label).join(', ')}`;
  }
  if (spec.required && answer.selected.length === 0) {
    return '至少需要选择一个选项';
  }

  const customLabels = new Set(answer.customOptions);
  const unknown = answer.selected.filter((option) => !optionById.has(option.id) && !isAllowedCustomOption(option, customLabels, spec.allowCustom));
  if (unknown.length) {
    return `不允许未知选项：${unknown.map((option) => option.label).join(', ')}`;
  }
  return null;
}

function isAllowedCustomOption(option: AskUserOption, customLabels: Set<string>, allowCustom: boolean): boolean {
  return allowCustom && option.id.startsWith('custom:') && customLabels.has(option.label);
}

function formatAnswerForModel(answer: AskUserAnswer): string {
  return JSON.stringify(answer, null, 2);
}
