import { Fragment } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { Mode, Narration as N } from '../sim/types';

export function NarrationText({ narr, mode }: { narr: N; mode: Mode }) {
  const { tpl, t, num } = useI18n();
  const parts = tpl(narr.key, mode).split(/(\{\w+\})/);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const value = narr.params?.[m[1]];
        if (value == null) return null;
        if (m[1] === 'phase') return <strong key={i} className="font-semibold">{t(`phase.${value}`)}</strong>;
        if (typeof value === 'number') return <strong key={i} className="font-semibold tabular-nums">{num(value)}</strong>;
        return (
          <bdi key={i} className="chip">
            {value}
          </bdi>
        );
      })}
    </>
  );
}
