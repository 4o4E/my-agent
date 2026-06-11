import type { Tool } from './types.js';

/**
 * Maintain the working plan for the current task. The tool itself is stateless — it
 * just acknowledges; the executor reads the same args to update the run's persisted
 * goal anchor (intent/plan/decisions/next), which is re-injected into the context on
 * every step so it survives compaction (long-task design §3.2, §9/G1).
 */
export const updatePlanTool: Tool = {
  name: 'update_plan',
  description:
    'Record or refresh your working plan for the current task: the remaining steps (with status), key decisions to remember, and the immediate next action. Call this at the start of a multi-step task and whenever your plan changes, so you stay on track across many steps. Decisions are appended; plan and next replace the previous values.',
  parameters: {
    type: 'object',
    properties: {
      plan: {
        type: 'array',
        description: 'The full current plan (replaces the previous plan).',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What this step accomplishes' },
            status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          },
          required: ['text', 'status'],
        },
      },
      decisions: {
        type: 'array',
        description: 'Key decisions to remember going forward (appended to existing).',
        items: { type: 'string' },
      },
      next: { type: 'string', description: 'The immediate next action you will take.' },
    },
  },
  async run() {
    return 'Plan updated.';
  },
};
