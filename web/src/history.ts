// Convert persisted run history (loaded over REST) into AI SDK `UIMessage`s, so
// useChat can restore a thread on selection. Each run becomes a user message
// (the input) plus an assistant message whose parts are folded from the run's
// events — mirroring how the live stream produces parts (Phase 3).

import type { UIMessage } from 'ai';
import type { RunWithEvents } from './api';
import { toUiEvent } from './transport/legacy';
import type { UiEvent } from './transport/types';

type Part = UIMessage['parts'][number];

/** Fold an ordered `UiEvent` list into linear message parts (text / reasoning /
 *  tool). Contiguous text and reasoning deltas coalesce; tool input/output merge
 *  by call id. */
export function foldUiEventsToParts(events: UiEvent[]): Part[] {
  const parts: Part[] = [];
  const toolById = new Map<string, Record<string, unknown>>();
  let textBuf = '';
  let reasonBuf = '';

  const flushText = () => {
    if (textBuf) {
      parts.push({ type: 'text', text: textBuf, state: 'done' });
      textBuf = '';
    }
  };
  const flushReason = () => {
    if (reasonBuf) {
      parts.push({ type: 'reasoning', text: reasonBuf, state: 'done' });
      reasonBuf = '';
    }
  };

  for (const e of events) {
    switch (e.kind) {
      case 'reasoning':
        flushText();
        reasonBuf += e.delta;
        break;
      case 'text':
        flushReason();
        textBuf += e.delta;
        break;
      case 'tool': {
        flushReason();
        flushText();
        let p = toolById.get(e.id);
        if (!p) {
          p = { type: 'dynamic-tool', toolName: e.name, toolCallId: e.id, state: 'input-available', input: e.input };
          toolById.set(e.id, p);
          parts.push(p as unknown as Part);
        }
        if (e.input !== undefined) p.input = e.input;
        if (e.output !== undefined) {
          p.output = e.output;
          p.state = 'output-available';
        }
        break;
      }
      case 'final':
        flushReason();
        if (textBuf) flushText();
        else if (e.output) parts.push({ type: 'text', text: e.output, state: 'done' });
        break;
      case 'error':
        flushReason();
        flushText();
        parts.push({ type: 'text', text: `⚠️ ${e.message}`, state: 'done' });
        break;
      case 'step_start':
      case 'a2ui':
        break;
    }
  }
  flushReason();
  flushText();
  return parts;
}

/** Map persisted runs (oldest→newest) to a flat UIMessage list. */
export function runsToUiMessages(runs: RunWithEvents[]): UIMessage[] {
  const messages: UIMessage[] = [];
  for (const run of runs) {
    messages.push({ id: `${run.id}:u`, role: 'user', parts: [{ type: 'text', text: run.input }] });
    const parts = foldUiEventsToParts(run.events.map(toUiEvent));
    if (parts.length) messages.push({ id: `${run.id}:a`, role: 'assistant', parts });
  }
  return messages;
}
