// LegacyTransport (Phase 0): wraps the existing REST (`startRun`) + WebSocket
// (`subscribeRun`) wire protocol behind the `UiTransport` interface, mapping the
// server's `AgentEvent` frames onto the normalized `UiEvent` model. This is the
// only place that knows about the legacy protocol; everything above it depends
// solely on `UiEvent`.

import { startRun, subscribeRun, type AgentEvent } from '../api';
import type { UiEvent, UiTransport, UserInput } from './types';

/** Map one wire `AgentEvent` onto the normalized `UiEvent` model. Exported so
 *  historical runs loaded over REST can be normalized the same way. */
export function toUiEvent(e: AgentEvent): UiEvent {
  switch (e.type) {
    case 'step_start':
      return { kind: 'step_start', step: e.step };
    case 'reasoning':
      return { kind: 'reasoning', step: e.step, delta: e.text };
    case 'llm_delta':
      return { kind: 'text', step: e.step, delta: e.text };
    case 'tool_call':
      return { kind: 'tool', step: e.step, id: e.id, name: e.name, input: e.args };
    case 'tool_result':
      return { kind: 'tool', step: e.step, id: e.id, name: e.name, output: e.result };
    case 'final':
      return { kind: 'final', step: e.step, output: e.output };
    case 'error':
      return { kind: 'error', step: e.step, message: e.message };
  }
}

export const legacyTransport: UiTransport = {
  async send(threadId, input: UserInput) {
    const { id } = await startRun(threadId, input.text);
    return { runId: id };
  },
  subscribe(runId, onEvent, onClose) {
    return subscribeRun(runId, (e) => onEvent(toUiEvent(e)), onClose);
  },
};
