import { executeRun } from './executor.js';
import type { Store } from '../store/types.js';
import { store as defaultStore } from '../store/index.js';
import { runBus } from './bus.js';

/** 服务启动恢复异常中断的 run；等待用户回答的 run 必须继续等待。 */
export async function recoverInterruptedRuns(store: Store = defaultStore): Promise<number> {
  const runs = await store.listRunsByStatus(['pending', 'running', 'canceling']);
  let started = 0;
  for (const run of runs) {
    if (run.status === 'canceling') {
      await store.setRunStatus(run.id, 'canceled');
      await store.addEvent(run.id, null, { type: 'error', step: 0, message: '服务恢复期间，run 已被取消。' });
      continue;
    }
    await store.addEvent(run.id, null, {
      type: 'recovery',
      step: (await store.getLastStepIndex(run.id)) + 1,
      message: '服务已重启，正在从最近的持久化检查点恢复 run。',
    });
    runBus.publish(run.id, {
      type: 'recovery',
      step: (await store.getLastStepIndex(run.id)) + 1,
      message: '服务已重启，正在从最近的持久化检查点恢复 run。',
    });
    void executeRun(run.id, { resume: true });
    started += 1;
  }
  return started;
}
