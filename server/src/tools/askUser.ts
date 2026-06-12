import type { Tool } from './types.js';

export const askUserTool: Tool = {
  name: 'ask_user',
  description:
    '向用户发起结构化提问并暂停 run，直到用户回答或取消。支持单选、多选、文本；单选/多选可允许用户自定义选项和必选选项。',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '要询问用户的问题' },
      mode: {
        type: 'string',
        enum: ['single', 'multiple', 'text'],
        description: '回答方式：single=单选，multiple=多选，text=纯文本',
      },
      options: {
        type: 'array',
        description:
          '单选或多选选项。可设置 recommended=true，便于用户点击“按推荐处理”。',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            description: { type: 'string' },
            recommended: { type: 'boolean' },
            required: {
              type: 'boolean',
              description:
                '该选项是否必须被用户选中后才能提交。',
            },
          },
          required: ['id', 'label'],
        },
      },
      allowCustom: {
        type: 'boolean',
        description: '单选或多选是否允许用户添加自定义选项',
      },
      required: {
        type: 'boolean',
        description:
          '主回答是否必填。文本模式要求填写正文；选择模式要求至少选择一个选项。',
      },
    },
    required: ['question'],
  },
  async run(args) {
    const question = String(args.question ?? '');
    return `正在等待用户回答：${question}`;
  },
};
