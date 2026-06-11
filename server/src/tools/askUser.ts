import type { Tool } from './types.js';

export const askUserTool: Tool = {
  name: 'ask_user',
  description:
    'Ask the user a structured question and pause the run until the user answers. Supports single choice, multiple choice, or free text. Single/multiple choices may allow user-added options. / 向用户发起结构化提问并暂停 run，直到用户回答。支持单选、多选、文本；单选/多选可允许用户自定义选项。',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
      mode: {
        type: 'string',
        enum: ['single', 'multiple', 'text'],
        description: 'Answer mode / 回答方式：single=单选，multiple=多选，text=纯文本',
      },
      options: {
        type: 'array',
        description:
          'Selectable options for single/multiple mode. Mark one or more recommended=true so the user can let AI proceed with recommended choices. / 单选或多选选项。可设置 recommended=true，便于用户点击“按推荐处理”。',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            recommended: { type: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
      allowCustom: {
        type: 'boolean',
        description: 'Whether the user may add custom options in single/multiple mode / 单选或多选是否允许用户添加自定义选项',
      },
    },
    required: ['question'],
  },
  async run(args) {
    const question = String(args.question ?? '');
    return `Waiting for user answer: ${question}\n正在等待用户回答：${question}`;
  },
};
