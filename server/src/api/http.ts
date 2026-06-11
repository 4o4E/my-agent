import { Router } from 'express';
import { executeRun } from '../agent/executor.js';
import { store } from '../store/index.js';
import { filesApi } from './files.js';
import { settingsApi } from './settings.js';
import type { AskUserAnswer } from '../agent/types.js';

export const api = Router();

api.use('/files', filesApi);
api.use('/settings', settingsApi);

// --- Threads ---

// Create a thread
api.post('/threads', async (req, res) => {
  const title = req.body?.title ? String(req.body.title) : undefined;
  const thread = await store.createThread(title);
  res.status(201).json(thread);
});

// List threads
api.get('/threads', async (_req, res) => {
  res.json(await store.listThreads());
});

// Thread detail (thread + its runs, each with its events) — used to restore a conversation.
api.get('/threads/:id', async (req, res) => {
  const thread = await store.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  const runs = await store.listRuns(thread.id);
  const withEvents = await Promise.all(
    runs.map(async (run) => ({ ...run, events: await store.getEvents(run.id) })),
  );
  res.json({ thread, runs: withEvents });
});

// Delete a thread and all dependent run data. PostgreSQL handles the cascade.
api.delete('/threads/:id', async (req, res) => {
  const deleted = await store.deleteThread(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'thread not found' });
  res.status(204).send();
});

// Start a run inside a thread
api.post('/threads/:id/runs', async (req, res) => {
  const thread = await store.getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'thread not found' });
  const input = String(req.body?.input ?? '').trim();
  if (!input) return res.status(400).json({ error: 'input is required' });

  const run = await store.createRun(thread.id, input);
  // Fire-and-forget: the loop runs in-process and streams events over WS.
  void executeRun(run.id);
  res.status(201).json({ id: run.id, threadId: thread.id, status: run.status });
});

// --- Runs ---

// Run detail (run + events). Events are grouped by step on the client.
api.get('/runs/:id', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  const events = await store.getEvents(run.id);
  res.json({ run, events });
});

// Cancel a run. Cooperative: flips status to 'canceling'; the executor observes it
// at the next step boundary and stops, setting status to 'canceled'.
api.post('/runs/:id/cancel', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  if (run.status === 'pending' || run.status === 'running' || run.status === 'waiting_for_user') {
    await store.setRunStatus(run.id, 'canceling');
    return res.json({ id: run.id, status: 'canceling' });
  }
  res.json({ id: run.id, status: run.status });
});

// 回答暂停中的 run，并恢复同一个 run。空回答表示“按默认假设继续”。
api.post('/runs/:id/answer', async (req, res) => {
  const run = await store.getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  if (run.status !== 'waiting_for_user') return res.status(409).json({ error: `run is ${run.status}, not waiting_for_user` });

  const answer = normalizeAnswer(req.body?.answer);
  await store.addMessage(run.thread_id, run.id, null, {
    role: 'user',
    content: `用户回答 / User answer:\n${formatAnswerForModel(answer)}`,
  });
  await store.addEvent(run.id, null, { type: 'user_answer', step: (await store.getLastStepIndex(run.id)) + 1, answer });
  await store.setRunStatus(run.id, 'pending');
  void executeRun(run.id, { resume: true });
  res.json({ id: run.id, threadId: run.thread_id, status: 'running' });
});

function normalizeAnswer(value: unknown): AskUserAnswer {
  if (!value || typeof value !== 'object') {
    const text = String(value ?? '').trim();
    return {
      mode: 'text',
      selected: [],
      customOptions: [],
      text,
      note: text || '按默认假设继续。 / Continue with the default assumption.',
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
        }))
        .filter((item) => item.label)
    : [];
  return {
    mode: raw.mode === 'single' || raw.mode === 'multiple' || raw.mode === 'text' ? raw.mode : 'text',
    selected,
    customOptions: Array.isArray(raw.customOptions) ? raw.customOptions.map((x) => String(x).trim()).filter(Boolean) : [],
    text: typeof raw.text === 'string' ? raw.text.trim() : '',
    note: typeof raw.note === 'string' ? raw.note.trim() : '',
    usedRecommended: raw.usedRecommended === true,
  };
}

function formatAnswerForModel(answer: AskUserAnswer): string {
  return JSON.stringify(answer, null, 2);
}
