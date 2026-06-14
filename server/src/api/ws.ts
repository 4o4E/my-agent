import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { runBus } from '../agent/bus.js';
import { shellBus } from '../shell/bus.js';
import { store } from '../store/index.js';
import type { AgentEvent } from '../agent/types.js';

/**
 * WebSocket 端点:
 * - ws://host/ws?runId=<id> 回放并推送 run 事件。
 * - ws://host/ws?channel=shell&threadId=<id> 推送 thread 级 shell 事件。
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const channel = url.searchParams.get('channel');
    const threadId = url.searchParams.get('threadId');
    const runId = url.searchParams.get('runId');

    if (channel === 'shell') {
      if (!threadId) {
        socket.close(1008, '缺少 threadId 查询参数');
        return;
      }

      const send = (event: AgentEvent) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
      };
      const unsubscribe = shellBus.subscribe(threadId, send);
      socket.on('close', unsubscribe);
      socket.on('error', unsubscribe);
      return;
    }

    if (!runId) {
      socket.close(1008, '缺少 runId 查询参数');
      return;
    }

    const send = (event: AgentEvent) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };

    // 回放历史事件，确保较晚连接的前端也能看到完整 run。
    try {
      for (const e of await store.getEvents(runId)) send(e);
    } catch {
      /* 忽略回放失败 */
    }

    const unsubscribe = runBus.subscribe(runId, (event) => {
      send(event);
      if (event.type === 'final' || event.type === 'error' || event.type === 'user_question') {
        socket.close(1000, 'run 已结束');
      }
    });

    socket.on('close', unsubscribe);
    socket.on('error', unsubscribe);
  });
}
