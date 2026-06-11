// Goal anchor (long-task design §3.2, §9/G1). A small, structured, always-present
// statement of what the run is trying to achieve. Re-rendered into a system message
// every step so it survives context compaction (masking never touches system
// messages) — the defense against goal drift on long, many-step tasks.

export interface PlanItem {
  text: string;
  status: 'todo' | 'doing' | 'done';
}

export interface GoalState {
  /** The original objective — set once at run start, never changed by the agent. */
  intent: string;
  /** The working plan; the agent replaces it wholesale via update_plan. */
  plan: PlanItem[];
  /** Key decisions to remember; append-only so they survive compaction. */
  decisions: string[];
  /** The immediate next action. */
  next: string;
}

/** Patch the agent may submit through the update_plan tool. */
export interface GoalPatch {
  plan?: PlanItem[];
  decisions?: string[];
  next?: string;
}

export function initGoal(intent: string): GoalState {
  return { intent, plan: [], decisions: [], next: '' };
}

/** Merge a patch: plan/next replace, decisions append (never lose a decision). */
export function mergeGoal(goal: GoalState, patch: GoalPatch): GoalState {
  return {
    intent: goal.intent,
    plan: patch.plan ?? goal.plan,
    decisions: patch.decisions?.length ? [...goal.decisions, ...patch.decisions] : goal.decisions,
    next: patch.next ?? goal.next,
  };
}

const BOX: Record<PlanItem['status'], string> = { done: 'x', doing: '~', todo: ' ' };

/** Render the goal as a compact system message kept at the top of the context. */
export function renderGoal(goal: GoalState): string {
  const lines = ['## Current goal — keep this in focus on every step', `Intent: ${goal.intent}`];
  if (goal.plan.length) {
    lines.push('Plan:');
    for (const p of goal.plan) lines.push(`- [${BOX[p.status] ?? ' '}] ${p.text}`);
  }
  if (goal.decisions.length) lines.push(`Decisions so far: ${goal.decisions.join('; ')}`);
  if (goal.next) lines.push(`Next: ${goal.next}`);
  return lines.join('\n');
}

/** Coerce raw update_plan tool args into a validated GoalPatch (best-effort). */
export function parseGoalPatch(args: Record<string, unknown>): GoalPatch {
  const patch: GoalPatch = {};
  if (Array.isArray(args.plan)) {
    patch.plan = args.plan
      .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
      .map((p) => ({
        text: String((p as { text?: unknown }).text ?? ''),
        status: (['todo', 'doing', 'done'] as const).includes((p as { status?: unknown }).status as never)
          ? ((p as { status: PlanItem['status'] }).status)
          : 'todo',
      }))
      .filter((p) => p.text);
  }
  if (Array.isArray(args.decisions)) {
    patch.decisions = args.decisions.map((d) => String(d)).filter(Boolean);
  } else if (typeof args.decisions === 'string' && args.decisions.trim()) {
    patch.decisions = [args.decisions.trim()];
  }
  if (typeof args.next === 'string') patch.next = args.next;
  return patch;
}
