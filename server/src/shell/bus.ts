import { EventEmitter } from 'node:events';
import type { AgentEvent } from '../agent/types.js';

/**
 * thread 级 shell 事件总线。
 * run 级事件用于对话流，thread 级事件用于右侧 Shell 面板实时刷新。
 */
class ShellBus extends EventEmitter {
  publish(threadId: string, event: AgentEvent): void {
    this.emit(threadId, event);
  }

  subscribe(threadId: string, handler: (event: AgentEvent) => void): () => void {
    this.on(threadId, handler);
    return () => this.off(threadId, handler);
  }
}

export const shellBus = new ShellBus();
shellBus.setMaxListeners(0);
