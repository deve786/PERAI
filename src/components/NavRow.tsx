import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

/**
 * A tappable row that drills into another screen. Meant to sit inside a white
 * card (ListCard / Section): icon, label, chevron, hairline underneath.
 */
export function NavRow({ label, icon, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.graphite} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.mist} />
    </Pressable>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule,
      // Tucks the last row's hairline under the card's own border, so a card
      // of NavRows never shows a double line at the bottom.
      marginBottom: -StyleSheet.hairlineWidth,
    },
    label: { flex: 1, fontFamily: FONTS.sans, fontSize: 16, color: colors.ink },
    pressed: { opacity: 0.55 },
  });
}
