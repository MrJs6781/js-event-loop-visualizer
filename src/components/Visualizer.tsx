import { useEffect, useRef, type CSSProperties } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { FileText, Film, Globe, MousePointerClick, Repeat, Timer } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import type { ApiItem, Frame, LogLine, Mode, QItem, QueueName, SimResult, Snapshot } from '../sim/types';
import { LoopRing } from './LoopRing';
import { NarrationText } from './Narration';
import { Panel, laneVar, type Lane } from './Panel';

const spring = { type: 'spring', stiffness: 420, damping: 34 } as const;

const QUEUE_META: Record<QueueName, { lane: Lane; sub: string }> = {
  task: { lane: 'task', sub: 'setTimeout, events, fetch' },
  micro: { lane: 'micro', sub: 'Promise, await, queueMicrotask' },
  raf: { lane: 'render', sub: 'requestAnimationFrame' },
  nextTick: { lane: 'tick', sub: 'process.nextTick' },
  timers: { lane: 'task', sub: 'setTimeout, setInterval' },
  poll: { lane: 'api', sub: 'fs, fetch' },
  check: { lane: 'render', sub: 'setImmediate' },
};

const API_ICON = { timer: Timer, interval: Repeat, fetch: Globe, listener: MousePointerClick, io: FileText, raf: Film };

interface Props {
  result: SimResult | null;
  snap: Snapshot | null;
  mode: Mode;
  renderOn: boolean;
  showRaf: boolean;
  stale: boolean;
  running: boolean;
}

export function Visualizer({ result, snap, mode, renderOn, showRaf, stale, running }: Props) {
  const { t } = useI18n();
  const focus = snap?.focus;
  const queues: QueueName[] = mode === 'node' ? ['nextTick', 'micro', 'timers', 'poll', 'check'] : showRaf ? ['task', 'micro', 'raf'] : ['task', 'micro'];
  const logs = result ? result.logs.slice(0, snap?.logCount ?? 0) : [];

  return (
    <LayoutGroup>
      <div className={`order-2 flex min-w-0 flex-col gap-4 transition-opacity lg:order-none ${stale || running ? 'opacity-60' : ''}`}>
        <Story result={result} snap={snap} mode={mode} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_minmax(250px,300px)_minmax(230px,1fr)]">
          <Panel title={t('panel.stack')} sub="V8" lane="stack" focused={focus === 'stack'} className="self-start md:row-span-2">
            <Stack frames={snap?.stack ?? []} />
          </Panel>

          <Panel title={t('panel.loop')} lane="muted" focused={focus === 'loop'}>
            <LoopRing stage={snap?.stage ?? 'start'} mode={mode} time={snap?.time ?? 0} />
            {renderOn && snap && <RenderStatus pending={snap.renderPending} renders={snap.renders} />}
          </Panel>

          <Panel title={t('panel.apis', undefined, mode)} sub={mode === 'node' ? 'libuv' : undefined} lane="api" focused={focus === 'apis'}>
            <Apis apis={snap?.apis ?? []} time={snap?.time ?? 0} />
          </Panel>

          <div className={`grid content-start gap-3 md:col-span-2 xl:col-span-2 ${mode === 'node' ? 'xl:grid-cols-2' : ''}`}>
            {queues.map((q) => (
              <QueueLane key={q} name={q} items={snap?.queues[q] ?? []} focused={focus === q} />
            ))}
          </div>
        </div>

        <ConsolePanel logs={logs} focused={focus === 'console'} />
      </div>
    </LayoutGroup>
  );
}

function Story({ result, snap, mode }: { result: SimResult | null; snap: Snapshot | null; mode: Mode }) {
  const { t, num } = useI18n();
  const err = result?.error;
  let body;
  if (err) {
    const msg = result?.aborted === 'timeout' ? t('err.timeout') : err.line ? t('err.compileLine', { line: err.line, msg: err.message }) : t('err.compile', { msg: err.message });
    body = <p className="text-[17px] leading-relaxed text-danger">{msg}</p>;
  } else if (snap) {
    body = (
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${snap.narr.key}-${JSON.stringify(snap.narr.params)}-${snap.time}-${snap.stack.length}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className={`text-[17px] leading-relaxed ${snap.narr.key.startsWith('aborted') || snap.narr.key === 'uncaught' || snap.narr.key === 'nodeCrash' || snap.narr.key === 'unhandled' ? 'text-danger' : ''}`}
        >
          <NarrationText narr={snap.narr} mode={mode} />
        </motion.p>
      </AnimatePresence>
    );
  } else {
    body = <p className="text-[17px] text-muted">…</p>;
  }
  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-4" aria-live="polite">
      <div className="mb-1.5 flex items-baseline gap-3 text-[12px] text-muted">
        <span>{t('panel.story')}</span>
        {snap && <span className="ms-auto tabular-nums">{t('tl.clock', { t: num(snap.time, 2) })}</span>}
      </div>
      <div className="min-h-[3.4em]">{body}</div>
    </section>
  );
}

function Stack({ frames }: { frames: Frame[] }) {
  const { t } = useI18n();
  return (
    <div className="scroll-thin flex h-[300px] flex-col-reverse gap-1.5 overflow-y-auto rounded-xl bg-raised p-2 xl:h-[452px]">
      <AnimatePresence initial={false}>
        {frames.map((f, i) => (
          <motion.div
            key={f.id}
            layoutId={`tok-${f.id}`}
            layout
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
            transition={spring}
            style={{ '--lane': f.kind === 'native' ? 'var(--muted)' : 'var(--lane-stack)' } as CSSProperties}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
              f.kind === 'main'
                ? 'border-line bg-surface text-muted'
                : f.kind === 'native'
                  ? 'border-dashed border-[rgb(var(--lane)/0.6)] bg-surface'
                  : 'border-[rgb(var(--lane)/0.45)] bg-[rgb(var(--lane)/0.12)]'
            } ${i === frames.length - 1 ? 'shadow-[inset_0_0_0_1px_rgb(var(--lane)/0.6)]' : ''}`}
          >
            <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
              {f.label}
            </span>
            {f.line != null && (
              <span dir="ltr" className="shrink-0 font-mono text-[10.5px] text-muted">
                L{f.line}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
      {!frames.length && <p className="m-auto text-[12px] text-muted">{t('empty.stack')}</p>}
    </div>
  );
}

function RenderStatus({ pending, renders }: { pending: boolean; renders: number }) {
  const { t } = useI18n();
  return (
    <div
      className={`mt-2 flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[12px] ${
        pending ? 'bg-danger/10 text-danger' : 'bg-render/10 text-render'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${pending ? 'pulse-soft bg-danger' : 'bg-render'}`} aria-hidden />
      {pending ? t('render.pending') : t('render.idle', { n: renders })}
    </div>
  );
}

function Apis({ apis, time }: { apis: ApiItem[]; time: number }) {
  const { t, num } = useI18n();
  return (
    <div className="scroll-thin flex max-h-[280px] min-h-[120px] flex-col gap-1.5 overflow-y-auto">
      <AnimatePresence initial={false}>
        {apis.map((a) => {
          const Icon = API_ICON[a.kind];
          const progress = a.due != null && a.due > a.start ? Math.min(1, Math.max(0, (time - a.start) / (a.due - a.start))) : null;
          return (
            <motion.div
              key={a.id}
              layoutId={`tok-${a.id}`}
              layout
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
              transition={spring}
              className="rounded-lg border border-api/40 bg-api/10 px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <Icon size={14} className="shrink-0 text-api" aria-hidden />
                <span dir="ltr" className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                  {a.label}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{t(`api.${a.kind}`)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span dir="ltr" className="font-mono">
                  {a.detail}
                </span>
                {a.due != null && a.kind !== 'raf' && (
                  <span className="ms-auto tabular-nums">{t('api.due', { t: num(a.due, 1) })}</span>
                )}
              </div>
              {progress != null && a.kind !== 'raf' && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-api/15">
                  <div className="h-full rounded-full bg-api transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!apis.length && <p className="m-auto text-[12px] text-muted">{t('empty.apis')}</p>}
    </div>
  );
}

function QueueLane({ name, items, focused }: { name: QueueName; items: QItem[]; focused: boolean }) {
  const { t, num } = useI18n();
  const meta = QUEUE_META[name];
  return (
    <Panel
      title={t(`queue.${name}`)}
      sub={meta.sub}
      lane={meta.lane}
      focused={focused}
      right={<span className="tabular-nums text-[12px] text-muted">{num(items.length)}</span>}
    >
      <div className="scroll-thin flex min-h-[46px] items-center gap-2 overflow-x-auto rounded-xl border border-dashed border-line bg-raised p-2">
        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <motion.div
              key={it.id}
              layoutId={`tok-${it.id}`}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={spring}
              style={{ '--lane': laneVar(meta.lane) } as CSSProperties}
              className={`flex shrink-0 flex-col rounded-lg border px-2.5 py-1 ${
                i === 0 ? 'border-[rgb(var(--lane)/0.8)] bg-[rgb(var(--lane)/0.16)]' : 'border-[rgb(var(--lane)/0.35)] bg-[rgb(var(--lane)/0.08)]'
              }`}
            >
              <span dir="ltr" className="font-mono text-[12.5px] leading-snug">
                {it.label}
              </span>
              <span dir="ltr" className="font-mono text-[10px] leading-snug text-muted">
                {it.source}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {!items.length && <span className="px-1 text-[12px] text-muted">{t('empty.queue')}</span>}
      </div>
    </Panel>
  );
}

function ConsolePanel({ logs, focused }: { logs: LogLine[]; focused: boolean }) {
  const { t, num } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  return (
    <Panel title={t('panel.console')} lane="muted" focused={focused}>
      <div ref={ref} dir="ltr" className="scroll-thin max-h-[220px] min-h-[90px] overflow-y-auto rounded-xl bg-raised py-1.5 font-mono text-[12.5px]">
        {logs.map((l) => (
          <div
            key={l.id}
            className={`flex gap-3 border-b border-line/60 px-3 py-1 last:border-0 ${l.level === 'error' ? 'bg-danger/5 text-danger' : l.level === 'warn' ? 'text-api' : ''}`}
          >
            <span className="w-16 shrink-0 text-end tabular-nums text-muted">{num(l.time, 1)}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{l.text}</span>
          </div>
        ))}
        {!logs.length && (
          <p dir="auto" className="px-3 py-2 font-ui text-[12px] text-muted">
            {t('empty.console')}
          </p>
        )}
      </div>
    </Panel>
  );
}
