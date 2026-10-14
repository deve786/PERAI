import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSetting, setSetting } from './db/queries';

export type AppMode = 'perai' | 'expense';

export const APP_MODE_KEY = 'appMode';
const SETTING_KEY = APP_MODE_KEY;

interface AppModeValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const AppModeContext = createContext<AppModeValue | null>(null);

function isAppMode(value: string | null): value is AppMode {
  return value === 'perai' || value === 'expense';
}

/**
 * Wraps the app once, at the root, below the database gate — same spot as
 * ThemeProvider. Lets PERAI and the Expense tracker coexist as two
 * independent "zones" under one app shell, switched by ModeToggle.
 */
export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>('perai');

  useEffect(() => {
    void getSetting(SETTING_KEY).then((saved) => {
      if (isAppMode(saved)) setModeState(saved);
    });
  }, []);

  const setMode = (next: AppMode) => {
    setModeState(next);
    void setSetting(SETTING_KEY, next);
  };

  const value = useMemo<AppModeValue>(() => ({ mode, setMode }), [mode]);

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode(): AppModeValue {
  const value = useContext(AppModeContext);
  if (!value) throw new Error('useAppMode() must be used inside <AppModeProvider>.');
  return value;
}
