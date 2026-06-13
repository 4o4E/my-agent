export interface ParsedToolArguments {
  ok: boolean;
  args: Record<string, unknown>;
  error?: string;
}

function preview(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 工具参数必须最终归一成 JSON object；兼容模型把 object 又包成字符串的情况。 */
export function parseToolArguments(raw: string): ParsedToolArguments {
  const text = raw.trim();
  if (!text) return { ok: true, args: {} };

  let first: unknown;
  try {
    first = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      args: {},
      error: `工具参数不是合法 JSON：${(err as Error).message}。参数片段：${preview(text)}`,
    };
  }

  const direct = asObject(first);
  if (direct) return { ok: true, args: direct };

  if (typeof first === 'string') {
    const nestedText = first.trim();
    if (!nestedText) return { ok: false, args: {}, error: '工具参数必须是 JSON object，但收到空字符串。' };
    try {
      const nested = JSON.parse(nestedText);
      const nestedObject = asObject(nested);
      if (nestedObject) return { ok: true, args: nestedObject };
      return { ok: false, args: {}, error: `工具参数必须是 JSON object，但内层是 ${Array.isArray(nested) ? 'array' : typeof nested}。` };
    } catch (err) {
      return {
        ok: false,
        args: {},
        error: `工具参数被包成字符串，但内层不是完整 JSON object：${(err as Error).message}。参数片段：${preview(nestedText)}`,
      };
    }
  }

  return { ok: false, args: {}, error: `工具参数必须是 JSON object，但收到 ${Array.isArray(first) ? 'array' : typeof first}。` };
}

/** 历史消息传回 AI SDK 时也不能静默变成空对象，否则模型会误读旧工具调用。 */
export function toolArgumentsForModel(raw: string): Record<string, unknown> {
  const parsed = parseToolArguments(raw);
  if (parsed.ok) return parsed.args;
  return {
    _invalidToolArguments: true,
    reason: parsed.error,
    rawPreview: preview(raw),
  };
}
