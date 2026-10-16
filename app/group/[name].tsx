import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { completeMemory, reopenMemory } from '@/complete';
import { describeError } from '@/ai/client';
import { addEmptyGroup, deleteMemory, insertMemory, removeEmptyGroup, updateMemory } from '@/db/queries';
import { fileNote } from '@/fileNote';
import { fullDateLabel } from '@/format';
import { groupSummaries, membersOf, normalizeGroupName, splitTasks } from '@/groups';
import { logOk } from '@/log';
import { knownPeople } from '@/speechText';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useGroups } from '@/useGroups';
import { useMemories } from '@/useMemories';
import { useVoiceInput } from '@/useVoiceInput';

/**
 * One group: everything under that name, with a finish line.
 *
 * Typed lines go in as they are, several at once — a checklist is written in a
 * burst ("book tickets, pack bags, get cash") and waiting on a model between
 * each would make that unbearable. Spoken, it is understood first, so "book
 * tickets tomorrow and pack bags on Friday" lands two tasks on two days.
 */
export default function GroupScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const groupName = normalizeGroupName(decodeURIComponent(String(name ?? ''))) ?? '';

  const { memories } = useMemories();
  const { empty } = useGroups();
  const members = membersOf(memories, groupName);
  const summary = groupSummaries(memories, new Date(), empty).find(
    (group) => group.name.toLowerCase() === groupName.toLowerCase()
  );

  const [title, setTitle] = useState(groupName);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Typed lines go in as they are — several at once, instantly. */
  async function addTyped() {
    const tasks = splitTasks(text);
    if (tasks.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Due today at nine, the same default the rest of the app uses for a
      // task with no stated time.
      const due = new Date();
      due.setHours(9, 0, 0, 0);

      for (const task of tasks) {
        await insertMemory(
          {
            title: task,
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
          text.trim()
        );
      }
      await removeEmptyGroup(groupName);
      logOk(
        tasks.length === 1 ? 'Added to a group' : `Added ${tasks.length} to a group`,
        `${groupName} · ${tasks.join(', ')}`
      );
      setText('');
    } finally {
      setSaving(false);
    }
  }

  /** Spoken, it is read the way the Record tab reads it: one call for the lot. */
  async function addSpoken(spoken: string) {
    if (!spoken.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const added = await fileNote(spoken, { people: knownPeople(memories), groupName });
      if (added.length === 0) setError('Nothing could be made of that.');
      else {
        await removeEmptyGroup(groupName);
        logOk(`Added ${added.length} by voice`, groupName);
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const voice = useVoiceInput((spoken) => void addSpoken(spoken));
  const listening = voice.stage === 'listening';

  /** Renaming moves every entry with it, so nothing is left behind. */
  async function rename() {
    const next = normalizeGroupName(title);
    if (!next || next === groupName) {
      setTitle(groupName);
      return;
    }
    for (const memory of members) await updateMemory(memory.id, { groupName: next });
    await removeEmptyGroup(groupName);
    if (members.length === 0) await addEmptyGroup(next);
    logOk('Renamed a group', `${groupName} → ${next}`);
    router.replace(`/group/${encodeURIComponent(next)}`);
  }

  function confirmDeleteGroup() {
    if (members.length === 0) {
      void (async () => {
        await removeEmptyGroup(groupName);
        logOk('Deleted a group', groupName);
        router.back();
      })();
      return;
    }

    Alert.alert(
      `Delete "${groupName}"?`,
      `${members.length} ${members.length === 1 ? 'entry is' : 'entries are'} in it. Keep them in your record, or delete them too?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keep the entries',
          onPress: () => {
            void (async () => {
              for (const memory of members) await updateMemory(memory.id, { groupName: null });
              await removeEmptyGroup(groupName);
              logOk('Ungrouped', groupName);
              router.back();
            })();
          },
        },
        {
          text: 'Delete them',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              for (const memory of members) await deleteMemory(memory.id);
              await removeEmptyGroup(groupName);
              logOk('Deleted a group and its entries', `${groupName} · ${members.length}`);
              router.back();
            })();
          },
        },
      ]
    );
  }

  /** Hold a task for the two things a tap cannot do. */
  function taskActions(memory: Memory) {
    Alert.alert(memory.title, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit', onPress: () => router.push(`/entry/${memory.id}`) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteMemory(memory.id);
          logOk('Deleted an entry', memory.title);
        },
      },
    ]);
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
        {/* The heading is the name: edit it here and every entry moves with it. */}
        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={() => void rename()}
          onSubmitEditing={() => void rename()}
          style={styles.title}
          returnKeyType="done"
          multiline
        />

        {summary && summary.total > 0 ? (
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
            value={listening ? voice.liveText : text}
            onChangeText={setText}
            onSubmitEditing={() => void addTyped()}
            placeholder={listening ? 'Listening…' : 'Add tasks — one line, or several split by commas'}
            placeholderTextColor={colors.mist}
            returnKeyType="done"
            editable={!listening && !saving}
            multiline
            style={styles.input}
          />
          {text.trim() ? (
            <Pressable onPress={() => void addTyped()} hitSlop={10} disabled={saving}>
              <Text style={[type.label, styles.addOn]}>ADD</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void voice.toggle()}
              hitSlop={10}
              disabled={saving}
              accessibilityLabel={listening ? 'Stop and add' : 'Add by voice'}
            >
              <Ionicons
                name={listening ? 'stop-circle-outline' : 'mic-outline'}
                size={22}
                color={listening ? colors.moss : colors.graphite}
              />
            </Pressable>
          )}
        </View>

        {listening ? <VoiceWaveform level={voice.level} /> : null}
        <Text style={[type.fine, styles.hint]}>
          {saving
            ? 'Adding…'
            : listening
              ? 'Say everything at once — dates are understood'
              : 'Typed lines go in as they are. Speak instead and dates are understood.'}
        </Text>

        {error || voice.error ? (
          <Text style={[type.body, styles.error]}>{error ?? voice.error}</Text>
        ) : null}

        {open.length > 0 ? (
          <Section label={`TO DO  ·  ${open.length}`}>
            {open.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                gutter="date"
                showAdded={false}
                onPress={() => toggle(memory)}
                onLongPress={() => taskActions(memory)}
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
                onLongPress={() => taskActions(memory)}
              />
            ))}
          </Section>
        ) : null}

        {members.length > 0 ? (
          <Text style={[type.fine, styles.hint]}>Tap to tick off · hold to edit or delete</Text>
        ) : (
          <Text style={[type.body, styles.empty]}>
            Nothing in this group yet. Type the tasks above — several at once,
            split by commas — or say them.
          </Text>
        )}

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

        <View style={styles.footer}>
          <Pressable onPress={confirmDeleteGroup} hitSlop={8}>
            <Text style={[type.label, styles.delete]}>DELETE GROUP</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={[type.label, styles.closeText]}>CLOSE</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 68, paddingBottom: 48, gap: 20 },
    title: {
      fontFamily: FONTS.sans,
      fontSize: 30,
      lineHeight: 36,
      color: colors.ink,
      padding: 0,
    },
    progress: { gap: 6, marginTop: -8 },
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
    hint: { marginTop: -12 },
    error: { color: colors.alert },
    empty: { maxWidth: 320 },
    finish: { paddingTop: 4 },
    finishText: { color: colors.moss },
    footer: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
    delete: { color: colors.alert },
    closeText: { color: colors.mist },
  });
}
