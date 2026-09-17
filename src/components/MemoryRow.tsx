import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, GUTTER, SPACE, TYPE } from '../theme';
import { addedLabel, formatAmount, hasStatedTime, shortDate, timeLabel } from '../format';
import { reminderLabel, reminderTime } from '../reminderTime';
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
  // A clock time appears only if the note stated one; otherwise the gutter
  // holds a dash rather than an invented time.
  const mark =
    gutter === 'date'
      ? shortDate(memory.eventDate)
      : hasStatedTime(memory.dateExpression)
        ? timeLabel(memory.eventDate)
        : '—';
  const added = addedLabel(memory);
  const remindsAt = reminderTime(memory);

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

        <Text style={TYPE.stamp}>
          {[
            memory.category.toUpperCase(),
            memory.type !== 'memory' ? memory.type.toUpperCase() : null,
            memory.location?.toUpperCase(),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>

        {/* Its own line: sharing the category line got it truncated to "ADDED 16 …". */}
        <Text style={TYPE.stamp}>{added}</Text>

        {remindsAt ? (
          <Text style={[TYPE.stamp, styles.reminds]}>
            REMINDS YOU {reminderLabel(remindsAt)}
          </Text>
        ) : null}
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
  reminds: { color: COLORS.moss },
});
