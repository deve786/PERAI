import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { getSetting, setSetting } from './db/queries';
import {
  FONTS,
  GUTTER,
  PALETTES,
  SPACE,
  TYPE_SCALES,
  type ColorScheme,
  type Colors,
  type TypeScale,
} from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

const SETTING_KEY = 'themeMode';

interface ThemeValue {
  /** What the person chose: a fixed scheme, or "follow the phone". */
  mode: ThemeMode;
  /** What is actually on screen right now — `mode` resolved against the phone's setting. */
  scheme: ColorScheme;
  colors: Colors;
  type: TypeScale;
  fonts: typeof FONTS;
  space: typeof SPACE;
  gutter: typeof GUTTER;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Wraps the app once, at the root. Screens and components read the current
 * palette through `useTheme()` rather than importing static tokens, which is
 * what lets a switch between light and dark actually repaint everything —
 * every StyleSheet in the app is built from this value inside the component
 * that uses it, not once at module load.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  );

  // Load the saved preference once, after the database is guaranteed open —
  // ThemeProvider is mounted below the database gate in app/_layout.tsx.
  useEffect(() => {
    void getSetting(SETTING_KEY).then((saved) => {
      if (isThemeMode(saved)) setModeState(saved);
    });
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void setSetting(SETTING_KEY, next);
  };

  const scheme: ColorScheme = mode === 'system' ? systemScheme : mode;

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      scheme,
      colors: PALETTES[scheme],
      type: TYPE_SCALES[scheme],
      fonts: FONTS,
      space: SPACE,
      gutter: GUTTER,
      setMode,
    }),
    [mode, scheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme() must be used inside <ThemeProvider>.');
  return value;
}
