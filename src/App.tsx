import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Loader2, Play } from 'lucide-react';
import { useI18n } from './i18n/I18nProvider';
import { defaultExample, examples } from './examples';
import { runSimulation } from './sim/runner';
import type { Mode, SimResult } from './sim/types';
import { decodeState, encodeState } from './lib/share';
import { CodeEditor } from './components/CodeEditor';
import { ExamplePicker, Header, Reference, Settings, Timeline } from './components/Chrome';
import { Visualizer } from './components/Visualizer';

interface Setup {
  code: string;
  mode: Mode;
  render: boolean;
  clicks: number[];
}

const fromExample = (id: string): Setup => {
  const ex = examples.find((e) => e.id === id)!;
  return { code: ex.code, mode: ex.mode, render: !!ex.render, clicks: ex.clicks ?? [] };
};

const matchExample = (s: Setup) => examples.find((e) => e.mode === s.mode && e.code === s.code)?.id ?? null;

function initialTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export default function App() {
  const { t } = useI18n();

  const initial = useMemo<Setup>(() => decodeState(window.location.hash) ?? fromExample(defaultExample('browser').id), []);
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [code, setCode] = useState(initial.code);
  const [render, setRender] = useState(initial.render);
  const [clicks, setClicks] = useState<number[]>(initial.clicks);
  const [exampleId, setExampleId] = useState<string | null>(() => matchExample(initial));

  const [result, setResult] = useState<SimResult | null>(null);
  const [ranCode, setRanCode] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [theme, setTheme] = useState(initialTheme);
  const [shared, setShared] = useState(false);
  const runId = useRef(0);

  const run = useCallback(async (s: Setup, opts: { keepIdx?: boolean; autoplay?: boolean } = {}) => {
    const id = ++runId.current;
    setRunning(true);
    setPlaying(false);
    const res = await runSimulation(s.code, { mode: s.mode, render: s.render, clicks: s.clicks });
    if (id !== runId.current) return;
    setRunning(false);
    setResult(res);
    setRanCode(s.code);
    setIdx((i) => (opts.keepIdx ? Math.min(i, Math.max(0, res.steps.length - 1)) : 0));
    setPlaying(!!opts.autoplay && res.steps.length > 1);
  }, []);

  useEffect(() => {
    run(initial);
  }, [run, initial]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const total = result?.steps.length ?? 0;
  const snap = result && total ? result.steps[Math.min(idx, total - 1)] : null;
  const stale = ranCode !== null && ranCode !== code;

  // playback
  useEffect(() => {
    if (!playing) return;
    if (idx >= total - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setIdx((i) => i + 1), 900 / speed);
    return () => window.clearTimeout(id);
  }, [playing, idx, total, speed]);

  const go = useCallback((i: number) => {
    setPlaying(false);
    setIdx(Math.max(0, Math.min(i, total - 1)));
  }, [total]);

  const togglePlay = useCallback(() => {
    if (total < 2) return;
    if (!playing && idx >= total - 1) setIdx(0);
    setPlaying((p) => !p);
  }, [playing, idx, total]);

  // keyboard: space plays, arrows step (mirrored in right-to-left layout)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('.cm-editor, input, select, textarea, summary')) return;
      if (el.closest('button') && e.key === ' ') return;
      // the timeline is laid out left-to-right in every language, so the keys follow it
      const forward = 'ArrowRight';
      const back = 'ArrowLeft';
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === forward) go(idx + 1);
      else if (e.key === back) go(idx - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(total - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, go, idx, total]);

  const applySetup = (s: Setup, id: string | null) => {
    setMode(s.mode);
    setCode(s.code);
    setRender(s.render);
    setClicks(s.clicks);
    setExampleId(id);
    run(s);
  };

  const selectExample = (id: string) => applySetup(fromExample(id), id);
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    const ex = defaultExample(m);
    applySetup(fromExample(ex.id), ex.id);
  };

  const onCode = (v: string) => {
    setCode(v);
    setPlaying(false);
    setExampleId(examples.find((e) => e.mode === mode && e.code === v)?.id ?? null);
  };

  const rerunWith = (patch: Partial<Setup>) => {
    const s = { code, mode, render, clicks, ...patch };
    if (!stale) run(s, { keepIdx: true });
  };

  const onRender = (v: boolean) => {
    setRender(v);
    rerunWith({ render: v });
  };

  const onClicks = (c: number[]) => {
    setClicks(c);
    rerunWith({ clicks: c });
  };

  const onClickNow = () => {
    const now = Math.round(snap?.time ?? 0);
    onClicks([...new Set([...clicks, now])].sort((a, b) => a - b));
  };

  const onShare = async () => {
    const hash = encodeState({ code, mode, render, clicks });
    window.history.replaceState(null, '', hash);
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* the URL is still updated in the address bar */
    }
    setShared(true);
    window.setTimeout(() => setShared(false), 1800);
  };

  const showRaf = !!result?.steps.some((s) => (s.queues.raf?.length ?? 0) > 0) || /requestAnimationFrame/.test(code);
  const modeExamples = examples.filter((e) => e.mode === mode);
  const errorLine = !stale && result?.error?.line ? result.error.line : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col">
        <Header mode={mode} onMode={switchMode} theme={theme} onTheme={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))} onShare={onShare} shared={shared} />

        <main className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 pb-6 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
          <aside className="scroll-thin flex min-w-0 flex-col gap-4 max-lg:contents lg:sticky lg:top-4 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto">
            <section className="order-1 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 lg:order-none">
              <ExamplePicker examples={modeExamples} selected={exampleId} onSelect={selectExample} />
              <div className="h-[340px] overflow-hidden rounded-xl border border-line bg-raised lg:h-[42vh] lg:min-h-[300px]">
                <CodeEditor value={code} onChange={onCode} stepLine={stale ? null : snap?.line ?? null} errorLine={errorLine} label={t('editor.title')} />
              </div>
              {stale && <p className="text-[12.5px] leading-relaxed text-api">{t('editor.edited')}</p>}
              <button
                type="button"
                onClick={() => run({ code, mode, render, clicks }, { autoplay: true })}
                disabled={running}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-stack text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:text-bg"
              >
                {running ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Play size={18} aria-hidden />}
                {running ? t('editor.running') : t('editor.run')}
              </button>
            </section>
            <div className="order-3 flex flex-col gap-4 lg:order-none">
              <Settings mode={mode} render={render} onRender={onRender} clicks={clicks} onClicks={onClicks} onClickNow={onClickNow} />
              <Reference mode={mode} />
              <p className="px-1 text-[12px] leading-relaxed text-muted">{t('tl.keys')}</p>
            </div>
          </aside>

          <Visualizer result={result} snap={snap} mode={mode} renderOn={mode === 'browser' && render} showRaf={showRaf} stale={stale} running={running} />
        </main>

        <footer className="mx-auto w-full max-w-[1600px] px-4 pb-32 text-[12px] text-muted">{t('footer.credit')}</footer>

        <Timeline idx={Math.min(idx, Math.max(0, total - 1))} total={total} playing={playing} speed={speed} onIdx={go} onPlay={togglePlay} onSpeed={setSpeed} />
      </div>
    </MotionConfig>
  );
}
