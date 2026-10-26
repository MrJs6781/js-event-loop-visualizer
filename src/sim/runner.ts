import type { SimOptions, SimResult } from './types';

const TIMEOUT_MS = 6000;

/* Runs the simulation in a throwaway worker so runaway code can never freeze the page. */
export function runSimulation(code: string, options: SimOptions): Promise<SimResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const finish = (r: SimResult) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ steps: [], logs: [], aborted: 'timeout', error: { message: 'timeout' } }),
      TIMEOUT_MS,
    );
    worker.onmessage = (e) => {
      if (e.data.ok) finish(e.data.result);
      else finish({ steps: [], logs: [], error: { message: e.data.error } });
    };
    worker.onerror = (e) => finish({ steps: [], logs: [], error: { message: e.message || 'worker error' } });
    worker.postMessage({ code, options });
  });
}
