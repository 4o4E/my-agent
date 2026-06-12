import { Router } from 'express';
import { executeRun } from '../agent/executor.js';
import { store } from '../store/index.js';
import { filesApi } from './files.js';
import { settingsApi } from './settings.js';
import type { AskUserAnswer, AskUserOption, AskUserSpec } from '../agent/types.js';

export const api = Router();

api.use('/files', filesApi);
api.use('/settings', settingsApi);

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
    await store.addEvent(run.id, null, { type: 'user_cancel', step, reason: '用户已取消 run。' });
    await store.setRunStatus(run.id, 'canceled', { error: '用户已取消 run。' });
    return res.json({ id: run.id, status: 'canceled' });
  }
  if (run.status === 'pending' || run.status === 'running') {
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
