// Agent-level types. LLM message/tool types live in ../llm/types.ts.

import type { GoalState } from './goal.js';

export type RunStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_user'
  | 'done'
  | 'error'
  | 'canceling'
  | 'canceled';

export type AskUserMode = 'single' | 'multiple' | 'text';

export interface AskUserOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
  required?: boolean;
}

export interface AskUserSpec {
  question: string;
  mode: AskUserMode;
  options: AskUserOption[];
  allowCustom: boolean;
  required: boolean;
}

export interface AskUserAnswer {
  mode: AskUserMode;
  selected: AskUserOption[];
  customOptions: string[];
  text: string;
  note: string;
  usedRecommended: boolean;
}

export interface TimedEventFields {
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
}

export type StreamStage =
  | 'llm_waiting'
  | 'reasoning'
  | 'output'
  | 'tool_call'
  | 'tool_running'
  | 'tool_result'
  | 'done'
  | 'error';

export interface StreamStats {
  stage: StreamStage;
  updatedAt: string;
  activeTool?: { id: string; name: string };
  totals: {
    outputChars: number;
    reasoningChars: number;
    toolInputChars: number;
    toolOutputChars: number;
    totalChars: number;
  };
  rate: {
    charsPerSecond: number;
    history: number[];
  };
}

/**
 * Events streamed to the client and persisted. `step` is the 1-based step index
 * within a run (one LLM turn + its tool calls).
 */
export type AgentEvent =
  | { type: 'step_start'; step: number }
  | ({ type: 'stream_stats'; step: number } & StreamStats)
  | ({ type: 'reasoning'; step: number; text: string } & Partial<TimedEventFields>)
  | ({ type: 'reasoning_timing'; step: number } & TimedEventFields)
  | { type: 'llm_delta'; step: number; text: string }
  | ({ type: 'tool_call'; step: number; name: string; args: unknown; id: string } & Pick<TimedEventFields, 'startedAt'>)
  | ({ type: 'tool_result'; step: number; id: string; name: string; result: string } & TimedEventFields)
  | { type: 'plan_update'; step: number; goal: GoalState }
  | {
      type: 'compaction';
      step: number;
      estBefore: number;
      estAfter: number;
      masked: number;
      summarized: number;
      dropped: number;
      reason?: string;
    }
  | { type: 'user_question'; step: number; question: string; toolCallId?: string; spec?: AskUserSpec }
  | { type: 'user_answer'; step: number; answer: AskUserAnswer }
  | { type: 'user_cancel'; step: number; reason?: string }
  | { type: 'progress_stalled'; step: number; reason: string; question?: string }
  | { type: 'recovery'; step: number; message: string }
  | { type: 'final'; step: number; output: string }
  | { type: 'error'; step: number; message: string };
