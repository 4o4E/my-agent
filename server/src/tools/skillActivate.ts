import type { Tool } from './types.js';
import { activateSkill } from '../skills/registry.js';

export const skillActivateTool: Tool = {
  name: 'skill_activate',
  description: '激活一个 skill，读取该 skill 的入口说明，并把它加入当前 run 的工作上下文。',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'skill 名称，或 source:name 形式的唯一 id' },
    },
    required: ['name'],
  },
  async run(args, ctx) {
    const settings = ctx?.settings;
    if (!settings) return '缺少工具运行设置，无法定位 workspaceRoot';
    const name = String(args.name ?? '');
    try {
      const activated = await activateSkill(settings.workspaceRoot, name);
      return `已激活 skill ${activated.skill.name}。`;
    } catch (err) {
      return `激活 skill 失败：${(err as Error).message}`;
    }
  },
};
