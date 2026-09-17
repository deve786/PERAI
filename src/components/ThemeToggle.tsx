import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '../ThemeContext';

/**
 * One button. Tap it in dark mode and it goes light; tap it in light mode and
 * it goes dark — there is nothing else to choose. Before the first tap the app
 * simply follows the phone's own setting (see ThemeContext's default `system`
 * mode); the button's first press is what turns that into an explicit choice.
 */
export function ThemeToggle() {
  const { colors, scheme, setMode } = useTheme();
  const dark = scheme === 'dark';

  return (
    <Pressable
      onPress={() => setMode(dark ? 'light' : 'dark')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <Ionicons
        name={dark ? 'sunny-outline' : 'moon-outline'}
        size={22}
        color={colors.graphite}
      />
    </Pressable>
  );
}
