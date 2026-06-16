import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import type { Tool } from './types.js';
import { isWithin } from './policy.js';

function safeRelativePath(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) return `artifacts/report-${Date.now()}.html`;
  return input.replace(/^\/+/, '');
}

function ensureHtmlDocument(content: string): string {
  const trimmed = content.trimStart();
  if (/^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) return content;
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '  <title>HTML Artifact</title>',
    '</head>',
    '<body>',
    content,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export const htmlArtifactTool: Tool = {
  name: 'write_html_artifact',
  description:
    '写入完整 HTML artifact。仅在 Markdown/Mermaid/LaTeX 无法表达、用户明确要求交互/独立页面，或需要散点图、热力图、地图、桑基图等 Mermaid 不支持图型时使用；不要因为报告“复杂”就默认调用。',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'workspace 内相对 .html 路径；默认是 artifacts/report-<timestamp>.html。',
      },
      html: {
        type: 'string',
        description: '完整 HTML 文档或 body 片段。',
      },
    },
    required: ['html'],
  },
  async run(args, ctx) {
    const root = resolve(ctx?.settings.workspaceRoot ?? process.cwd());
    const requested = safeRelativePath(args.path);
    const target = isAbsolute(String(args.path ?? '')) ? resolve(String(args.path)) : resolve(root, requested);
    if (!isWithin(root, target)) {
      return `write_html_artifact 错误：路径超出 workspace：${String(args.path ?? '')}`;
    }
    const ext = extname(target).toLowerCase();
    if (ext !== '.html' && ext !== '.htm') {
      return 'write_html_artifact 错误：路径必须以 .html 或 .htm 结尾';
    }
    const html = ensureHtmlDocument(String(args.html ?? ''));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html, 'utf8');
    const rel = relative(root, target).split('\\').join('/');
    return `HTML artifact 已写入：${rel}\n可在远程文件面板中打开预览：${rel}`;
  },
};
