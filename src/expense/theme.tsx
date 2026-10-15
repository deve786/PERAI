import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSetting, setSetting } from './db';
import { useTheme as usePeraiTheme } from '../ThemeContext';
import { FONTS as PERAI_FONTS, PALETTES } from '../theme';

/**
 * Same shape as before the merge, so no screen needed to change its imports —
 * only the values moved: every one now derives from PERAI's own palette
 * (src/theme.ts), so Expense mode shares PERAI's exact paper-and-ink,
 * single-accent design language rather than keeping a separate one.
 */
export type Colors = {
  bg: string;
  card: string;
  text: string;
  sub: string;
  faint: string;
  line: string;
  /** Solid high-contrast fill for primary actions — PERAI's one accent, moss. */
  ink: string;
  inkText: string;
  /** The single accent. Only ever used to mean "pay attention to this". */
  accent: string;
  accentSoft: string;
  danger: string;
  good: string;
  /** Between comfortable and spent — the only amber in the app. */
  warn: string;
};

function colorsFor(scheme: 'light' | 'dark'): Colors {
  const p = PALETTES[scheme];
  return {
    bg: p.paper,
    card: p.surface,
    text: p.ink,
    sub: p.graphite,
    faint: p.mist,
    line: p.rule,
    ink: p.moss,
    inkText: p.onAccent,
    accent: p.moss,
    accentSoft: p.mossSoft,
    danger: p.alert,
    good: p.moss,
    // The palette has no amber, and a budget at 80% is neither fine nor over.
    // Readable on both paper and the dark surface.
    warn: scheme === 'dark' ? '#D9A441' : '#B07D1A',
  };
}

/** PERAI's rule: mono for data (amounts, dates, counts), sans for language. */
export const FONTS = {
  sans: PERAI_FONTS.sans,
  sansMedium: PERAI_FONTS.sansMedium,
  sansSemi: PERAI_FONTS.sansSemi,
  mono: PERAI_FONTS.mono,
  monoMedium: PERAI_FONTS.monoMedium,
};

/** IBM Plex Mono is already fixed-width, so this is belt-and-suspenders, not load-bearing. */
export const numerals = { fontVariant: ['tabular-nums' as const] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Kept small and square-ish throughout — PERAI has no rounded "card" boxes. */
export const radius = { sm: 3, md: 4, lg: 6, pill: 999 };

export type ThemeMode = 'system' | 'light' | 'dark';

type Ctx = {
  c: Colors;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  symbol: string;
  setSymbol: (s: string) => void;
  budget: number;
  setBudget: (n: number) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

/**
 * Expense-specific state (currency, budget) lives here; light/dark itself is
 * no longer Expense's own setting — it follows PERAI's single global toggle,
 * so there's exactly one dark-mode control for the whole app, not two.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const perai = usePeraiTheme();
  const [symbol, setSymbolState] = useState('₹');
  const [budget, setBudgetState] = useState(0);

  useEffect(() => {
    (async () => {
      setSymbolState(await getSetting('symbol', '₹'));
      setBudgetState(Number(await getSetting('budget', '0')) || 0);
    })();
  }, []);

  const value = useMemo<Ctx>(() => ({
    c: colorsFor(perai.scheme),
    mode: perai.mode,
    isDark: perai.scheme === 'dark',
    symbol,
    budget,
    setMode: perai.setMode,
    setSymbol: (s) => { setSymbolState(s); setSetting('symbol', s); },
    setBudget: (n) => { setBudgetState(n); setSetting('budget', String(n)); },
  }), [perai.scheme, perai.mode, perai.setMode, symbol, budget]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('ThemeProvider missing');
  return v;
}

/** Budget pressure drives the only colour in the interface. */
export function budgetTone(pct: number, c: Colors) {
  if (pct >= 1) return c.danger;
  if (pct >= 0.8) return c.accent;
  return c.text;
}
