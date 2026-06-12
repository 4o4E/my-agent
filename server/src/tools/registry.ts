import type { Tool, ToolResult } from './types.js';
import { toLlmTool } from './types.js';
import type { LlmTool } from '../llm/types.js';
import { createPolicy } from './policy.js';
import { getToolSettings } from '../settings.js';
import { shellTool } from './shell.js';
import { fileReadTool } from './fileRead.js';
import { fileWriteTool } from './fileWrite.js';
import { fileEditTool } from './fileEdit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { webFetchTool } from './webFetch.js';
import { webSearchTool } from './webSearch.js';
import { askUserTool } from './askUser.js';
import { htmlArtifactTool } from './htmlArtifact.js';
import { updatePlanTool } from './updatePlan.js';
import { finishConversationTool } from './finishConversation.js';

const TOOLS: Tool[] = [
  shellTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  webFetchTool,
  webSearchTool,
  askUserTool,
  htmlArtifactTool,
  updatePlanTool,
  finishConversationTool,
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export function toolSchemas(): LlmTool[] {
  return TOOLS.map(toLlmTool);
}

export function getTool(name: string): Tool | undefined {
  return byName.get(name);
}

/** Run a tool by name, returning a normalized `ToolResult` ({ text }).
 *  Plain-string tool returns are wrapped; the policy gate runs first and the
 *  output cap is applied to `text`. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) return { text: `未知工具：${name}` };
  // Every tool call passes through the sandbox/permission policy first.
  const settings = await getToolSettings();
  const policy = createPolicy(settings);
  const decision = policy.check(name, args);
  if (!decision.ok) return { text: `工具策略已阻止：${decision.reason}` };
  try {
    const raw = await tool.run(args, { settings });
    const result: ToolResult = typeof raw === 'string' ? { text: raw } : raw;
    return { text: policy.capOutput(result.text) };
  } catch (err) {
    return { text: `工具 ${name} 抛出异常：${(err as Error).message}` };
  }
}
