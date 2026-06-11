import type { UIMessage } from 'ai';
import { Conversation } from './Conversation';
import { Composer } from './Composer';

interface Props {
  title: string;
  messages: UIMessage[];
  busy: boolean;
  onSend: (text: string) => void;
}

export function ChatView({ title, messages, busy, onSend }: Props) {
  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-surface-200">
      <header className="flex h-14 shrink-0 items-center border-b border-surface-500 bg-surface-100 px-6">
        <h1 className="truncate text-sm font-semibold text-surface-950">{title}</h1>
        <span className="ml-3 rounded-full bg-surface-300 px-2 py-0.5 text-[11px] text-surface-800">
          {busy ? '运行中' : '空闲'}
        </span>
      </header>

      <div className="min-h-0 flex-1">
        <Conversation messages={messages} busy={busy} />
      </div>

      <Composer disabled={busy} onSend={onSend} />
    </main>
  );
}
