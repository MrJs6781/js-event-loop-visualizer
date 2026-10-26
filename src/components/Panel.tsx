import type { CSSProperties, ReactNode } from 'react';

export type Lane = 'stack' | 'api' | 'task' | 'micro' | 'render' | 'tick' | 'muted';

export const laneVar = (lane: Lane) => (lane === 'muted' ? 'var(--muted)' : `var(--lane-${lane})`);

interface Props {
  title: string;
  sub?: string;
  lane: Lane;
  focused?: boolean;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, sub, lane, focused, right, className = '', bodyClassName = '', children }: Props) {
  return (
    <section
      style={{ '--lane': laneVar(lane) } as CSSProperties}
      className={`flex min-w-0 flex-col rounded-2xl border border-line bg-surface transition-shadow duration-300 ${focused ? 'panel-focus' : ''} ${className}`}
    >
      <header className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="lane-bar h-3.5 w-1 shrink-0 rounded-full" aria-hidden />
        <h2 className="whitespace-nowrap text-[13px] font-semibold leading-none">{title}</h2>
        {sub && (
          <span dir="ltr" className="truncate font-mono text-[11px] leading-none text-muted max-sm:hidden">
            {sub}
          </span>
        )}
        {right && <div className="ms-auto shrink-0">{right}</div>}
      </header>
      <div className={`min-h-0 flex-1 px-3 pb-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
