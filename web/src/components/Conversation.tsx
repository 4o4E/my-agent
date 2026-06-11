import type { UIMessage } from 'ai';
import { Bot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Conversation as AIConversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import type { ToolUIPart } from 'ai';
import { A2uiSurface } from '@/a2ui/A2uiSurface';
import type { A2uiMessage } from '@/a2ui/types';
import { TableOfContents } from './TableOfContents';

type Part = UIMessage['parts'][number];

function isToolPart(p: Part): boolean {
  return p.type === 'dynamic-tool' || p.type.startsWith('tool-');
}

// `active` marks the most recent tool call. It stays expanded; as soon as a newer
// tool call appears the previous one auto-collapses. The user can still toggle any
// block manually (override), and the override is cleared when `active` flips so the
// block rejoins the "only the latest stays open" rule.
function ToolBlock({ part, active }: { part: Part; active: boolean }) {
  const p = part as {
    type: string;
    toolName?: string;
    state: ToolUIPart['state'];
    input?: unknown;
    output?: unknown;
    errorText?: string;
  };
  const [override, setOverride] = useState<boolean | null>(null);
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active) {
      prevActive.current = active;
      setOverride(null);
    }
  }, [active]);
  const open = override ?? active;
  return (
    <Tool open={open} onOpenChange={setOverride}>
      {p.type === 'dynamic-tool' ? (
        <ToolHeader type="dynamic-tool" toolName={p.toolName ?? 'tool'} state={p.state} />
      ) : (
        <ToolHeader type={p.type as ToolUIPart['type']} state={p.state} />
      )}
      <ToolContent>
        <ToolInput input={p.input} />
        <ToolOutput output={p.output as never} errorText={p.errorText} />
      </ToolContent>
    </Tool>
  );
}

function AssistantPart({ part, toolActive }: { part: Part; toolActive: boolean }) {
  if (part.type === 'text') return part.text ? <MessageResponse>{part.text}</MessageResponse> : null;
  if (part.type === 'reasoning') {
    return part.text ? (
      <Reasoning isStreaming={part.state === 'streaming'} defaultOpen={part.state === 'streaming'}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    ) : null;
  }
  if (part.type === 'data-a2ui') {
    return <A2uiSurface message={(part as { data: A2uiMessage }).data} />;
  }
  if (isToolPart(part)) return <ToolBlock part={part} active={toolActive} />;
  return null;
}

function userText(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function Conversation({ messages, busy }: { messages: UIMessage[]; busy: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Key (msgId:partIndex) of the last tool call across the whole conversation —
  // only that one stays expanded; everything before it collapses.
  let lastToolKey: string | null = null;
  for (const m of messages) {
    if (m.role === 'user') continue;
    m.parts.forEach((part, i) => {
      if (isToolPart(part)) lastToolKey = `${m.id}:${i}`;
    });
  }

  return (
    <div className="relative flex h-full min-h-0">
      <AIConversation className="h-full flex-1">
        <ConversationContent className="mx-auto max-w-3xl">
          <div ref={contentRef} className="flex flex-col gap-8">
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={<Bot className="size-6" />}
                title="my-agent"
                description="通用 AI Agent。描述一个任务，它会自主调用工具（shell、文件、glob/grep、web）逐步完成。"
              />
            ) : (
              messages.map((m) => (
                <Message from={m.role} key={m.id}>
                  <MessageContent>
                    {m.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{userText(m)}</div>
                    ) : (
                      m.parts.map((part, i) => (
                        <AssistantPart
                          key={i}
                          part={part}
                          toolActive={`${m.id}:${i}` === lastToolKey}
                        />
                      ))
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            {busy && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                正在思考…
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </AIConversation>
      <TableOfContents contentRef={contentRef} />
    </div>
  );
}
