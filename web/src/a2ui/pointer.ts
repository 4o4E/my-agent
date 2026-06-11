// RFC 6901 JSON Pointer resolution for A2UI data binding (read-only).

import type { A2uiValue } from './types';

/** Resolve a JSON Pointer (e.g. "/user/name", "/items/0/price") against `data`.
 *  Returns undefined if any segment is missing. "" / "/" returns the root. */
export function resolvePointer(data: unknown, pointer: string): unknown {
  if (pointer === '' ) return data;
  if (!pointer.startsWith('/')) return undefined;
  const tokens = pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = data;
  for (const tok of tokens) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

/** True for a `{ path }` binding object. */
function isBinding(v: unknown): v is { path: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'path' in v &&
    typeof (v as { path: unknown }).path === 'string' &&
    Object.keys(v as object).length === 1
  );
}

/** Resolve a literal-or-bound value against the data model. */
export function resolveValue<T = unknown>(v: A2uiValue<T> | undefined, data: unknown): T | undefined {
  if (isBinding(v)) return resolvePointer(data, v.path) as T | undefined;
  return v as T | undefined;
}

/** Resolve to a display string (numbers/booleans coerced; objects JSON-ified). */
export function resolveString(v: unknown, data: unknown): string {
  const resolved = isBinding(v) ? resolvePointer(data, v.path) : v;
  if (resolved == null) return '';
  if (typeof resolved === 'string') return resolved;
  if (typeof resolved === 'number' || typeof resolved === 'boolean') return String(resolved);
  return JSON.stringify(resolved);
}
