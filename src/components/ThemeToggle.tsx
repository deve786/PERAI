import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS } from '../theme';

/**
 * One button. Tap it in dark mode and it goes light; tap it in light mode and
 * it goes dark — there is nothing else to choose. Before the first tap the app
 * simply follows the phone's own setting (see ThemeContext's default `system`
 * mode); the button's first press is what turns that into an explicit choice.
 * The label names what a tap switches to.
 */
export function ThemeToggle() {
  const { colors, scheme, setMode } = useTheme();
  const dark = scheme === 'dark';

  return (
    <Pressable
      onPress={() => setMode(dark ? 'light' : 'dark')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={dark ? 'sunny-outline' : 'moon-outline'} size={16} color={colors.graphite} />
      <Text style={[styles.label, { color: colors.ink }]}>{dark ? 'Light' : 'Dark'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontFamily: FONTS.sansSemi, fontSize: 13 },
  pressed: { opacity: 0.7 },
});
