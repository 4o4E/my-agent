import type { Tool } from './types.js';

/** 结束对话的唯一出口。executor 会读取同一份参数决定 run 是否真正完成。 */
export const finishConversationTool: Tool = {
  name: 'finish_conversation',
  description:
    '结束或记录当前对话进度。结束前必须调用本工具并填写 `progress` 工作进度；只有 `completed: true` 才允许真正结束本次 run。',
  parameters: {
    type: 'object',
    properties: {
      progress: {
        type: 'string',
        description: '工作进度：已完成什么、关键结果是什么、是否还有剩余风险。',
      },
      completed: {
        type: 'boolean',
        description: '用户请求的工作是否已经完全完成。',
      },
    },
    required: ['progress', 'completed'],
  },
  async run(args) {
    const progress = typeof args.progress === 'string' ? args.progress.trim() : '';
    const completed = args.completed === true;
    if (!progress) return 'finish_conversation 错误：必须填写 `progress`。';
    return completed ? `对话已完成。进度：${progress}` : `已记录进度，请继续工作：${progress}`;
  },
};
