// A2UI declarative-UI message model (server side). Mirror of
// web/src/a2ui/types.ts — the agent describes UI as a flat list of components
// referenced by id plus an optional data model; the client renders it against a
// trusted catalog. Declarative data only, never executable code.

export type A2uiValue<T = unknown> = T | { path: string };

export interface A2uiComponent {
  id: string;
  component: string;
  child?: string;
  children?: string[];
  [prop: string]: unknown;
}

export interface A2uiMessage {
  surfaceId: string;
  root: string;
  components: A2uiComponent[];
  dataModel?: Record<string, unknown>;
}

/** Structured display attached to a tool result (refactor-plan §4). */
export interface A2uiDisplay {
  type: 'a2ui';
  surfaceId?: string;
  message: A2uiMessage;
}
