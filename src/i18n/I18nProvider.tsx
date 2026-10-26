import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { dictionaries, type Lang } from './strings';
import type { Mode } from '../sim/types';

type Params = Record<string, string | number>;

interface I18n {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  /** raw template, honoring "@node" overrides */
  tpl: (key: string, mode?: Mode) => string;
  t: (key: string, params?: Params, mode?: Mode) => string;
  num: (n: number, digits?: number) => string;
}

const Ctx = createContext<I18n | null>(null);

function detect(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'fa') return saved;
  } catch {
    /* storage unavailable */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => /^fa\b|^fa-/i.test(l)) ? 'fa' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const dir = lang === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = dictionaries[lang]['app.title'];
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const d = dictionaries[lang];
    const tpl = (key: string, mode?: Mode) => (mode === 'node' && d[`${key}@node`]) || d[key] || dictionaries.en[key] || key;
    const fmt = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: 2 });
    const num = (n: number, digits?: number) =>
      digits == null ? fmt.format(n) : new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { maximumFractionDigits: digits }).format(n);
    const t = (key: string, params?: Params, mode?: Mode) =>
      tpl(key, mode).replace(/\{(\w+)\}/g, (_, k) => {
        const v = params?.[k];
        return v == null ? '' : typeof v === 'number' ? num(v) : v;
      });
    return { lang, dir, setLang, tpl, t, num };
  }, [lang, dir, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside provider');
  return v;
}
