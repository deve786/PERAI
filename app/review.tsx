import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { formatAmount, shortDate } from '@/format';
import { weekInReview } from '@/review';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';
import { useMemories } from '@/useMemories';

/**
 * The week, counted up.
 *
 * Opened from the Sunday evening reminder, or from the Today screen. Every
 * figure is worked out on the phone from the record itself, so this costs no
 * AI call and works with no network — see src/review.ts.
 */
export default function ReviewScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const { memories } = useMemories();
  const week = useMemo(() => weekInReview(memories), [memories]);

  const spent = week.spent
    .map(({ currency, total }) => formatAmount(total, currency) ?? String(total))
    .join(' · ');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>Your week</Text>
      <Text style={[type.stamp, styles.range]}>
        {shortDate(week.from.toISOString()).toUpperCase()} — {shortDate(week.to.toISOString()).toUpperCase()}
      </Text>

      <View style={styles.figures}>
        <View style={styles.figure}>
          <Text style={type.figure}>{week.finished.length}</Text>
          <Text style={type.fine}>finished</Text>
        </View>
        <View style={styles.figure}>
          <Text style={type.figure}>{week.recorded.length}</Text>
          <Text style={type.fine}>recorded</Text>
        </View>
        <View style={styles.figure}>
          <Text style={[type.figure, week.slipped.length > 0 && styles.late]}>
            {week.slipped.length}
          </Text>
          <Text style={type.fine}>slipped</Text>
        </View>
      </View>

      {spent ? <Text style={[type.body, styles.spent]}>{spent} spent this week.</Text> : null}

      {week.slipped.length > 0 ? (
        <Section label="STILL WAITING">
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
        <Section label="DONE THIS WEEK" tone="ahead">
          {week.finished.slice(0, 8).map((memory) => (
            <MemoryRow key={memory.id} memory={memory} gutter="date" showAdded={false} struck />
          ))}
        </Section>
      ) : null}

      {week.ahead.length > 0 ? (
        <Text style={[type.fine, styles.ahead]}>
          {week.ahead.length} {week.ahead.length === 1 ? 'thing is' : 'things are'} already
          scheduled ahead.
        </Text>
      ) : null}

      <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
        <Text style={[type.label, styles.closeText]}>CLOSE</Text>
      </Pressable>
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48, gap: 20 },
    range: { color: colors.mist, marginTop: -12 },
    figures: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    figure: { gap: 2 },
    late: { color: colors.alert },
    spent: { marginTop: -6 },
    ahead: { marginTop: 4 },
    close: { alignItems: 'center', paddingTop: 16 },
    closeText: { color: colors.mist },
  });
}
