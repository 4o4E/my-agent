import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { runBus } from '../agent/bus.js';
import { store } from '../store/index.js';
import type { AgentEvent } from '../agent/types.js';

/**
 * WebSocket 端点：ws://host/ws?runId=<id>
 * 先回放已持久化事件，再继续推送该 run 的实时事件。
 */
export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const runId = url.searchParams.get('runId');
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
