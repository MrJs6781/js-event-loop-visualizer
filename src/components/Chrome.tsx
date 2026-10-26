import { useState, type ReactNode } from 'react';
import {
  ChevronDown, Link2, Moon, MousePointerClick, Pause, Play, Plus, SkipBack, SkipForward,
  StepBack, StepForward, Sun, X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import type { Example } from '../examples';
import type { Mode } from '../sim/types';

// ───────────────────────── header ─────────────────────────

interface HeaderProps {
  mode: Mode;
  onMode: (m: Mode) => void;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onShare: () => void;
  shared: boolean;
}

export function Header({ mode, onMode, theme, onTheme, onShare, shared }: HeaderProps) {
  const { t, lang, setLang } = useI18n();
  return (
    <header className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
          <circle cx="16" cy="16" r="11" fill="none" stroke="rgb(var(--lane-stack))" strokeWidth="3.5" />
          <circle cx="16" cy="5" r="3.6" fill="rgb(var(--lane-task))" />
          <circle cx="25.5" cy="21.5" r="3.6" fill="rgb(var(--lane-micro))" />
          <circle cx="6.5" cy="21.5" r="3.6" fill="rgb(var(--lane-render))" />
        </svg>
        <div>
          <h1 className="text-[19px] font-semibold leading-tight tracking-tight">{t('app.title')}</h1>
          <p className="text-[13px] leading-tight text-muted">{t('app.tagline')}</p>
        </div>
      </div>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t('mode.label')} className="flex rounded-xl border border-line bg-surface p-1">
          {(['browser', 'node'] as Mode[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                mode === m ? 'bg-ink text-surface' : 'text-muted hover:text-ink'
              }`}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
        <IconButton label={t('lang.switch')} onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>
          <span className="px-1 text-[13px] font-medium">{t('lang.switch')}</span>
        </IconButton>
        <IconButton label={t('theme.toggle')} onClick={onTheme}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
        <IconButton label={t('share.copy')} onClick={onShare}>
          <Link2 size={16} />
          <span className="text-[13px] font-medium">{shared ? t('share.copied') : t('share.copy')}</span>
        </IconButton>
      </div>
    </header>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-ink transition-colors hover:bg-raised"
    >
      {children}
    </button>
  );
}

// ───────────────────────── side controls ─────────────────────────

interface ExamplePickerProps {
  examples: Example[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ExamplePicker({ examples, selected, onSelect }: ExamplePickerProps) {
  const { t, lang } = useI18n();
  const current = examples.find((e) => e.id === selected);
  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="sr-only">{t('editor.examples')}</span>
        <div className="relative">
          <select
            value={selected ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="w-full appearance-none rounded-xl border border-line bg-raised py-2 pe-9 ps-3 text-[14px] font-medium text-ink"
          >
            {!selected && <option value="">{t('editor.custom')}</option>}
            {examples.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title[lang]}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        </div>
      </label>
      {current && <p className="text-[13px] leading-relaxed text-muted">{current.note[lang]}</p>}
    </div>
  );
}

interface SettingsProps {
  mode: Mode;
  render: boolean;
  onRender: (v: boolean) => void;
  clicks: number[];
  onClicks: (c: number[]) => void;
  onClickNow: () => void;
}

export function Settings({ mode, render, onRender, clicks, onClicks, onClickNow }: SettingsProps) {
  const { t, num } = useI18n();
  const [draft, setDraft] = useState('');
  if (mode === 'node') return null;

  const add = () => {
    const v = Math.round(Number(draft));
    if (!Number.isFinite(v) || v < 0 || draft.trim() === '') return;
    onClicks([...new Set([...clicks, v])].sort((a, b) => a - b));
    setDraft('');
  };

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={render} onChange={(e) => onRender(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--lane-render))]" />
        <span>
          <span className="block text-[14px] font-medium">{t('settings.render')}</span>
          <span className="block text-[12.5px] leading-relaxed text-muted">{t('settings.renderHint')}</span>
        </span>
      </label>

      <div className="space-y-2">
        <div>
          <span className="block text-[14px] font-medium">{t('settings.clicks')}</span>
          <span className="block text-[12.5px] leading-relaxed text-muted">{t('settings.clicksHint')}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {clicks.map((c) => (
            <span key={c} className="flex items-center gap-1 rounded-lg bg-task/10 py-0.5 pe-1 ps-2 text-[12.5px] text-task">
              <MousePointerClick size={12} aria-hidden />
              <span className="tabular-nums">{num(c)}</span>
              <button
                type="button"
                onClick={() => onClicks(clicks.filter((x) => x !== c))}
                aria-label={t('settings.clickRemove', { t: c })}
                className="rounded p-0.5 hover:bg-task/20"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {!clicks.length && <span className="text-[12.5px] text-muted">{t('settings.clickEmpty')}</span>}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label={t('settings.clickInput')}
            placeholder="ms"
            dir="ltr"
            className="w-24 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[13px]"
          />
          <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] hover:bg-raised">
            <Plus size={14} aria-hidden />
            {t('settings.clickAdd')}
          </button>
          <button type="button" onClick={onClickNow} className="ms-auto flex items-center gap-1 rounded-lg bg-task/10 px-2.5 py-1.5 text-[13px] text-task hover:bg-task/20">
            <MousePointerClick size={14} aria-hidden />
            {t('settings.clickNow')}
          </button>
        </div>
      </div>
    </section>
  );
}

const REF: Record<Mode, { code: string; key: string }[]> = {
  browser: [
    { code: 'block(ms)', key: 'ref.block' },
    { code: 'setTimeout / setInterval', key: 'ref.timers' },
    { code: 'Promise, async / await', key: 'ref.promise' },
    { code: "fetch(url, { delay })", key: 'ref.fetch' },
    { code: "button.addEventListener('click', fn)", key: 'ref.events' },
    { code: 'requestAnimationFrame(fn)', key: 'ref.raf' },
  ],
  node: [
    { code: 'block(ms)', key: 'ref.block' },
    { code: 'setTimeout / setInterval', key: 'ref.timers' },
    { code: 'process.nextTick(fn)', key: 'ref.nextTick' },
    { code: 'setImmediate(fn)', key: 'ref.immediate' },
    { code: 'Promise, async / await', key: 'ref.promise' },
    { code: "require('fs').readFile / readFileSync", key: 'ref.fs' },
    { code: "fetch(url, { delay })", key: 'ref.fetch' },
  ],
};

export function Reference({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  return (
    <details className="group rounded-2xl border border-line bg-surface p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-medium">
        {t('ref.title')}
        <ChevronDown size={16} className="text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="mt-3 space-y-3">
        {REF[mode].map((r) => (
          <div key={r.code}>
            <dt dir="ltr" className="text-start font-mono text-[12.5px] text-stack [unicode-bidi:plaintext]">
              {r.code}
            </dt>
            <dd className="text-[12.5px] leading-relaxed text-muted">{t(r.key)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ───────────────────────── timeline ─────────────────────────

interface TimelineProps {
  idx: number;
  total: number;
  playing: boolean;
  speed: number;
  onIdx: (i: number) => void;
  onPlay: () => void;
  onSpeed: (s: number) => void;
}

export function Timeline({ idx, total, playing, speed, onIdx, onPlay, onSpeed }: TimelineProps) {
  const { t, num } = useI18n();
  const last = Math.max(0, total - 1);
  const btn = 'grid h-10 w-10 place-items-center rounded-xl text-ink transition-colors hover:bg-raised disabled:opacity-35 disabled:hover:bg-transparent';
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        {/* media controls keep their left-to-right direction in every language */}
        <div dir="ltr" className="flex items-center gap-1">
          <button className={btn} onClick={() => onIdx(0)} disabled={!total || idx === 0} aria-label={t('tl.first')} title={t('tl.first')}>
            <SkipBack size={18} />
          </button>
          <button className={btn} onClick={() => onIdx(idx - 1)} disabled={!total || idx === 0} aria-label={t('tl.prev')} title={t('tl.prev')}>
            <StepBack size={18} />
          </button>
          <button
            onClick={onPlay}
            disabled={total < 2}
            aria-label={playing ? t('tl.pause') : t('tl.play')}
            title={playing ? t('tl.pause') : t('tl.play')}
            className="grid h-11 w-11 place-items-center rounded-full bg-stack text-white transition-transform hover:scale-105 disabled:opacity-40 dark:text-bg"
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="translate-x-px" />}
          </button>
          <button className={btn} onClick={() => onIdx(idx + 1)} disabled={!total || idx >= last} aria-label={t('tl.next')} title={t('tl.next')}>
            <StepForward size={18} />
          </button>
          <button className={btn} onClick={() => onIdx(last)} disabled={!total || idx >= last} aria-label={t('tl.last')} title={t('tl.last')}>
            <SkipForward size={18} />
          </button>
        </div>

        <input
          dir="ltr"
          type="range"
          min={0}
          max={last}
          value={Math.min(idx, last)}
          onChange={(e) => onIdx(Number(e.target.value))}
          disabled={!total}
          aria-label={t('tl.scrub')}
          className="order-last min-w-[200px] flex-1 basis-full sm:order-none sm:basis-auto"
        />

        <span className="tabular-nums text-[13px] text-muted">{t('tl.step', { i: num(total ? idx + 1 : 0), n: num(total) })}</span>

        <label className="flex items-center gap-2 text-[13px] text-muted">
          {t('tl.speed')}
          <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))} className="rounded-lg border border-line bg-raised px-2 py-1 text-ink">
            {[0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {num(s)}×
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
