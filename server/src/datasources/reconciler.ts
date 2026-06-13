import { reconcileExpiredLeases } from './accountPool.js';

const DEFAULT_INTERVAL_MS = 60_000;

export function startDatasourceLeaseReconciler(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const released = await reconcileExpiredLeases();
      if (released > 0) console.log(`   Datasource leases reconciled: ${released}`);
    } catch (err) {
      console.warn(`Datasource lease reconciler failed: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
