import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, type CallToolResult, type Tool as McpSdkTool } from '@modelcontextprotocol/sdk/types.js';
import type { LlmTool } from '../llm/types.js';
import { getMcpSettings, type McpServerSettings, type McpSettings } from '../settings.js';

export interface McpMappedTool {
  serverId: string;
  serverLabel: string;
  originalName: string;
  mappedName: string;
  description: string;
  parameters: Record<string, unknown>;
  enabled: boolean;
}

interface ClientEntry {
  client: Client;
  signature: string;
}

const TOOL_PREFIX = 'mcp__';
const TOOL_SEP = '__';
const clients = new Map<string, ClientEntry>();

export function mcpToolName(serverId: string, toolName: string): string {
  return `${TOOL_PREFIX}${serverId}${TOOL_SEP}${toolName}`;
}

export function parseMcpToolName(name: string): { serverId: string; toolName: string } | null {
  if (!name.startsWith(TOOL_PREFIX)) return null;
  const rest = name.slice(TOOL_PREFIX.length);
  const sep = rest.indexOf(TOOL_SEP);
  if (sep <= 0 || sep >= rest.length - TOOL_SEP.length) return null;
  return { serverId: rest.slice(0, sep), toolName: rest.slice(sep + TOOL_SEP.length) };
}

function configSignature(server: McpServerSettings): string {
  return JSON.stringify({
    url: server.url,
    bearerToken: server.bearerToken,
    headers: server.headers,
  });
}

function headersForServer(server: McpServerSettings): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of server.headers) {
    if (header.name.trim()) headers[header.name.trim()] = header.value;
  }
  if (server.bearerToken.trim() && !Object.keys(headers).some((key) => key.toLowerCase() === 'authorization')) {
    headers.Authorization = `Bearer ${server.bearerToken.trim()}`;
  }
  return headers;
}

async function closeEntry(serverId: string): Promise<void> {
  const existing = clients.get(serverId);
  if (!existing) return;
  clients.delete(serverId);
  await existing.client.close().catch(() => {});
}

async function connectServer(server: McpServerSettings): Promise<Client> {
  const signature = configSignature(server);
  const existing = clients.get(server.id);
  if (existing?.signature === signature) return existing.client;
  await closeEntry(server.id);

  const client = new Client({ name: 'my-agent', version: '0.1.0' }, { capabilities: {} });
  if (!server.url.trim()) throw new Error(`MCP server ${server.id} 缺少远程 MCP URL`);
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: headersForServer(server) },
  }), { timeout: server.timeoutMs });

  clients.set(server.id, { client, signature });
  return client;
}

function schemaObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : { type: 'object' };
}

async function listServerTools(server: McpServerSettings): Promise<McpMappedTool[]> {
  if (!server.enabled) return [];
  const client = await connectServer(server);
  const tools: McpSdkTool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: server.timeoutMs });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  const allowed = new Set(server.allowedTools);
  return tools.map((tool) => ({
    serverId: server.id,
    serverLabel: server.label || server.id,
    originalName: tool.name,
    mappedName: mcpToolName(server.id, tool.name),
    description: [
      `[MCP: ${server.label || server.id}] ${tool.title || tool.name}`,
      tool.description ?? '',
    ].filter(Boolean).join('\n'),
    parameters: schemaObject(tool.inputSchema),
    enabled: allowed.has(tool.name),
  }));
}

export async function listMcpTools(settings?: McpSettings): Promise<McpMappedTool[]> {
  const mcpSettings = settings ?? await getMcpSettings();
  const settled = await Promise.allSettled(mcpSettings.servers.map((server) => listServerTools(server)));
  return settled.flatMap((item) => item.status === 'fulfilled' ? item.value : []);
}

export async function mcpToolSchemas(settings?: McpSettings): Promise<LlmTool[]> {
  const tools = await listMcpTools(settings);
  return tools
    .filter((tool) => tool.enabled)
    .map((tool) => ({
      name: tool.mappedName,
      description: tool.description,
      parameters: tool.parameters,
    }));
}

function renderContentItem(item: CallToolResult['content'][number]): string {
  if (item.type === 'text') return item.text;
  if (item.type === 'image') return `[MCP 返回图片: ${item.mimeType}, base64 ${item.data.length} chars]`;
  if (item.type === 'audio') return `[MCP 返回音频: ${item.mimeType}, base64 ${item.data.length} chars]`;
  if (item.type === 'resource_link') return `[MCP 返回资源链接: ${item.name} ${item.uri}]`;
  if (item.type === 'resource') {
    const resource = item.resource;
    if ('text' in resource) return `[MCP 返回资源 ${resource.uri}]\n${resource.text}`;
    return `[MCP 返回二进制资源 ${resource.uri}: base64 ${resource.blob.length} chars]`;
  }
  return JSON.stringify(item);
}

function renderToolResult(result: CallToolResult): string {
  const parts = result.content.map(renderContentItem);
  if (result.structuredContent) {
    parts.push(`structuredContent:\n${JSON.stringify(result.structuredContent, null, 2)}`);
  }
  const text = parts.join('\n\n').trim() || '(MCP 工具没有返回内容)';
  return result.isError ? `MCP 工具返回错误：\n${text}` : text;
}

export async function callMcpTool(
  mappedName: string,
  args: Record<string, unknown>,
  settings?: McpSettings,
): Promise<{ text: string; serverId: string; toolName: string }> {
  const parsed = parseMcpToolName(mappedName);
  if (!parsed) throw new Error(`不是 MCP 工具名：${mappedName}`);
  const mcpSettings = settings ?? await getMcpSettings();
  const server = mcpSettings.servers.find((item) => item.id === parsed.serverId);
  if (!server || !server.enabled) throw new Error(`MCP server 未启用：${parsed.serverId}`);
  if (!server.allowedTools.includes(parsed.toolName)) throw new Error(`MCP 工具未允许：${parsed.serverId}/${parsed.toolName}`);

  const client = await connectServer(server);
  const rawResult = await client.callTool(
    { name: parsed.toolName, arguments: args },
    CallToolResultSchema,
    { timeout: server.timeoutMs },
  );
  const result = CallToolResultSchema.parse(rawResult) as CallToolResult;
  const text = renderToolResult(result);
  return {
    serverId: parsed.serverId,
    toolName: parsed.toolName,
    text: text.length <= server.maxOutput ? text : `${text.slice(0, server.maxOutput)}\n…[MCP 工具结果已截断]…`,
  };
}

export async function probeMcpServer(server: McpServerSettings): Promise<McpMappedTool[]> {
  return listServerTools({ ...server, enabled: true });
}
