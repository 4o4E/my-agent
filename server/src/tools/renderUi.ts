import type { Tool, ToolResult } from './types.js';
import type { A2uiComponent, A2uiMessage } from '../agent/a2ui.js';

// `render_ui` lets the agent draw a declarative UI surface: it passes an A2UI
// component list (+ optional data model), which is surfaced to the client and
// rendered against the trusted shadcn catalog. Display-only this round.

const COMPONENT_TYPES = [
  'Card',
  'Column',
  'Row',
  'Stack',
  'Text',
  'Heading',
  'Badge',
  'Divider',
  'Image',
  'CodeBlock',
  'Markdown',
  'Mermaid',
  'KeyValue',
  'Table',
];

export const renderUiTool: Tool = {
  name: 'render_ui',
  description:
    'Render a rich, declarative UI surface for the user (read-only display). Provide A2UI ' +
    'components as a flat list referenced by id, with one `root` id, plus an optional `dataModel` ' +
    'for {"path":"/json/pointer"} bindings. Use Mermaid for diagrams and charts (flowchart, sequence, pie, xychart, gantt, timeline, sankey), and use tables/cards/key-value summaries for structured data. ' +
    `Allowed component types: ${COMPONENT_TYPES.join(', ')}. ` +
    'Example: {"root":"c","components":[{"id":"c","component":"Card","title":"Files","child":"t"},' +
    '{"id":"t","component":"Table","columns":["name","lines"],"rows":[["a.ts","12"]]}]}. ' +
    'Mermaid example: {"id":"m","component":"Mermaid","code":"pie title Status\\n  \\"ok\\" : 3\\n  \\"fail\\" : 1"}.',
  parameters: {
    type: 'object',
    properties: {
      root: { type: 'string', description: 'Id of the root component' },
      components: {
        type: 'array',
        description: 'Flat list of A2UI components; parent/child links are by id (child / children).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            component: { type: 'string', enum: COMPONENT_TYPES },
            code: { type: 'string', description: 'For Mermaid/CodeBlock: Mermaid DSL or source code text.' },
            text: { description: 'For Text/Markdown/Heading/Mermaid: display text or Mermaid DSL.' },
            child: { type: 'string' },
            children: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'component'],
          additionalProperties: true,
        },
      },
      dataModel: { type: 'object', description: 'Optional state object for {"path":...} bindings' },
      surfaceId: { type: 'string', description: 'Optional stable id to update a surface in place' },
    },
    required: ['root', 'components'],
  },
  async run(args): Promise<ToolResult> {
    const components = Array.isArray(args.components) ? (args.components as A2uiComponent[]) : [];
    const root = String(args.root ?? '');
    if (!root || components.length === 0) {
      return { text: 'render_ui error: `root` and a non-empty `components` array are required.' };
    }
    const surfaceId = typeof args.surfaceId === 'string' && args.surfaceId ? args.surfaceId : `ui-${root}`;
    const message: A2uiMessage = {
      surfaceId,
      root,
      components,
      dataModel: (args.dataModel as Record<string, unknown> | undefined) ?? undefined,
    };
    return {
      text: `UI rendered (surface ${surfaceId}, ${components.length} components).`,
      display: { type: 'a2ui', surfaceId, message },
    };
  },
};
