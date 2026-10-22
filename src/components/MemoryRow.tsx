import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { type Colors } from '../theme';
import { addedLabel, formatAmount, hasStatedTime, shortDate, timeLabel, toSentence } from '../format';
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
 * One entry in the record: title (and amount) on top, then one quiet line of
 * what it is and when — "Reminder · Bills · 10:00 AM". The Ask tab renders
 * its evidence with this same component, so the proof behind an answer looks
 * like the record it came from.
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
  // A clock time appears only if the note stated one — never an invented time.
  const when =
    gutter === 'date'
      ? shortDate(memory.eventDate)
      : hasStatedTime(memory.dateExpression)
        ? timeLabel(memory.eventDate)
        : null;
  const added = toSentence(addedLabel(memory));
  const remindsAt = reminderTime(memory);
  const meta = [
    memory.type !== 'memory' ? capitalise(memory.type) : null,
    memory.category ? capitalise(memory.category) : null,
    memory.location || null,
    when,
  ]
    .filter(Boolean)
    .join(' · ');

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
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[type.entry, styles.title, struck && styles.struckTitle]}>
            {memory.title}
          </Text>
          {amount ? <Text style={type.figure}>{amount}</Text> : null}
        </View>

        {meta ? <Text style={type.stamp}>{meta}</Text> : null}

        {showAdded ? <Text style={[type.stamp, styles.added]}>{added}</Text> : null}

        {remindsAt ? (
          <Text style={[type.stamp, styles.reminds]}>
            Reminds you {toSentence(reminderLabel(remindsAt))}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** "personal care" / "PERSONAL CARE" → "Personal care". */
function capitalise(text: string) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    pressed: { opacity: 0.5 },
    body: { gap: 3 },
    titleLine: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: { flex: 1, color: colors.ink },
    added: { color: colors.mist },
    struckRow: { opacity: 0.55 },
    struckTitle: { textDecorationLine: 'line-through', color: colors.graphite },
    reminds: { color: colors.moss },
  });
}
