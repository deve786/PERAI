import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

/** A tappable row that drills into another screen — the one pattern for every list of destinations. */
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
      <Ionicons name={icon} size={19} color={colors.graphite} />
      <Text style={styles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.mist} />
    </Pressable>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule,
    },
    label: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: colors.ink },
    pressed: { opacity: 0.55 },
  });
}
