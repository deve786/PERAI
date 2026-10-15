import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DailyBriefing } from '@/components/DailyBriefing';
import { DateScrubber } from '@/components/DateScrubber';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { SnoozeModal } from '@/components/SnoozeModal';
import { completeMemory } from '@/complete';
import { planDay } from '@/today';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useMemories } from '@/useMemories';

function getTodayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function TodayScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const todayStr = useMemo(() => getTodayString(), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [snoozingMemory, setSnoozingMemory] = useState<Memory | null>(null);

  const { memories, loading } = useMemories();
  const plan = useMemo(() => planDay(memories), [memories]);

  // Set of dates that have active memories for the scrubber dot indicator
  const activityDates = useMemo(() => {
    const dates = new Set<string>();
    for (const m of memories) {
      if (m.status === 'active' && m.eventDate) {
        dates.add(m.eventDate.slice(0, 10));
      }
    }
    return dates;
  }, [memories]);

  // Memories on the explicitly selected date if different from today
  const selectedDateMemories = useMemo(() => {
    if (selectedDate === todayStr) return [];
    return memories.filter((m) => m.eventDate && m.eventDate.slice(0, 10) === selectedDate);
  }, [memories, selectedDate, todayStr]);

  const open = (memory: Memory) => router.push(`/entry/${memory.id}`);
  const tick = (memory: Memory) => void completeMemory(memory);

  const rows = (list: Memory[]) =>
    list.map((memory) => (
      <View key={memory.id} style={styles.rowContainer}>
        <View style={styles.rowMain}>
          <MemoryRow
            memory={memory}
            gutter="date"
            showAdded={false}
            onPress={() => tick(memory)}
            onLongPress={() => open(memory)}
          />
        </View>
        <Pressable
          onPress={() => setSnoozingMemory(memory)}
          hitSlop={10}
          style={({ pressed }) => [styles.snoozeButton, pressed && styles.snoozeButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Snooze ${memory.title}`}
        >
          <Ionicons name="alarm-outline" size={17} color={colors.mist} />
        </Pressable>
      </View>
    ));

  const isViewingToday = selectedDate === todayStr;
  const nothing = plan.overdue.length + plan.today.length + plan.tomorrow.length === 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={type.display}>Today</Text>
        {!isViewingToday ? (
          <Pressable
            onPress={() => setSelectedDate(todayStr)}
            hitSlop={8}
            style={styles.todayBadge}
          >
            <Ionicons name="return-up-back" size={13} color={colors.moss} />
            <Text style={[type.label, styles.todayBadgeText]}>JUMP TO TODAY</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Feature 4: Proactive AI Daily Morning Briefing */}
      <DailyBriefing memories={memories} onOpenEntry={open} />

      {/* Feature 12: Calendar Strip / Activity Date Scrubbing */}
      <DateScrubber
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        activityDates={activityDates}
      />

      {isViewingToday ? (
        <>
          {plan.overdue.length > 0 ? (
            <Section label={`OVERDUE · ${plan.overdue.length}`}>{rows(plan.overdue)}</Section>
          ) : null}

          {plan.today.length > 0 ? (
            <Section label="TODAY" tone="ahead">
              {rows(plan.today)}
            </Section>
          ) : null}

          {plan.tomorrow.length > 0 ? (
            <Section label="TOMORROW">{rows(plan.tomorrow)}</Section>
          ) : null}

          {!loading && nothing ? (
            <Text style={[type.body, styles.clear]}>
              Nothing due today or tomorrow. Anything you record with a date shows
              up here.
            </Text>
          ) : null}

          {!nothing ? (
            <Text style={[type.fine, styles.hint]}>
              Tap to tick off. Snooze icon for quick delay. Hold to move or edit.
            </Text>
          ) : null}
        </>
      ) : (
        <Section label={`ENTRIES · ${selectedDate}`}>
          {selectedDateMemories.length > 0 ? (
            rows(selectedDateMemories)
          ) : (
            <Text style={[type.body, styles.clear]}>
              No events or tasks recorded for {selectedDate}.
            </Text>
          )}
        </Section>
      )}

      {/* Feature 5: One-Tap Quick Snooze Modal */}
      <SnoozeModal
        visible={Boolean(snoozingMemory)}
        memory={snoozingMemory}
        onClose={() => setSnoozingMemory(null)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 56, paddingBottom: 48, gap: 20 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    todayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    todayBadgeText: {
      color: colors.moss,
      fontSize: 10,
    },
    clear: { maxWidth: 320 },
    hint: { marginTop: 4 },
    rowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowMain: {
      flex: 1,
    },
    snoozeButton: {
      padding: 8,
      marginLeft: 4,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    snoozeButtonPressed: {
      opacity: 0.6,
      backgroundColor: colors.surface,
    },
  });
}
