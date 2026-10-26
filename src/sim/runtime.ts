import type {
  ApiItem, Frame, FrameKind, LogLine, Mode, ParamValue, QItem,
  SimOptions, SimResult, Snapshot, Stage,
} from './types';
import { CompileError, instrument } from './instrument';

const EPOCH = 1_700_000_000_000;
const FRAME_MS = 1000 / 60;
const STACK_LIMIT = 50;
const LOOP_LIMIT = 2_000_000;
const TICK_COST = 0.01;
const DEFAULT_MAX_STEPS = 4000;
const MAX_LOGS = 1000;

export class Abort extends Error {
  constructor(public reason: 'steps' | 'loop') {
    super('__abort__');
  }
}

type Params = Record<string, ParamValue>;
type Task = { item: QItem; run: () => void };
interface Pending { id: number; due: number; seq: number; fire: () => void }

const round = (n: number) => Math.round(n * 100) / 100;
const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function simulate(code: string, options: SimOptions): SimResult {
  let compiled: string;
  try {
    compiled = instrument(code);
  } catch (e) {
    if (e instanceof CompileError) {
      return { steps: [], logs: [], error: { message: e.message, line: e.line, column: e.column } };
    }
    throw e;
  }
  return new Runtime(options).execute(compiled);
}

export class Runtime {
  readonly mode: Mode;
  readonly renderOn: boolean;
  readonly maxSteps: number;

  time = 0;
  private idc = 1;
  private seqc = 0;
  stack: Frame[] = [];
  apis: ApiItem[] = [];
  q: Record<string, Task[]>;
  logs: LogLine[] = [];
  steps: Snapshot[] = [];
  line: number | null = null;
  stage: Stage = 'start';
  pending: Pending[] = [];
  nextDue = Infinity;
  aborted: null | 'steps' | 'loop' = null;
  crashed = false;
  iterations = 0;
  layoutHint: number | null = null;
  nextRender = FRAME_MS;
  renders = 0;
  rafList: { id: number; cb: any }[] = [];
  listeners: { id: number; target: string; type: string; cb: any }[] = [];
  unhandled = new Set<any>();

  P: any;
  deferred: () => { promise: any; resolve: (v: any) => void; reject: (e: any) => void };
  thenImpl: (p: any, onF: any, onR: any, label: string | null, source: string) => any;
  hooks: Record<string, (...a: any[]) => any>;

  constructor(opts: SimOptions) {
    this.mode = opts.mode;
    this.renderOn = opts.mode === 'browser' && opts.render;
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    this.q = this.mode === 'node'
      ? { nextTick: [], micro: [], timers: [], poll: [], check: [] }
      : { task: [], micro: [], raf: [] };
    const promise = makePromise(this);
    this.P = promise.FakePromise;
    this.deferred = promise.deferred;
    this.thenImpl = promise.thenImpl;
    this.hooks = {
      enter: (label: string, line: number) => this.enter(label, line, 'fn'),
      exit: () => this.exit(),
      at: (line: number) => this.at(line),
      tick: () => this.tick(),
      fn: (f: any, label: string) => this.tagFn(f, label),
      runAsync: (g: any, self: any, label: string, line: number) => this.runAsync(g, self, label, line),
    };
    if (this.mode === 'browser') {
      for (const t of [...opts.clicks].sort((a, b) => a - b)) {
        this.schedule(Math.max(0, t), () => this.userClick());
      }
    }
  }

  nid() {
    return this.idc++;
  }

  // ───────────────────────── execution ─────────────────────────

  execute(compiled: string): SimResult {
    const globals = this.mode === 'node' ? this.nodeGlobals() : this.browserGlobals();
    const names = Object.keys(globals);
    let fn: (...a: any[]) => void;
    try {
      // user declarations live in an inner scope so they can shadow the provided globals
      fn = new Function('__rt', ...names, `(function () {\n${compiled}\n})();`) as any;
    } catch (e: any) {
      return { steps: [], logs: [], error: { message: String(e?.message ?? e) } };
    }
    try {
      this.snap('start');
      this.stage = 'script';
      this.enter(this.mode === 'node' ? 'main (module)' : 'main()', null, 'main', 'scriptStart');
      let threw = false;
      let err: unknown;
      try {
        fn(this.hooks, ...names.map((n) => globals[n]));
      } catch (e) {
        threw = true;
        err = e;
      }
      if (threw && err instanceof Abort) throw err;
      this.exit();
      if (threw) this.uncaught(err);
      if (this.mode === 'node') this.nodeLoop();
      else this.browserLoop();
      if (!this.crashed) {
        this.stage = 'done';
        this.line = null;
        this.snap('done');
      }
    } catch (e) {
      if (!(e instanceof Abort)) {
        this.log('error', 'Simulator error: ' + String((e as any)?.message ?? e));
        this.forceSnap('internal');
      }
    }
    return { steps: this.steps, logs: this.logs, aborted: this.aborted ?? undefined };
  }

  // ───────────────────────── snapshots ─────────────────────────

  capture(key: string, params?: Params, focus?: string): Snapshot {
    const queues: Record<string, QItem[]> = {};
    for (const k of Object.keys(this.q)) queues[k] = this.q[k].map((t) => ({ ...t.item }));
    return {
      stack: this.stack.map((f) => ({ ...f })),
      apis: this.apis.map((a) => ({ ...a })),
      queues,
      logCount: this.logs.length,
      time: round(this.time),
      line: this.line,
      stage: this.stage,
      narr: { key, params },
      renderPending: this.renderOn && this.time >= this.nextRender,
      renders: this.renders,
      focus,
    };
  }

  snap(key: string, params?: Params, focus?: string) {
    if (this.aborted) return;
    if (this.steps.length >= this.maxSteps) this.abort('steps');
    this.steps.push(this.capture(key, params, focus));
  }

  forceSnap(key: string, params?: Params) {
    this.steps.push(this.capture(key, params));
  }

  abort(reason: 'steps' | 'loop'): never {
    if (!this.aborted) {
      this.forceSnap('aborted_' + reason);
      this.aborted = reason;
    }
    throw new Abort(reason);
  }

  log(level: LogLine['level'], text: string) {
    if (this.logs.length >= MAX_LOGS) return;
    this.logs.push({ id: this.nid(), level, text, time: round(this.time) });
  }

  // ───────────────────────── call stack ─────────────────────────

  enter(label: string, line: number | null, kind: FrameKind, key = 'push', params?: Params, focus = 'stack') {
    if (this.aborted) throw new Abort(this.aborted);
    const id = this.layoutHint ?? this.nid();
    this.layoutHint = null;
    const frame: Frame = { id, label, kind, line: line ?? undefined, callerLine: this.line };
    if (line != null) this.line = line;
    this.stack.push(frame);
    if (this.stack.length > STACK_LIMIT) {
      this.snap('overflow', { limit: STACK_LIMIT }, 'stack');
      this.stack.pop();
      this.line = frame.callerLine ?? null;
      throw new RangeError('Maximum call stack size exceeded');
    }
    this.snap(key, { name: label, ...params }, focus);
  }

  exit() {
    const f = this.stack.pop();
    if (!f) return;
    this.line = f.callerLine ?? this.line;
    if (f.kind === 'native') return;
    this.snap(f.kind === 'main' ? 'scriptEnd' : 'pop', { name: f.label }, 'stack');
  }

  exitFrame(key: string) {
    const f = this.stack.pop();
    if (!f) return;
    this.line = f.callerLine ?? this.line;
    this.snap(key, { name: f.label }, 'stack');
  }

  nativeStep(label: string, key: string, params: Params, focus: string) {
    this.enter(label, null, 'native', key, params, focus);
    this.exit();
  }

  nativeRun(label: string, fn: () => void) {
    this.enter(label, null, 'native', 'nativeRun', { name: label });
    try {
      fn();
    } finally {
      this.exit();
    }
  }

  at(line: number) {
    if (this.aborted) throw new Abort(this.aborted);
    this.line = line;
  }

  tick() {
    if (this.aborted) throw new Abort(this.aborted);
    if (++this.iterations > LOOP_LIMIT) this.abort('loop');
    this.time += TICK_COST;
    if (this.time >= this.nextDue) this.poll();
  }

  tagFn(f: any, label: string) {
    try {
      Object.defineProperty(f, '__label', { value: label, configurable: true });
    } catch {
      /* frozen functions keep their own name */
    }
    return f;
  }

  labelOf(fn: any): string {
    if (typeof fn !== 'function') return String(fn);
    return fn.__label || fn.name || 'anonymous';
  }

  runAsync(genFn: any, self: any, label: string, line: number) {
    const { promise, resolve, reject } = this.deferred();
    const gen = genFn.call(self);
    let first = true;
    const step = (method: 'next' | 'throw', arg: any) => {
      this.enter(label, line, 'fn', first ? 'push' : 'resume');
      first = false;
      let r: any;
      let threw = false;
      let err: any;
      try {
        r = gen[method](arg);
      } catch (e) {
        threw = true;
        err = e;
      }
      if (threw && err instanceof Abort) throw err;
      this.exitFrame(!threw && !r.done ? 'suspend' : 'pop');
      if (threw) return reject(err);
      if (r.done) return resolve(r.value);
      const p = r.value instanceof this.P ? r.value : this.P.resolve(r.value);
      this.thenImpl(p, (x: any) => step('next', x), (e: any) => step('throw', e), label, 'await');
    };
    step('next', undefined);
    return promise;
  }

  // ───────────────────────── scheduling ─────────────────────────

  schedule(due: number, fire: () => void, id = this.nid()) {
    this.pending.push({ id, due, seq: this.seqc++, fire });
    this.recalcDue();
    return id;
  }

  cancel(id: number) {
    const i = this.pending.findIndex((p) => p.id === id);
    if (i >= 0) {
      this.pending.splice(i, 1);
      this.recalcDue();
    }
  }

  recalcDue() {
    let m = Infinity;
    for (const p of this.pending) if (p.due < m) m = p.due;
    this.nextDue = m;
  }

  poll() {
    for (;;) {
      let best: Pending | null = null;
      for (const p of this.pending) {
        if (p.due <= this.time && (!best || p.due < best.due || (p.due === best.due && p.seq < best.seq))) best = p;
      }
      if (!best) return;
      this.pending.splice(this.pending.indexOf(best), 1);
      this.recalcDue();
      best.fire();
    }
  }

  advanceTo(t: number) {
    while (this.nextDue <= t) {
      if (this.nextDue > this.time) this.time = this.nextDue;
      this.poll();
    }
    if (t > this.time) this.time = t;
  }

  enqueue(queue: string, label: string, source: string, run: () => void, id = this.nid()): QItem {
    const item = { id, label, source };
    this.q[queue].push({ item, run });
    return item;
  }

  queueMicro(label: string, source: string, run: () => void) {
    this.enqueue('micro', label, source, run);
    this.snap(source === 'await' ? 'awaitQueued' : 'microQueued', { name: label, source }, 'micro');
  }

  removeApi(id: number) {
    this.apis = this.apis.filter((a) => a.id !== id);
  }

  removeQueued(id: number) {
    for (const k of Object.keys(this.q)) this.q[k] = this.q[k].filter((t) => t.item.id !== id);
  }

  runCallback(run: () => void) {
    let threw = false;
    let err: unknown;
    try {
      run();
    } catch (e) {
      threw = true;
      err = e;
    }
    this.layoutHint = null;
    if (threw) {
      if (err instanceof Abort) throw err;
      this.uncaught(err);
    }
  }

  uncaught(err: unknown) {
    const msg = this.formatError(err);
    this.log('error', 'Uncaught ' + msg);
    if (this.mode === 'node') {
      this.crashed = true;
      this.stage = 'done';
      this.snap('nodeCrash', { msg }, 'console');
    } else {
      this.snap('uncaught', { msg }, 'console');
    }
  }

  reportUnhandled() {
    if (!this.unhandled.size) return;
    const list = [...this.unhandled];
    this.unhandled.clear();
    for (const p of list) {
      if (p._handled || this.crashed) continue;
      const msg = this.formatError(p._v);
      this.log('error', 'Uncaught (in promise) ' + msg);
      if (this.mode === 'node') {
        this.crashed = true;
        this.stage = 'done';
        this.snap('nodeCrash', { msg }, 'console');
        return;
      }
      this.snap('unhandled', { msg }, 'console');
    }
  }

  // ───────────────────────── browser loop ─────────────────────────

  browserLoop() {
    this.microCheckpoint();
    for (;;) {
      this.poll();
      this.maybeFrame();
      const t = this.q.task.shift();
      if (t) {
        this.stage = 'task';
        this.layoutHint = t.item.id;
        this.snap('pickTask', { name: t.item.label, source: t.item.source }, 'task');
        this.runCallback(t.run);
        this.microCheckpoint();
        continue;
      }
      let next = this.nextDue;
      if (this.rafList.length) next = Math.min(next, this.nextRender);
      if (next === Infinity) return;
      const target = Math.max(next, this.time);
      this.stage = 'idle';
      this.snap('idle', { t: round(target) }, 'loop');
      this.advanceTo(target);
      if (!this.rafList.length && this.time >= this.nextRender) {
        this.nextRender = (Math.floor(this.time / FRAME_MS) + 1) * FRAME_MS;
      }
    }
  }

  microCheckpoint() {
    while (this.q.micro.length) {
      const t = this.q.micro.shift()!;
      this.stage = 'micro';
      this.layoutHint = t.item.id;
      this.snap(t.item.source === 'await' ? 'runAwait' : 'runMicro', { name: t.item.label, source: t.item.source }, 'micro');
      this.runCallback(t.run);
    }
    this.reportUnhandled();
  }

  maybeFrame() {
    const wantsFrame = this.renderOn || this.rafList.length > 0;
    if (!wantsFrame || this.time < this.nextRender) return;
    if (this.rafList.length) {
      const list = this.rafList;
      this.rafList = [];
      for (const r of list) {
        this.removeApi(r.id);
        this.enqueue('raf', this.labelOf(r.cb), 'requestAnimationFrame', () => r.cb(round(this.time)), r.id);
      }
      this.stage = 'render';
      this.snap('rafFlush', { n: list.length }, 'raf');
      while (this.q.raf.length) {
        const t = this.q.raf.shift()!;
        this.stage = 'render';
        this.layoutHint = t.item.id;
        this.snap('runRaf', { name: t.item.label }, 'raf');
        this.runCallback(t.run);
        this.microCheckpoint();
      }
    }
    if (this.renderOn) {
      this.stage = 'render';
      this.renders++;
      this.snap('render', { n: this.renders }, 'render');
    }
    this.nextRender = (Math.floor(this.time / FRAME_MS) + 1) * FRAME_MS;
  }

  userClick() {
    const order = ['button', 'document', 'window'];
    const targets = this.listeners
      .filter((l) => l.type === 'click' && order.includes(l.target))
      .sort((a, b) => order.indexOf(a.target) - order.indexOf(b.target));
    if (!targets.length) {
      this.snap('clickIgnored', { t: round(this.time) }, 'apis');
      return;
    }
    for (const l of targets) {
      const label = this.labelOf(l.cb);
      const event = { type: 'click', target: 'button', timeStamp: round(this.time) };
      this.enqueue('task', label, 'click', () => l.cb(event));
      this.snap('clickQueued', { name: label }, 'task');
    }
  }

  // ───────────────────────── node loop ─────────────────────────

  nodeLoop() {
    this.nodeDrain();
    if (this.crashed) return;
    this.advanceTo(this.time + 1);
    while (!this.crashed) {
      this.poll();
      if (this.q.timers.length) this.runPhase('timers');
      if (this.crashed) return;
      this.poll();
      if (this.q.poll.length) {
        this.runPhase('poll');
      } else if (!this.q.check.length && !this.q.timers.length) {
        const n = this.nextDue;
        if (n === Infinity) return;
        this.stage = 'poll';
        this.snap('pollWait', { t: round(Math.max(n, this.time)) }, 'loop');
        this.advanceTo(n);
        if (this.q.poll.length) this.runPhase('poll');
      }
      if (this.crashed) return;
      if (this.q.check.length) this.runPhase('check');
      if (!this.pending.length && Object.values(this.q).every((a) => !a.length)) return;
    }
  }

  runPhase(name: 'timers' | 'poll' | 'check') {
    this.stage = name;
    this.snap('phase', { phase: name }, name);
    const n = this.q[name].length;
    for (let i = 0; i < n && !this.crashed; i++) {
      const t = this.q[name].shift();
      if (!t) break;
      this.stage = name;
      this.layoutHint = t.item.id;
      this.snap('runCallback', { name: t.item.label, phase: name }, name);
      this.runCallback(t.run);
      this.nodeDrain();
    }
  }

  nodeDrain() {
    for (;;) {
      if (this.crashed) return;
      if (this.q.nextTick.length) {
        while (this.q.nextTick.length && !this.crashed) {
          const t = this.q.nextTick.shift()!;
          this.stage = 'nextTick';
          this.layoutHint = t.item.id;
          this.snap('runTick', { name: t.item.label }, 'nextTick');
          this.runCallback(t.run);
        }
        continue;
      }
      if (this.q.micro.length) {
        while (this.q.micro.length && !this.crashed) {
          const t = this.q.micro.shift()!;
          this.stage = 'micro';
          this.layoutHint = t.item.id;
          this.snap(t.item.source === 'await' ? 'runAwait' : 'runMicro', { name: t.item.label, source: t.item.source }, 'micro');
          this.runCallback(t.run);
        }
        continue;
      }
      break;
    }
    this.reportUnhandled();
  }

  // ───────────────────────── host APIs ─────────────────────────

  setTimer(cb: any, ms: any, args: any[], repeat: boolean) {
    const label = this.labelOf(cb);
    let delay = Math.max(0, Number(ms) || 0);
    if (this.mode === 'node' || repeat) delay = Math.max(1, delay);
    const id = this.nid();
    const api = 'set' + (repeat ? 'Interval' : 'Timeout');
    const queue = this.mode === 'node' ? 'timers' : 'task';
    const fire = () => {
      const run = () => {
        if (typeof cb === 'function') cb(...args);
      };
      if (repeat) {
        this.enqueue(queue, label, api, run);
        this.schedule(this.time + delay, fire, id);
        const a = this.apis.find((x) => x.id === id);
        if (a) {
          a.start = this.time;
          a.due = this.time + delay;
        }
      } else {
        this.removeApi(id);
        this.enqueue(queue, label, api, run, id);
      }
      this.snap(this.mode === 'node' ? 'timerDoneNode' : 'timerDone', { name: label, ms: delay }, queue);
    };
    this.schedule(this.time + delay, fire, id);
    this.apis.push({ id, kind: repeat ? 'interval' : 'timer', label, detail: `${delay} ms`, start: this.time, due: this.time + delay });
    this.nativeStep(`${api}(${label}, ${ms ?? 0})`, repeat ? 'intervalStart' : 'timerStart', { name: label, ms: delay }, 'apis');
    // a zero-delay browser timer completes at once: its callback goes straight to the task queue
    if (this.mode === 'browser' && delay === 0) this.poll();
    return id;
  }

  clearTimer(id: any, api: string) {
    const n = Number(id);
    this.cancel(n);
    this.removeApi(n);
    this.removeQueued(n);
    this.nativeStep(`${api}(${id})`, 'timerCleared', { id: String(id) }, 'apis');
  }

  queueMicrotaskApi(cb: any) {
    const label = this.labelOf(cb);
    this.enqueue('micro', label, 'queueMicrotask', () => cb());
    this.nativeStep(`queueMicrotask(${label})`, 'microQueuedApi', { name: label }, 'micro');
  }

  raf(cb: any) {
    const id = this.nid();
    const label = this.labelOf(cb);
    this.rafList.push({ id, cb });
    this.apis.push({ id, kind: 'raf', label, detail: 'next frame', start: this.time, due: this.nextRender });
    this.nativeStep(`requestAnimationFrame(${label})`, 'rafAdd', { name: label }, 'apis');
    return id;
  }

  cancelRaf(id: any) {
    this.rafList = this.rafList.filter((r) => r.id !== id);
    this.removeApi(Number(id));
    this.nativeStep(`cancelAnimationFrame(${id})`, 'timerCleared', { id: String(id) }, 'apis');
  }

  fakeData(url: string): any {
    if (/user/i.test(url)) return { id: 1, name: 'Ada Lovelace' };
    if (/todo/i.test(url)) return [{ id: 1, title: 'Learn the event loop', done: true }];
    return { url, message: 'Hello from ' + url };
  }

  fetchImpl(url: any, opts?: any) {
    const u = String(url);
    const m = /[?&]delay=(\d+)/.exec(u);
    const latency = Math.max(0, Number(opts?.delay ?? (m ? m[1] : 300)) || 0);
    const d = this.deferred();
    const id = this.nid();
    const response = {
      ok: true,
      status: 200,
      url: u,
      json: () => this.P.resolve(this.fakeData(u)),
      text: () => this.P.resolve(JSON.stringify(this.fakeData(u))),
    };
    const fire = () => {
      this.removeApi(id);
      const settle = () => this.nativeRun('fetch response', () => d.resolve(response));
      if (this.mode === 'node') {
        this.enqueue('poll', `fetch ${u}`, 'fetch', settle, id);
        this.snap('ioDone', { name: `fetch('${u}')` }, 'poll');
      } else {
        this.enqueue('task', `fetch ${u}`, 'fetch', settle, id);
        this.snap('fetchDone', { url: u }, 'task');
      }
    };
    this.schedule(this.time + latency, fire, id);
    this.apis.push({ id, kind: 'fetch', label: u, detail: `${latency} ms`, start: this.time, due: this.time + latency });
    this.nativeStep(`fetch('${u}')`, 'fetchStart', { url: u, ms: latency }, 'apis');
    return d.promise;
  }

  block(ms: any) {
    const d = Math.max(0, Number(ms) || 0);
    this.enter(`block(${d})`, null, 'native', 'blockStart', { ms: d });
    try {
      this.advanceTo(this.time + d);
      this.snap('blockEnd', { ms: d }, 'stack');
    } finally {
      this.exit();
    }
  }

  makeTarget(name: string) {
    const rt = this;
    return {
      nodeName: name.toUpperCase(),
      addEventListener(type: any, cb: any) {
        const id = rt.nid();
        const label = rt.labelOf(cb);
        rt.listeners.push({ id, target: name, type: String(type), cb });
        rt.apis.push({ id, kind: 'listener', label: `${name}: ${type}`, detail: label, start: rt.time });
        rt.nativeStep(`${name}.addEventListener('${type}', ${label})`, 'listenerAdd', { target: name, type: String(type), name: label }, 'apis');
      },
      removeEventListener(type: any, cb: any) {
        const l = rt.listeners.find((x) => x.target === name && x.type === String(type) && x.cb === cb);
        if (l) {
          rt.listeners = rt.listeners.filter((x) => x !== l);
          rt.removeApi(l.id);
        }
        rt.nativeStep(`${name}.removeEventListener('${type}')`, 'listenerRemove', { target: name, type: String(type) }, 'apis');
      },
      click() {
        const order = [name, 'document', 'window'];
        const ls = rt.listeners.filter((l) => l.type === 'click' && order.includes(l.target));
        rt.enter(`${name}.click()`, null, 'native', 'syncClick', { target: name });
        try {
          for (const l of ls) l.cb({ type: 'click', target: name, timeStamp: round(rt.time) });
        } finally {
          rt.exit();
        }
      },
    };
  }

  makeDate() {
    const rt = this;
    const RealDate = Date;
    function FakeDate(this: any, ...args: any[]) {
      if (!new.target) return new RealDate(EPOCH + rt.time).toString();
      return args.length ? new (RealDate as any)(...args) : new RealDate(EPOCH + Math.floor(rt.time));
    }
    (FakeDate as any).now = () => EPOCH + Math.floor(rt.time);
    (FakeDate as any).parse = RealDate.parse;
    (FakeDate as any).UTC = RealDate.UTC;
    return FakeDate;
  }

  consoleObj() {
    const mk = (level: LogLine['level']) => (...args: any[]) => {
      const text = args.map((a) => this.formatValue(a, 0, true)).join(' ');
      this.log(level, text);
      this.nativeStep(`console.${level}`, 'log', { text: shorten(text, 70) }, 'console');
    };
    return { log: mk('log'), info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('log') };
  }

  commonGlobals() {
    return {
      console: this.consoleObj(),
      setTimeout: (cb: any, ms?: any, ...a: any[]) => this.setTimer(cb, ms, a, false),
      setInterval: (cb: any, ms?: any, ...a: any[]) => this.setTimer(cb, ms, a, true),
      clearTimeout: (id: any) => this.clearTimer(id, 'clearTimeout'),
      clearInterval: (id: any) => this.clearTimer(id, 'clearInterval'),
      queueMicrotask: (cb: any) => this.queueMicrotaskApi(cb),
      Promise: this.P,
      fetch: (u: any, o?: any) => this.fetchImpl(u, o),
      Date: this.makeDate(),
      performance: { now: () => round(this.time) },
      block: (ms: any) => this.block(ms),
    };
  }

  browserGlobals(): Record<string, any> {
    const common = this.commonGlobals();
    return {
      ...common,
      requestAnimationFrame: (cb: any) => this.raf(cb),
      cancelAnimationFrame: (id: any) => this.cancelRaf(id),
      button: this.makeTarget('button'),
      document: this.makeTarget('document'),
      window: { ...this.makeTarget('window'), ...common },
    };
  }

  nodeGlobals(): Record<string, any> {
    const common = this.commonGlobals();
    const fs = {
      readFile: (path: any, a?: any, b?: any) => this.readFile(path, a, b),
      readFileSync: (path: any, opts?: any) => this.readFileSync(path, opts),
    };
    const setImmediate = (cb: any, ...args: any[]) => {
      const label = this.labelOf(cb);
      const id = this.nid();
      this.enqueue('check', label, 'setImmediate', () => cb(...args), id);
      this.nativeStep(`setImmediate(${label})`, 'immediateQueued', { name: label }, 'check');
      return id;
    };
    const clearImmediate = (id: any) => {
      this.removeQueued(Number(id));
      this.nativeStep(`clearImmediate(${id})`, 'timerCleared', { id: String(id) }, 'check');
    };
    const nextTick = (cb: any, ...args: any[]) => {
      const label = this.labelOf(cb);
      this.enqueue('nextTick', label, 'process.nextTick', () => cb(...args));
      this.nativeStep(`process.nextTick(${label})`, 'tickQueued', { name: label }, 'nextTick');
    };
    const timers = { setTimeout: common.setTimeout, setInterval: common.setInterval, setImmediate, clearTimeout: common.clearTimeout, clearImmediate };
    const require = (name: any) => {
      const n = String(name).replace(/^node:/, '');
      if (n === 'fs') return fs;
      if (n === 'timers') return timers;
      throw new Error(`Cannot find module '${name}' (the simulator provides: fs, timers)`);
    };
    const module = { exports: {} };
    return {
      ...common,
      setImmediate,
      clearImmediate,
      process: { nextTick, env: {}, argv: ['node', 'main.js'], platform: 'simulator', version: 'v22-sim' },
      require,
      fs,
      module,
      exports: module.exports,
      __filename: '/app/main.js',
      __dirname: '/app',
    };
  }

  readFile(path: any, a?: any, b?: any) {
    const cb = typeof a === 'function' ? a : b;
    const opts = a && typeof a === 'object' ? a : {};
    const delay = Math.max(0, Number(opts.delay ?? 30) || 0);
    const label = this.labelOf(cb);
    const id = this.nid();
    const p = String(path);
    const fire = () => {
      this.removeApi(id);
      this.enqueue('poll', label, 'fs.readFile', () => {
        if (typeof cb === 'function') cb(null, `<contents of ${p}>`);
      }, id);
      this.snap('ioDone', { name: label }, 'poll');
    };
    this.schedule(this.time + delay, fire, id);
    this.apis.push({ id, kind: 'io', label: `readFile ${p}`, detail: `${delay} ms`, start: this.time, due: this.time + delay });
    this.nativeStep(`fs.readFile('${p}', ${label})`, 'ioStart', { path: p, ms: delay }, 'apis');
  }

  readFileSync(path: any, opts?: any) {
    const p = String(path);
    const delay = Math.max(0, Number(opts?.delay ?? 50) || 0);
    this.enter(`fs.readFileSync('${p}')`, null, 'native', 'ioSync', { path: p, ms: delay });
    try {
      this.advanceTo(this.time + delay);
    } finally {
      this.exit();
    }
    return `<contents of ${p}>`;
  }

  // ───────────────────────── formatting ─────────────────────────

  formatError(e: any): string {
    if (e && typeof e === 'object' && 'message' in e) return `${e.name ?? 'Error'}: ${e.message}`;
    return this.formatValue(e, 0, false);
  }

  formatValue(v: any, depth: number, top: boolean): string {
    if (typeof v === 'string') return top ? v : JSON.stringify(v);
    if (typeof v === 'bigint') return `${v}n`;
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function') return `ƒ ${this.labelOf(v)}`;
      if (typeof v === 'symbol') return v.toString();
      return String(v);
    }
    if (v instanceof this.P) {
      const state = v._s === 0 ? '<pending>' : v._s === 1 ? this.formatValue(v._v, depth + 1, false) : `<rejected> ${this.formatError(v._v)}`;
      return `Promise {${state}}`;
    }
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v instanceof Date) return v.toISOString();
    if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}';
    if (Array.isArray(v)) {
      const items = v.slice(0, 20).map((x) => this.formatValue(x, depth + 1, false));
      if (v.length > 20) items.push(`…${v.length - 20} more`);
      return `[${items.join(', ')}]`;
    }
    const keys = Object.keys(v);
    if (!keys.length) return '{}';
    const items = keys.slice(0, 12).map((k) => `${k}: ${this.formatValue(v[k], depth + 1, false)}`);
    if (keys.length > 12) items.push('…');
    return `{ ${items.join(', ')} }`;
  }
}

// ───────────────────────── Promise implementation ─────────────────────────
// A spec-shaped Promise whose reactions go through the simulator's microtask queue.

function makePromise(rt: Runtime) {
  const PENDING = 0;
  const FULFILLED = 1;
  const REJECTED = 2;

  interface Reaction {
    onF: any;
    onR: any;
    resolve: (v: any) => void;
    reject: (e: any) => void;
    label: string;
    source: string;
  }

  class FakePromise {
    _s = PENDING;
    _v: any = undefined;
    _r: Reaction[] = [];
    _handled = false;

    constructor(executor: any) {
      if (typeof executor !== 'function') throw new TypeError(`Promise resolver ${executor} is not a function`);
      const [res, rej] = resolvers(this);
      try {
        executor(res, rej);
      } catch (e) {
        if (e instanceof Abort) throw e;
        rej(e);
      }
    }

    then(onF?: any, onR?: any) {
      return thenImpl(this, onF, onR, null, 'then');
    }

    catch(onR?: any) {
      return thenImpl(this, undefined, onR, null, 'catch');
    }

    finally(f?: any) {
      const label = rt.labelOf(f);
      return thenImpl(
        this,
        (v: any) => {
          if (typeof f === 'function') f();
          return v;
        },
        (e: any) => {
          if (typeof f === 'function') f();
          throw e;
        },
        label,
        'finally',
      );
    }

    get [Symbol.toStringTag]() {
      return 'Promise';
    }

    static resolve(v: any) {
      if (v instanceof FakePromise) return v;
      const d = deferred();
      d.resolve(v);
      return d.promise;
    }

    static reject(e: any) {
      const d = deferred();
      d.reject(e);
      return d.promise;
    }

    static all(iterable: any) {
      const d = deferred();
      const items = [...iterable];
      const out = new Array(items.length);
      let left = items.length;
      if (!left) d.resolve(out);
      items.forEach((x, i) =>
        thenImpl(FakePromise.resolve(x), (v: any) => {
          out[i] = v;
          if (--left === 0) d.resolve(out);
        }, (e: any) => d.reject(e), 'Promise.all', 'Promise.all'),
      );
      return d.promise;
    }

    static allSettled(iterable: any) {
      const d = deferred();
      const items = [...iterable];
      const out = new Array(items.length);
      let left = items.length;
      if (!left) d.resolve(out);
      const done = () => {
        if (--left === 0) d.resolve(out);
      };
      items.forEach((x, i) =>
        thenImpl(FakePromise.resolve(x), (value: any) => {
          out[i] = { status: 'fulfilled', value };
          done();
        }, (reason: any) => {
          out[i] = { status: 'rejected', reason };
          done();
        }, 'Promise.allSettled', 'Promise.allSettled'),
      );
      return d.promise;
    }

    static race(iterable: any) {
      const d = deferred();
      for (const x of iterable) thenImpl(FakePromise.resolve(x), d.resolve, d.reject, 'Promise.race', 'Promise.race');
      return d.promise;
    }

    static any(iterable: any) {
      const d = deferred();
      const items = [...iterable];
      const errors = new Array(items.length);
      let left = items.length;
      if (!left) d.reject(new AggregateError([], 'All promises were rejected'));
      items.forEach((x, i) =>
        thenImpl(FakePromise.resolve(x), d.resolve, (e: any) => {
          errors[i] = e;
          if (--left === 0) d.reject(new AggregateError(errors, 'All promises were rejected'));
        }, 'Promise.any', 'Promise.any'),
      );
      return d.promise;
    }

    static withResolvers() {
      return deferred();
    }
  }

  function blank(): FakePromise {
    const p = Object.create(FakePromise.prototype);
    p._s = PENDING;
    p._v = undefined;
    p._r = [];
    p._handled = false;
    return p;
  }

  function deferred() {
    const promise = blank();
    const [resolve, reject] = resolvers(promise);
    return { promise, resolve, reject };
  }

  function resolvers(p: FakePromise): [(v: any) => void, (e: any) => void] {
    let done = false;
    return [
      (v: any) => {
        if (done) return;
        done = true;
        resolvePromise(p, v);
      },
      (e: any) => {
        if (done) return;
        done = true;
        settle(p, REJECTED, e);
      },
    ];
  }

  function resolvePromise(p: FakePromise, v: any) {
    if (v === p) return settle(p, REJECTED, new TypeError('Chaining cycle detected for promise'));
    if (v !== null && (typeof v === 'object' || typeof v === 'function')) {
      let then: any;
      try {
        then = v.then;
      } catch (e) {
        return settle(p, REJECTED, e);
      }
      if (typeof then === 'function') {
        rt.queueMicro('adopt thenable', 'thenable', () => {
          const [res, rej] = resolvers(p);
          try {
            then.call(v, res, rej);
          } catch (e) {
            if (e instanceof Abort) throw e;
            rej(e);
          }
        });
        return;
      }
    }
    settle(p, FULFILLED, v);
  }

  function settle(p: FakePromise, state: number, value: any) {
    if (p._s !== PENDING) return;
    p._s = state;
    p._v = value;
    const reactions = p._r;
    p._r = [];
    for (const r of reactions) schedule(p, r);
    if (state === REJECTED && !p._handled) rt.unhandled.add(p);
  }

  function schedule(p: FakePromise, r: Reaction) {
    rt.queueMicro(r.label, r.source, () => {
      const handler = p._s === FULFILLED ? r.onF : r.onR;
      if (typeof handler !== 'function') {
        if (p._s === FULFILLED) r.resolve(p._v);
        else r.reject(p._v);
        return;
      }
      let out: any;
      try {
        out = handler(p._v);
      } catch (e) {
        if (e instanceof Abort) throw e;
        r.reject(e);
        return;
      }
      r.resolve(out);
    });
  }

  function thenImpl(p: FakePromise, onF: any, onR: any, label: string | null, source: string) {
    const d = deferred();
    p._handled = true;
    rt.unhandled.delete(p);
    const name =
      label ??
      (typeof onF === 'function' ? rt.labelOf(onF) : typeof onR === 'function' ? rt.labelOf(onR) : '(pass-through)');
    const reaction: Reaction = { onF, onR, resolve: d.resolve, reject: d.reject, label: name, source };
    if (p._s === PENDING) p._r.push(reaction);
    else schedule(p, reaction);
    return d.promise;
  }

  return { FakePromise, deferred, thenImpl };
}
