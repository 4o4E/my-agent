import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { getThread, listThreads, type Thread } from './api';
import { createAiSdkChatTransport, type ChatThreadHandle } from './transport/aiSdkChat';
import { runsToUiMessages } from './history';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { useThemeCtx } from './theme';

export function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useThemeCtx();

  // Active thread id lives in a ref so the (stable) transport can read/update it
  // without being re-created on every selection.
  const threadIdRef = useRef<string | null>(null);
  threadIdRef.current = activeThreadId;

  const refreshThreads = useCallback(() => {
    listThreads().then(setThreads).catch(() => {});
  }, []);
  useEffect(refreshThreads, [refreshThreads]);

  const handle = useMemo<ChatThreadHandle>(
    () => ({
      getThreadId: () => threadIdRef.current,
      setThreadId: (id) => setActiveThreadId(id),
      onThreadCreated: () => refreshThreads(),
    }),
    [refreshThreads],
  );

  const transport = useMemo(() => createAiSdkChatTransport(handle), [handle]);

  const { messages, sendMessage, status, stop, setMessages } = useChat({ transport });
  const busy = status === 'submitted' || status === 'streaming';

  function newChat() {
    stop();
    setActiveThreadId(null);
    setMessages([]);
  }

  async function selectThread(id: string) {
    stop();
    setActiveThreadId(id);
    try {
      const { runs } = await getThread(id);
      setMessages(runsToUiMessages(runs));
    } catch {
      setMessages([]);
    }
  }

  function send(text: string) {
    void sendMessage({ text });
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
      <ChatView title={title} messages={messages} busy={busy} onSend={send} />
    </div>
  );
}
