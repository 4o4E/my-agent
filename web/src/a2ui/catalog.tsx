// A2UI trusted component catalog (read-only). Maps abstract component types to
// shadcn components. The agent can only request types that exist here, so it
// cannot inject arbitrary UI/code — this is the security boundary.

import { Fragment, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MarkdownContent } from '@/components/MarkdownContent';
import { cn } from '@/lib/utils';
import type { A2uiComponent, A2uiValue } from './types';
import { resolveString, resolveValue } from './pointer';

export interface RenderCtx {
  data: unknown;
  byId: Map<string, A2uiComponent>;
  render: (id: string, depth: number) => ReactNode;
  depth: number;
}

const MAX_DEPTH = 50;

function childIds(node: A2uiComponent): string[] {
  if (node.children && Array.isArray(node.children)) return node.children;
  if (node.child) return [node.child];
  return [];
}

function renderChildren(node: A2uiComponent, ctx: RenderCtx): ReactNode {
  return childIds(node).map((id) => <Fragment key={id}>{ctx.render(id, ctx.depth + 1)}</Fragment>);
}

function Unknown({ type }: { type: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      未知组件：<span className="font-mono">{type}</span>
    </div>
  );
}

/** Render one A2UI component node to a React element. */
export function renderNode(node: A2uiComponent, ctx: RenderCtx): ReactNode {
  if (ctx.depth > MAX_DEPTH) return null;
  const data = ctx.data;

  switch (node.component) {
    case 'Card': {
      const title = node.title !== undefined ? resolveString(node.title, data) : '';
      return (
        <Card>
          {title ? (
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className={cn('space-y-2', title ? 'pt-0' : 'pt-4')}>{renderChildren(node, ctx)}</CardContent>
        </Card>
      );
    }
    case 'Column':
    case 'Stack':
      return <div className="flex flex-col gap-2">{renderChildren(node, ctx)}</div>;
    case 'Row':
      return <div className="flex flex-row flex-wrap items-center gap-2">{renderChildren(node, ctx)}</div>;
    case 'Text': {
      const text = resolveString(node.text, data);
      const muted = node.variant === 'muted';
      return <p className={cn('text-sm', muted ? 'text-muted-foreground' : 'text-foreground')}>{text}</p>;
    }
    case 'Heading': {
      const text = resolveString(node.text, data);
      const level = Number(node.level ?? 2);
      const size = level <= 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
      return <div className={cn('font-semibold', size)}>{text}</div>;
    }
    case 'Badge': {
      const variant = (['default', 'secondary', 'destructive', 'outline'] as const).includes(
        node.variant as never,
      )
        ? (node.variant as 'default' | 'secondary' | 'destructive' | 'outline')
        : 'secondary';
      return <Badge variant={variant}>{resolveString(node.text, data)}</Badge>;
    }
    case 'Divider':
      return <Separator />;
    case 'Image': {
      const src = resolveString(node.src, data);
      const alt = resolveString(node.alt, data);
      return src ? <img src={src} alt={alt} className="max-h-64 rounded-md border object-contain" /> : null;
    }
    case 'CodeBlock': {
      const code = resolveString(node.code, data);
      const lang = resolveString(node.language, data) || 'text';
      return <MarkdownContent text={'```' + lang + '\n' + code + '\n```'} />;
    }
    case 'Markdown':
      return <MarkdownContent text={resolveString(node.text, data)} />;
    case 'KeyValue': {
      const items = (resolveValue(node.items as A2uiValue, data) as Array<Record<string, unknown>>) ?? [];
      return (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          {items.map((it, i) => (
            <Fragment key={i}>
              <dt className="text-muted-foreground">{resolveString(it.key, data)}</dt>
              <dd className="font-medium">{resolveString(it.value, data)}</dd>
            </Fragment>
          ))}
        </dl>
      );
    }
    case 'Table': {
      const columns = (resolveValue(node.columns as A2uiValue, data) as unknown[]) ?? [];
      const rows = (resolveValue(node.rows as A2uiValue, data) as unknown[][]) ?? [];
      return (
        <Table>
          {columns.length ? (
            <TableHeader>
              <TableRow>
                {columns.map((c, i) => (
                  <TableHead key={i}>{resolveString(c, data)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {rows.map((row, r) => (
              <TableRow key={r}>
                {(Array.isArray(row) ? row : [row]).map((cell, c) => (
                  <TableCell key={c}>{resolveString(cell, data)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    default:
      return <Unknown type={node.component} />;
  }
}
