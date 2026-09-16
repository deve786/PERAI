import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, GUTTER, SPACE, TYPE } from '../theme';
import { formatAmount, shortDate, timeLabel } from '../format';
import type { Memory } from '../types';

interface Props {
  memory: Memory;
  /**
   * What the left gutter carries. The Timeline groups by day, so the day is
   * already stated in the section header and the row shows the clock time.
   * Evidence under an answer is ungrouped, so it shows the date instead.
   */
  gutter?: 'time' | 'date';
  onPress?: () => void;
  onLongPress?: () => void;
}

/**
 * One entry in the record.
 *
 * This is the app's signature form: a fixed-width monospace gutter carrying
 * when it happened, and the language of the entry to its right. The Ask tab
 * renders its evidence with this exact component, so the proof behind an
 * answer is visually continuous with the archive it came from.
 */
export function MemoryRow({ memory, gutter = 'time', onPress, onLongPress }: Props) {
  const amount = formatAmount(memory.amount, memory.currency);
  const mark =
    gutter === 'time' ? timeLabel(memory.eventDate) : shortDate(memory.eventDate);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <Text style={[TYPE.gutter, styles.mark]}>{mark}</Text>

      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[TYPE.entry, styles.title]}>{memory.title}</Text>
          {amount ? <Text style={TYPE.figure}>{amount}</Text> : null}
        </View>

        <Text style={TYPE.stamp} numberOfLines={1}>
          {[
            memory.category.toUpperCase(),
            memory.type !== 'memory' ? memory.type.toUpperCase() : null,
            memory.location?.toUpperCase(),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: SPACE.tight + 4,
    gap: 4,
  },
  pressed: { opacity: 0.45 },
  mark: {
    width: GUTTER,
    paddingTop: 2,
  },
  body: { flex: 1, gap: 5 },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: { flex: 1, color: COLORS.ink },
});
