import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { completeMemory, reopenMemory } from '@/complete';
import { insertMemory, updateMemory } from '@/db/queries';
import { fullDateLabel } from '@/format';
import { groupSummaries, membersOf, normalizeGroupName } from '@/groups';
import { logOk } from '@/log';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useMemories } from '@/useMemories';

/**
 * One group: everything under that name, with a finish line.
 *
 * Adding here is deliberately plain — the line you type becomes one task in
 * this group, due today, with no model call. A checklist is written in a
 * burst ("book tickets", "pack bags", "get cash") and waiting several seconds
 * for each line would make that unbearable. Anything that needs a date or an
 * amount understood is still said on the Record tab, which reads it properly.
 */
export default function GroupScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const groupName = normalizeGroupName(decodeURIComponent(String(name ?? ''))) ?? '';

  const { memories } = useMemories();
  const members = membersOf(memories, groupName);
  const summary = groupSummaries(memories).find(
    (group) => group.name.toLowerCase() === groupName.toLowerCase()
  );

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  async function addTask() {
    const title = text.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      // Due today at nine, the same default the rest of the app uses for a
      // task with no stated time.
      const due = new Date();
      due.setHours(9, 0, 0, 0);

      await insertMemory(
        {
          title,
          type: 'task',
          category: 'Other',
          eventDate: due.toISOString(),
          dateExpression: null,
          amount: null,
          currency: null,
          people: null,
          location: null,
          tags: null,
          priority: null,
          status: 'active',
          repeat: null,
          groupName,
        },
        title
      );
      logOk('Added to a group', `${groupName} · ${title}`);
      setText('');
    } finally {
      setSaving(false);
    }
  }

  function toggle(memory: Memory) {
    if (memory.status === 'active') void completeMemory(memory);
    else void reopenMemory(memory);
  }

  const open = members.filter((memory) => memory.status === 'active');
  const done = members.filter((memory) => memory.status !== 'active');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={type.display}>{groupName}</Text>

        {summary ? (
          <View style={styles.progress}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(summary.progress * 100)}%` }]} />
            </View>
            <Text style={[type.fine, summary.overdue > 0 && styles.late]}>
              {summary.done} of {summary.total} done
              {summary.open === 0
                ? ''
                : summary.overdue > 0
                  ? ` · ${summary.overdue} overdue`
                  : summary.nextDue
                    ? ` · next ${fullDateLabel(summary.nextDue)}`
                    : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.add}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void addTask()}
            placeholder="Add a task to this group…"
            placeholderTextColor={colors.mist}
            returnKeyType="done"
            style={styles.input}
          />
          <Pressable onPress={() => void addTask()} hitSlop={10} disabled={!text.trim() || saving}>
            <Text style={[type.label, text.trim() ? styles.addOn : styles.addOff]}>ADD</Text>
          </Pressable>
        </View>

        {open.length > 0 ? (
          <Section label={`TO DO  ·  ${open.length}`}>
            {open.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                gutter="date"
                showAdded={false}
                onPress={() => toggle(memory)}
                onLongPress={() => router.push(`/entry/${memory.id}`)}
              />
            ))}
          </Section>
        ) : null}

        {done.length > 0 ? (
          <Section label={`DONE  ·  ${done.length}`}>
            {done.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                gutter="date"
                showAdded={false}
                struck
                onPress={() => toggle(memory)}
                onLongPress={() => router.push(`/entry/${memory.id}`)}
              />
            ))}
          </Section>
        ) : null}

        {members.length === 0 ? (
          <Text style={[type.body, styles.empty]}>
            Nothing is in this group any more. Add a task above, or set this
            group on an entry from its own screen.
          </Text>
        ) : null}

        {open.length > 0 ? (
          <Pressable
            onPress={async () => {
              for (const memory of open) await completeMemory(memory);
              logOk('Finished a group', groupName);
            }}
            hitSlop={8}
            style={styles.finish}
          >
            <Text style={[type.label, styles.finishText]}>TICK OFF EVERYTHING LEFT</Text>
          </Pressable>
        ) : null}

        {/* Emptying a group is clearing the name, never deleting the work. */}
        {members.length > 0 ? (
          <Pressable
            onPress={async () => {
              for (const memory of members) await updateMemory(memory.id, { groupName: null });
              logOk('Ungrouped', groupName);
              router.back();
            }}
            hitSlop={8}
          >
            <Text style={[type.label, styles.ungroup]}>UNGROUP THESE ENTRIES</Text>
          </Pressable>
        ) : null}

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.close}>
          <Text style={[type.label, styles.closeText]}>CLOSE</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 68, paddingBottom: 48, gap: 22 },
    progress: { gap: 6, marginTop: -10 },
    track: { height: 2, backgroundColor: colors.rule },
    fill: { height: 2, backgroundColor: colors.moss },
    late: { color: colors.alert },
    add: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    input: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: colors.ink, paddingVertical: 8 },
    addOn: { color: colors.moss },
    addOff: { color: colors.mist },
    empty: { maxWidth: 320 },
    finish: { paddingTop: 4 },
    finishText: { color: colors.moss },
    ungroup: { color: colors.mist },
    close: { paddingTop: 8 },
    closeText: { color: colors.mist },
  });
}
