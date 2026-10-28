import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Paths that show the tab bar. Calendar is a tab route with no tab of its own. */
const TAB_PATHS = new Set(['/', '/expense-home', '/insights', '/ask', '/more', '/calendar']);

/** Height of the tab bar, as set in app/(tabs)/_layout.tsx. */
export const TAB_BAR_HEIGHT = 76;

/**
 * How far from the bottom of the screen something floating should sit: clear
 * of the tab bar where there is one, clear of the gesture area where there is
 * not. Shared, so the snackbar and the Ask pill never land on top of each
 * other or on top of the bar.
 */
export function useFloatingInset(gap = 12): { bottom: number; onTabs: boolean; pathname: string } {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const onTabs = TAB_PATHS.has(pathname);
  return {
    bottom: (onTabs ? TAB_BAR_HEIGHT : insets.bottom) + gap,
    onTabs,
    pathname,
  };
}
