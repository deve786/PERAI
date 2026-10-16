import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Section } from '@/components/Section';
import { groupSummaries } from '@/groups';
import { fullDateLabel } from '@/format';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';
import { useMemories } from '@/useMemories';

/**
 * Jobs made of several entries: a trip, a move, a week at work.
 *
 * Ordered the way they need attention — anything overdue first, then whatever
 * is due soonest — with finished groups at the bottom rather than hidden, so a
 * trip that is over can still be read back.
 */
export default function GroupsScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const { memories, loading } = useMemories();
  const groups = groupSummaries(memories);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>Groups</Text>

      {groups.length > 0 ? (
        <Section label={`GROUPS  ·  ${groups.length}`}>
          {groups.map((group) => (
            <Pressable
              key={group.name}
              style={styles.row}
              onPress={() => router.push(`/group/${encodeURIComponent(group.name)}`)}
              hitSlop={4}
            >
              <View style={styles.head}>
                <Text style={[type.body, styles.name]} numberOfLines={1}>
                  {group.name}
                </Text>
                <Text style={[type.stamp, styles.count]}>
                  {group.done}/{group.total}
                </Text>
              </View>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(group.progress * 100)}%` }]} />
              </View>

              <Text style={[type.fine, group.overdue > 0 && styles.late]}>
                {group.open === 0
                  ? 'All done'
                  : group.overdue > 0
                    ? `${group.overdue} overdue · ${group.open} left`
                    : group.nextDue
                      ? `${group.open} left · next ${fullDateLabel(group.nextDue)}`
                      : `${group.open} left`}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      {!loading && groups.length === 0 ? (
        <Text style={[type.body, styles.intro]}>
          Say or type several things at once and name what they are for — &quot;for
          the Kozhikode trip: book tickets, pack bags, get cash&quot; — and they are
          kept together here, with a finish line. You can also set a group on any
          entry from its own screen.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 68, paddingBottom: 48, gap: 26 },
    row: { paddingVertical: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.rule },
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
    name: { flex: 1, color: colors.ink },
    count: { color: colors.mist },
    track: { height: 2, backgroundColor: colors.rule },
    fill: { height: 2, backgroundColor: colors.moss },
    late: { color: colors.alert },
    intro: { maxWidth: 320, marginTop: 4 },
  });
}
