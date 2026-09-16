import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONTS, SPACE } from '../theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * Filters read as small monospace stamps, matching the category stamps in the
 * record itself — selecting one is visually "pull the rows carrying this mark".
 */
export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {label.toUpperCase()}
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
      contentContainerStyle={styles.row}
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
    <View style={styles.wrap}>
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

const styles = StyleSheet.create({
  row: { gap: 6, paddingHorizontal: SPACE.page, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  chipSelected: { backgroundColor: COLORS.moss },
  label: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 0.9,
    color: COLORS.mist,
  },
  labelSelected: { color: COLORS.paper },
});
