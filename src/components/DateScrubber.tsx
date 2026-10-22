import React, { useCallback, useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/ThemeContext';
import { FONTS, type Colors } from '@/theme';

interface Props {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  /** Set of YYYY-MM-DD date strings that contain entries/activity */
  activityDates?: Set<string>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/**
 * Month name with ‹ › arrows, then the week (Mon–Sun) holding the selected
 * day as seven day cards. The arrows, or a sideways swipe on the strip, move
 * a week at a time; a dot under a day means something is on it.
 */
export function DateScrubber({ selectedDate, onSelectDate, activityDates }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const todayStr = formatDate(new Date());

  const week = useMemo(() => {
    const selected = parseDate(selectedDate);
    // Monday-first: Sunday (0) is the last day of its week.
    const monday = new Date(selected);
    monday.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatDate(d);
      return { dateStr, dayName: WEEKDAYS[d.getDay()], dayNum: d.getDate() };
    });
  }, [selectedDate]);

  const selected = parseDate(selectedDate);
  const monthLabel = `${MONTHS[selected.getMonth()]} ${selected.getFullYear()}`;

  const select = useCallback(
    (dateStr: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onSelectDate(dateStr);
    },
    [onSelectDate]
  );

  // A sideways swipe on the strip moves a week: left for later, right for earlier.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < 40) return;
          select(shiftDays(selectedDate, g.dx < 0 ? 7 : -7));
        },
      }),
    [select, selectedDate]
  );

  return (
    <View style={styles.container}>
      <View style={styles.monthRow}>
        <Pressable
          onPress={() => select(shiftDays(selectedDate, -7))}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.graphite} />
        </Pressable>
        <Text style={styles.month}>{monthLabel}</Text>
        <Pressable
          onPress={() => select(shiftDays(selectedDate, 7))}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.graphite} />
        </Pressable>
      </View>

      <View style={styles.week} {...swipe.panHandlers}>
        {week.map((item) => {
          const isSelected = item.dateStr === selectedDate;
          const isToday = item.dateStr === todayStr;
          const hasDot = activityDates?.has(item.dateStr) ?? false;

          return (
            <Pressable
              key={item.dateStr}
              onPress={() => select(item.dateStr)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${item.dayName} ${item.dayNum}${isToday ? ', today' : ''}`}
              style={({ pressed }) => [
                styles.dayCell,
                isToday && !isSelected && styles.dayCellToday,
                isSelected && styles.dayCellSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected ? styles.textSelected : isToday ? styles.textToday : null,
                ]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNum,
                  isSelected ? styles.textSelected : isToday ? styles.textToday : null,
                ]}
              >
                {item.dayNum}
              </Text>
              <View style={[styles.dot, hasDot && (isSelected ? styles.dotSelected : styles.dotActive)]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: { gap: 12 },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    arrow: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
    },
    month: { fontFamily: FONTS.sansSemi, fontSize: 17, color: colors.ink },
    week: { flexDirection: 'row', gap: 6 },
    dayCell: {
      flex: 1,
      height: 64,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    dayCellToday: { borderColor: colors.moss },
    dayCellSelected: { backgroundColor: colors.mossFill, borderColor: colors.mossFill },
    pressed: { opacity: 0.7 },
    dayName: { fontFamily: FONTS.sans, fontSize: 12, color: colors.graphite },
    dayNum: { fontFamily: FONTS.sansSemi, fontSize: 17, color: colors.ink },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
    dotActive: { backgroundColor: colors.moss },
    dotSelected: { backgroundColor: colors.onAccent },
    textToday: { color: colors.moss },
    textSelected: { color: colors.onAccent },
  });
}
