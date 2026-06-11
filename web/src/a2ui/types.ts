// A2UI (Agent-to-UI) declarative-UI message model — a pragmatic, A2UI-v0.9-aligned
// subset (read-only this round). The agent describes UI as a flat list of
// components referenced by id, plus an optional data model; the client renders it
// against a TRUSTED catalog (src/a2ui/catalog.tsx → shadcn components), so the
// payload is declarative data, never executable code.
//
// Mirrored on the server in server/src/agent/a2ui.ts (like AgentEvent).

/** A literal value, or a JSON-Pointer binding into the surface data model. */
export type A2uiValue<T = unknown> = T | { path: string };

/** One component node. Parent/child links are by id (flat adjacency list), which
 *  makes the UI easy for an LLM to stream and patch. Extra keys are
 *  component-specific props (each may itself be an `A2uiValue`). */
export interface A2uiComponent {
  id: string;
  component: string;
  /** Single child component id. */
  child?: string;
  /** Multiple child component ids. */
  children?: string[];
  [prop: string]: unknown;
}

/** A renderable surface: the component list + root id + optional state. */
export interface A2uiMessage {
  surfaceId: string;
  root: string;
  components: A2uiComponent[];
  dataModel?: Record<string, unknown>;
}
