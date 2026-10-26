export type Mode = 'browser' | 'node';
export type FrameKind = 'main' | 'fn' | 'native';
export type ApiKind = 'timer' | 'interval' | 'fetch' | 'listener' | 'io' | 'raf';
export type QueueName = 'task' | 'micro' | 'raf' | 'nextTick' | 'timers' | 'poll' | 'check';
export type Stage =
  | 'start' | 'script' | 'task' | 'micro' | 'nextTick' | 'render'
  | 'idle' | 'timers' | 'poll' | 'check' | 'done';
export type ParamValue = string | number;

export interface Frame {
  id: number;
  label: string;
  kind: FrameKind;
  line?: number;
  callerLine?: number | null;
}

export interface ApiItem {
  id: number;
  kind: ApiKind;
  label: string;
  detail: string;
  start: number;
  due?: number;
}

export interface QItem {
  id: number;
  label: string;
  source: string;
}

export interface LogLine {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
  time: number;
}

export interface Narration {
  key: string;
  params?: Record<string, ParamValue>;
}

export interface Snapshot {
  stack: Frame[];
  apis: ApiItem[];
  queues: Partial<Record<QueueName, QItem[]>>;
  logCount: number;
  time: number;
  line: number | null;
  stage: Stage;
  narr: Narration;
  renderPending: boolean;
  renders: number;
  focus?: string;
}

export interface SimOptions {
  mode: Mode;
  render: boolean;
  clicks: number[];
  maxSteps?: number;
}

export interface SimResult {
  steps: Snapshot[];
  logs: LogLine[];
  error?: { message: string; line?: number; column?: number };
  aborted?: 'steps' | 'loop' | 'timeout';
}
