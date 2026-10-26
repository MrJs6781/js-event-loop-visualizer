import { simulate } from './runtime';
import type { SimOptions } from './types';

self.onmessage = (e: MessageEvent<{ code: string; options: SimOptions }>) => {
  try {
    const result = simulate(e.data.code, e.data.options);
    self.postMessage({ ok: true, result });
  } catch (err: any) {
    self.postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
