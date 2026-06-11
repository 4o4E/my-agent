import type { Tool } from './types.js';

// Very small HTML → text reduction (strip tags/scripts). Good enough for a skeleton.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateFetchText(text: string, maxChars: number): string {
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 8000;
  if (text.length <= limit) return text;
  let marker = '';
  let keep = limit;
  for (let i = 0; i < 3; i++) {
    marker = `\n…[truncated ${text.length - keep} chars by web_fetch max_chars]`;
    keep = Math.max(0, limit - marker.length);
  }
  if (marker.length > limit) return marker.slice(0, limit);
  return `${text.slice(0, keep)}${marker}`;
}

export const webFetchTool: Tool = {
  name: 'web_fetch',
  description: 'Fetch a URL and return its content as text (HTML is reduced to plain text).',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch (http/https)' },
      max_chars: { type: 'number', description: 'Truncate result to this many characters (default 8000)' },
    },
    required: ['url'],
  },
  async run(args) {
    const url = String(args.url ?? '');
    const maxChars = Number(args.max_chars ?? 8000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'my-agent/0.1' } });
      if (!res.ok) return `Fetch failed (${res.status}) for ${url}`;
      const ct = res.headers.get('content-type') ?? '';
      const raw = await res.text();
      const text = ct.includes('html') ? htmlToText(raw) : raw;
      return truncateFetchText(text, maxChars);
    } catch (err) {
      return `Failed to fetch ${url}: ${(err as Error).message}`;
    }
  },
};
