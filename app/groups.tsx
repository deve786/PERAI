import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addEmptyGroup } from '@/db/queries';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Button, Empty, ListCard, Meter, Screen, T, TopBar } from '@/expense/ui';
import { fullDateLabel } from '@/format';
import { normalizeGroupName } from '@/groups';
import { logOk } from '@/log';
import { useGroups } from '@/useGroups';

/**
 * Jobs made of several entries: a trip, a move, a week at work.
 *
 * Ordered the way they need attention — anything overdue first, then whatever
 * is due soonest — with finished groups at the bottom rather than hidden, so a
 * trip that is over can still be read back.
 */
export default function GroupsScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const { groups, loading } = useGroups();
  const [name, setName] = useState('');

  const open = (group: string) => router.push(`/group/${encodeURIComponent(group)}`);

  // Made here, filled later: a group can exist before its work does.
  async function create() {
    const clean = normalizeGroupName(name);
    if (!clean) return;
    setName('');
    await addEmptyGroup(clean);
    logOk('Made a group', clean);
    open(clean);
  }

  return (
    <Screen>
      <TopBar title="Groups" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.newRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => void create()}
            placeholder="New group, e.g. Kozhikode trip"
            placeholderTextColor={c.faint}
            returnKeyType="done"
            accessibilityLabel="New group name"
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
          />
          <Button title="Create" onPress={() => void create()} disabled={!name.trim()} style={styles.create} />
        </View>

        {groups.length > 0 ? (
          <ListCard>
            {groups.map((group, i) => (
              <Pressable
                key={group.name}
                onPress={() => open(group.name)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  i < groups.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.head}>
                  <T size={16} weight="600" numberOfLines={1} style={styles.name}>{group.name}</T>
                  <T size={13} sub tabular>{group.done}/{group.total}</T>
                </View>

                <Meter fraction={group.progress} height={4} />

                <T size={13} sub style={group.overdue > 0 ? { color: c.danger } : undefined}>
                  {group.total === 0
                    ? 'Nothing in it yet'
                    : group.open === 0
                    ? 'All done'
                    : group.overdue > 0
                      ? `${group.overdue} overdue · ${group.open} left`
                      : group.nextDue
                        ? `${group.open} left · next ${fullDateLabel(group.nextDue)}`
                        : `${group.open} left`}
                </T>
              </Pressable>
            ))}
          </ListCard>
        ) : null}

        {!loading && groups.length === 0 ? (
          <View style={styles.empty}>
            <Empty
              icon="folder-outline"
              title="Keep related things together"
              hint={'Say several things at once and name what they\'re for — "for the Kozhikode trip: book tickets, pack bags, get cash" — and they stay together here with a finish line.'}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  newRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.sans,
    fontSize: 16,
  },
  create: { borderRadius: radius.sm },
  row: { paddingVertical: 14, gap: 8 },
  pressed: { opacity: 0.6 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  name: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
