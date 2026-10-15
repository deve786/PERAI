import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';

interface Props {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  /** Set of YYYY-MM-DD date strings that contain entries/activity */
  activityDates?: Set<string>;
  daysRange?: number; // default 7 before and 7 after = 15 days
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DateScrubber({
  selectedDate,
  onSelectDate,
  activityDates = new Set(),
  daysRange = 7,
}: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const scrollRef = useRef<ScrollView>(null);

  const todayStr = formatDate(new Date());

  // Generate date items: -daysRange to +daysRange around today
  const dates = React.useMemo(() => {
    const list: { dateStr: string; dayName: string; dayNum: number; isToday: boolean }[] = [];
    const base = new Date();
    for (let i = -daysRange; i <= daysRange; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const dateStr = formatDate(d);
      list.push({
        dateStr,
        dayName: WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
      });
    }
    return list;
  }, [daysRange, todayStr]);

  // Auto-scroll to center the selected date on mount or selection
  useEffect(() => {
    const idx = dates.findIndex((item) => item.dateStr === selectedDate);
    if (idx !== -1 && scrollRef.current) {
      // Each item is approx 48px wide + 8px gap = 56px
      const x = Math.max(0, idx * 56 - 130);
      scrollRef.current.scrollTo({ x, animated: true });
    }
  }, [selectedDate, dates]);

  const handleSelect = (dateStr: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelectDate(dateStr);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {dates.map((item) => {
          const isSelected = item.dateStr === selectedDate;
          const hasDot = activityDates.has(item.dateStr);

          return (
            <Pressable
              key={item.dateStr}
              onPress={() => handleSelect(item.dateStr)}
              style={({ pressed }) => [
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                item.isToday && !isSelected && styles.dayCellToday,
                pressed && styles.pressed,
              ]}
              hitSlop={4}
            >
              <Text
                style={[
                  styles.dayName,
                  isSelected ? styles.textSelected : styles.textDim,
                  item.isToday && !isSelected ? styles.textToday : null,
                ]}
              >
                {item.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNum,
                  isSelected ? styles.textSelected : styles.textInk,
                  item.isToday && !isSelected ? styles.textToday : null,
                ]}
              >
                {item.dayNum}
              </Text>
              <View style={styles.dotContainer}>
                {hasDot ? (
                  <View
                    style={[
                      styles.dot,
                      isSelected ? styles.dotSelected : styles.dotActive,
                    ]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    container: {
      marginVertical: 4,
    },
    scrollContent: {
      paddingHorizontal: 4,
      gap: 8,
      alignItems: 'center',
    },
    dayCell: {
      width: 48,
      height: 64,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    dayCellToday: {
      borderColor: colors.moss,
      borderWidth: 1.5,
    },
    dayCellSelected: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    pressed: {
      opacity: 0.8,
    },
    dayName: {
      fontFamily: FONTS.mono,
      fontSize: 10,
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    dayNum: {
      fontFamily: FONTS.mono,
      fontSize: 16,
      fontWeight: '600',
    },
    dotContainer: {
      height: 6,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 2,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    dotActive: {
      backgroundColor: colors.moss,
    },
    dotSelected: {
      backgroundColor: colors.paper,
    },
    textDim: {
      color: colors.mist,
    },
    textInk: {
      color: colors.ink,
    },
    textToday: {
      color: colors.moss,
      fontWeight: '600',
    },
    textSelected: {
      color: colors.paper,
      fontWeight: '700',
    },
  });
}
