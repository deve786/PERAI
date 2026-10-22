import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { useTheme } from '@/expense/theme';
import { Card, Screen, T, TopBar } from '@/expense/ui';
import { formatAmount, shortDate } from '@/format';
import { weekInReview } from '@/review';
import { useMemories } from '@/useMemories';

/** "22 Oct" — shortDate pads the day ("05 Oct"); the range reads better without. */
function day(date: Date) {
  return shortDate(date.toISOString()).replace(/^0/, '');
}

/**
 * The week, counted up.
 *
 * Opened from the Sunday evening reminder, or from the Today screen. Every
 * figure is worked out on the phone from the record itself, so this costs no
 * AI call and works with no network — see src/review.ts.
 */
export default function ReviewScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const { memories, loading } = useMemories();
  const week = useMemo(() => weekInReview(memories), [memories]);

  const spent = week.spent
    .map(({ currency, total }) => formatAmount(total, currency) ?? String(total))
    .join(' · ');

  const quiet =
    week.finished.length === 0 &&
    week.recorded.length === 0 &&
    week.slipped.length === 0 &&
    week.ahead.length === 0;

  const stats = [
    { label: 'Finished', value: week.finished.length, tone: c.accent },
    { label: 'Recorded', value: week.recorded.length, tone: c.text },
    { label: 'Slipped', value: week.slipped.length, tone: week.slipped.length > 0 ? c.danger : c.text },
  ];

  return (
    <Screen>
      <TopBar
        title="Your week"
        subtitle={`${day(week.from)} – ${day(week.to)}`}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          {stats.map((stat) => (
            <Card key={stat.label} style={styles.stat}>
              <T size={28} weight="700" tabular style={{ color: stat.tone }}>{stat.value}</T>
              <T size={13} sub>{stat.label}</T>
            </Card>
          ))}
        </View>

        {spent ? <T size={15} sub>{spent} spent this week.</T> : null}

        {!loading && quiet ? (
          <Card style={styles.quiet}>
            <T size={16} weight="700">A quiet week</T>
            <T size={14} sub style={styles.quietText}>
              Record what you do and plan this week — next week this page shows what got done and
              what slipped.
            </T>
          </Card>
        ) : null}

        {week.slipped.length > 0 ? (
          <Section label="Still waiting">
            {week.slipped.slice(0, 8).map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                gutter="date"
                showAdded={false}
                onLongPress={() => router.push(`/entry/${memory.id}`)}
              />
            ))}
          </Section>
        ) : null}

        {week.finished.length > 0 ? (
          <Section label="Done this week" tone="ahead">
            {week.finished.slice(0, 8).map((memory) => (
              <MemoryRow key={memory.id} memory={memory} gutter="date" showAdded={false} struck />
            ))}
          </Section>
        ) : null}

        {week.ahead.length > 0 ? (
          <T size={13} sub>
            {week.ahead.length} {week.ahead.length === 1 ? 'thing is' : 'things are'} already
            scheduled ahead.
          </T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 4 },
  quiet: { gap: 6 },
  quietText: { lineHeight: 20 },
});
