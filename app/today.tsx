import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { completeMemory } from '@/complete';
import { planDay } from '@/today';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useMemories } from '@/useMemories';

/**
 * What to do now.
 *
 * Open work used to be spread across the Timeline, the Lists and three rows on
 * Record, so nothing answered "what should I be doing" in one look. Overdue
 * comes first because that is what gets lost; tomorrow is there so the day
 * does not end in a surprise.
 *
 * Tapping a row ticks it off — or moves a repeating one to its next turn.
 * Long-pressing opens the entry, where it can be moved or corrected.
 */
export default function TodayScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const { memories, loading } = useMemories();
  const plan = useMemo(() => planDay(memories), [memories]);

  const open = (memory: Memory) => router.push(`/entry/${memory.id}`);
  const tick = (memory: Memory) => void completeMemory(memory);

  const rows = (list: Memory[]) =>
    list.map((memory) => (
      <MemoryRow
        key={memory.id}
        memory={memory}
        gutter="date"
        showAdded={false}
        onPress={() => tick(memory)}
        onLongPress={() => open(memory)}
      />
    ));

  const nothing = plan.overdue.length + plan.today.length + plan.tomorrow.length === 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>Today</Text>

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
          Tap to tick off. Hold to move it or change it.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 68, paddingBottom: 48, gap: 26 },
    clear: { maxWidth: 320 },
    hint: { marginTop: 4 },
  });
}
