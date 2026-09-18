import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { GUTTER, SPACE, type Colors } from '../theme';
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
  /** Hide the ADDED line where it is noise, e.g. in Coming up. */
  showAdded?: boolean;
  /** Struck through and dimmed: a list item already played, watched or bought. */
  struck?: boolean;
}

/**
 * One entry in the record.
 *
 * This is the app's signature form: a fixed-width monospace gutter carrying
 * when it happened, and the language of the entry to its right. The Ask tab
 * renders its evidence with this exact component, so the proof behind an
 * answer is visually continuous with the archive it came from.
 */
export function MemoryRow({
  memory,
  gutter = 'time',
  onPress,
  onLongPress,
  showAdded = true,
  struck = false,
}: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

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
      style={({ pressed }) => [
        styles.row,
        struck && styles.struckRow,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <Text style={[type.gutter, styles.mark]}>{mark}</Text>

      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[type.entry, styles.title, struck && styles.struckTitle]}>
            {memory.title}
          </Text>
          {amount ? <Text style={type.figure}>{amount}</Text> : null}
        </View>

        <Text style={type.stamp}>
          {[
            memory.category.toUpperCase(),
            memory.type !== 'memory' ? memory.type.toUpperCase() : null,
            memory.location?.toUpperCase(),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>

        {/* Its own line: sharing the category line got it truncated to "ADDED 16 …". */}
        {showAdded ? <Text style={type.stamp}>{added}</Text> : null}

        {remindsAt ? (
          <Text style={[type.stamp, styles.reminds]}>
            REMINDS YOU {reminderLabel(remindsAt)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
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
    title: { flex: 1, color: colors.ink },
    struckRow: { opacity: 0.55 },
    struckTitle: { textDecorationLine: 'line-through', color: colors.graphite },
    reminds: { color: colors.moss },
  });
}
