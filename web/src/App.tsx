import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createThread,
  getThread,
  listThreads,
  type RunWithEvents,
  type Thread,
} from './api';
import { legacyTransport, toUiEvent } from './transport/legacy';
import type { UiEvent } from './transport/types';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import type { Turn } from './components/MessageList';
import { useThemeCtx } from './theme';

// The active transport. Swapping this (→ AiSdkTransport / AgUiTransport) is the
// only change needed to move to a different wire protocol; nothing below cares.
const transport = legacyTransport;

function runsToTurns(runs: RunWithEvents[]): Turn[] {
  return runs.map((r) => ({
    input: r.input,
    events: r.events.map(toUiEvent),
    running: r.status === 'running' || r.status === 'pending',
  }));
}

export function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const { theme, toggle: toggleTheme } = useThemeCtx();
  const unsubRef = useRef<(() => void) | null>(null);

  const refreshThreads = useCallback(() => {
    listThreads().then(setThreads).catch(() => {});
  }, []);

  useEffect(refreshThreads, [refreshThreads]);

  function newChat() {
    unsubRef.current?.();
    setActiveThreadId(null);
    setTurns([]);
    setRunning(false);
  }

  async function selectThread(id: string) {
    unsubRef.current?.();
    setRunning(false);
    setActiveThreadId(id);
    try {
      const { runs } = await getThread(id);
      setTurns(runsToTurns(runs));
    } catch {
      setTurns([]);
    }
  }

  function appendEvent(e: UiEvent) {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, events: [...last.events, e] };
      return next;
    });
  }

  function finishLastTurn() {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], running: false };
      return next;
    });
    setRunning(false);
  }

  async function send(text: string) {
    setRunning(true);
    setTurns((prev) => [...prev, { input: text, events: [], running: true }]);

    try {
      let threadId = activeThreadId;
      if (!threadId) {
        const thread = await createThread(text.slice(0, 40));
        threadId = thread.id;
        setActiveThreadId(threadId);
        refreshThreads();
      }
      const { runId } = await transport.send(threadId, { text });
      unsubRef.current = transport.subscribe(runId, appendEvent, finishLastTurn);
    } catch (err) {
      appendEvent({ kind: 'error', step: 0, message: (err as Error).message });
      finishLastTurn();
    }
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const title = activeThread?.title ?? (activeThreadId ? '会话' : '新会话');

  return (
    <div className="flex h-full">
      <Sidebar
        threads={threads}
        activeId={activeThreadId}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNew={newChat}
        onSelect={selectThread}
      />
      <ChatView title={title} turns={turns} running={running} onSend={send} />
    </div>
  );
}
