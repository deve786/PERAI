import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS, SPACE, type Colors } from '../theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** "PERSONAL CARE" / "personal care" → "Personal care". */
function sentence(label: string) {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Filters read as small monospace stamps, matching the category stamps in the
 * record itself — selecting one is visually "pull the rows carrying this mark".
 */
export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  const styles = makeChipStyles(colors);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {sentence(label)}
      </Text>
    </Pressable>
  );
}

interface ChipRowProps<T extends string> {
  options: readonly T[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** Label for the "no filter" chip. Omit to hide it. */
  allLabel?: string;
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  allLabel,
}: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={layout.row}
    >
      {allLabel ? (
        <Chip label={allLabel} selected={value === null} onPress={() => onChange(null)} />
      ) : null}
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={value === option}
          onPress={() => onChange(value === option ? null : option)}
        />
      ))}
    </ScrollView>
  );
}

/** Non-scrolling wrapping group, for the preview sheet's field pickers. */
export function ChipWrap<T extends string>({
  options,
  value,
  onChange,
}: Omit<ChipRowProps<T>, 'allLabel'>) {
  return (
    <View style={layout.wrap}>
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={value === option}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}

// Layout only — no colours, so this never needs to change with the theme.
const layout = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: SPACE.page, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

function makeChipStyles(colors: Colors) {
  return StyleSheet.create({
    chip: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 13,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
    label: {
      fontFamily: FONTS.sans,
      fontSize: 14,
      color: colors.ink,
    },
    labelSelected: { color: colors.paper, fontFamily: FONTS.sansSemi },
  });
}
