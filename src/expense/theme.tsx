import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getSetting, setSetting } from './db';

export type Colors = {
  bg: string;
  card: string;
  text: string;
  sub: string;
  faint: string;
  line: string;
  /** Solid high-contrast fill for primary actions — monochrome by design. */
  ink: string;
  inkText: string;
  /** The single accent. Only ever used to mean "pay attention to this". */
  accent: string;
  accentSoft: string;
  danger: string;
  good: string;
};

const light: Colors = {
  bg: '#FAFAFA', card: '#FFFFFF', text: '#0A0A0A', sub: '#6B6B6B', faint: '#A3A3A3', line: '#E7E7E7',
  ink: '#0A0A0A', inkText: '#FFFFFF',
  accent: '#A8761A', accentSoft: '#F6EAD2',
  danger: '#C2342F', good: '#2F7D55',
};

const dark: Colors = {
  bg: '#0A0A0A', card: '#161616', text: '#F5F5F5', sub: '#8F8F8F', faint: '#5C5C5C', line: '#242424',
  ink: '#F5F5F5', inkText: '#0A0A0A',
  accent: '#E0A83E', accentSoft: '#2A2113',
  danger: '#E5706B', good: '#4FB783',
};

/** Money is read in columns, so every amount uses the same tabular figures. */
export const numerals = { fontVariant: ['tabular-nums' as const] };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [symbol, setSymbolState] = useState('₹');
  const [budget, setBudgetState] = useState(0);

  useEffect(() => {
    (async () => {
      setModeState((await getSetting('theme', 'dark')) as ThemeMode);
      setSymbolState(await getSetting('symbol', '₹'));
      setBudgetState(Number(await getSetting('budget', '0')) || 0);
    })();
  }, []);

  const value = useMemo<Ctx>(() => {
    const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
    return {
      c: isDark ? dark : light,
      mode,
      isDark,
      symbol,
      budget,
      setMode: (m) => { setModeState(m); setSetting('theme', m); },
      setSymbol: (s) => { setSymbolState(s); setSetting('symbol', s); },
      setBudget: (n) => { setBudgetState(n); setSetting('budget', String(n)); },
    };
  }, [mode, system, symbol, budget]);

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
