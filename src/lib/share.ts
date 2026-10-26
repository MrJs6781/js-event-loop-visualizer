import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Mode } from '../sim/types';

export interface SharedState {
  code: string;
  mode: Mode;
  render: boolean;
  clicks: number[];
}

export function encodeState(s: SharedState): string {
  const p = new URLSearchParams();
  p.set('code', compressToEncodedURIComponent(s.code));
  p.set('mode', s.mode);
  if (s.render) p.set('render', '1');
  if (s.clicks.length) p.set('clicks', s.clicks.join(','));
  return '#' + p.toString();
}

export function decodeState(hash: string): SharedState | null {
  if (!hash || hash.length < 2) return null;
  const p = new URLSearchParams(hash.slice(1));
  const raw = p.get('code');
  if (!raw) return null;
  const code = decompressFromEncodedURIComponent(raw);
  if (code == null) return null;
  const mode: Mode = p.get('mode') === 'node' ? 'node' : 'browser';
  const clicks = (p.get('clicks') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return { code, mode, render: p.get('render') === '1', clicks };
}
