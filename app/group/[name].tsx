import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { completeMemory, reopenMemory } from '@/complete';
import { describeError } from '@/ai/client';
import {
  looksLikeCommand,
  planCommand,
  runCommand,
  type CommandOutcome,
  type CommandPlan,
} from '@/ai/command';
import { PlanCard } from '@/components/PlanCard';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Button, Card, Empty, Label, ListRow, Meter, PillButton, Screen, T, TopBar } from '@/expense/ui';
import { addEmptyGroup, deleteMemory, insertMemory, removeEmptyGroup, updateMemory } from '@/db/queries';
import { fileNote } from '@/fileNote';
import { fullDateLabel, toSentence } from '@/format';
import { groupSummaries, membersOf, normalizeGroupName, splitTasks } from '@/groups';
import { logOk } from '@/log';
import { showDialog } from '@/dialogStore';
import { normalizeQuery } from '@/manglish';
import { knownPeople } from '@/speechText';
import { dueToday, parseWhen } from '@/whenText';
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
  const { c, budget, setBudget } = useTheme();
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
  /** What was just put in, shown back so a mishearing is caught at once. */
  const [added, setAdded] = useState<Memory[] | null>(null);
  /** A change worked out from an instruction, waiting to be confirmed. */
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  /** The change just carried out, kept so it can be undone. */
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);

  /**
   * An instruction rather than a task: "push the cab to Friday", "make the
   * tickets high priority", "gym kazhinju".
   *
   * Only this group's own entries are offered to it, so an instruction typed
   * here can never reach past the group it was typed into. The check is local,
   * so adding an ordinary task still costs nothing. Returns true when it was
   * an instruction, whatever came of it.
   */
  async function planInstruction(): Promise<boolean> {
    if (members.length === 0 || !looksLikeCommand(text)) return false;
    setSaving(true);
    setError(null);
    try {
      const proposed = await planCommand(text, new Date().toISOString(), members, []);
      if (!proposed) return false;
      setAdded(null);
      setOutcome(null);
      if ('question' in proposed) {
        setError(proposed.question);
        return true;
      }
      setPlan(proposed);
      return true;
    } catch (err) {
      setError(describeError(err));
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function confirmPlan() {
    if (!plan || saving) return;
    setSaving(true);
    try {
      const done = await runCommand(plan, { currentBudget: budget, setBudget });
      setPlan(null);
      setOutcome(done);
      setText('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Typed lines go in at once, several at a time, with their dates read on
   * the phone: "table parcel by tomorrow 9am" is a title and a time, not a
   * title. A line that says nothing about when is due today.
   */
  async function addTyped() {
    const tasks = splitTasks(text);
    if (tasks.length === 0 || saving) return;

    // An instruction about what is already here is carried out, not written
    // down as another task.
    if (await planInstruction()) return;

    // Malayalam, in either script, goes through the model instead: writing it
    // in as typed would keep a Malayalam title, and what the record is written
    // in is the person's own setting, not a side effect of how they typed it.
    const malayalam = normalizeQuery(text);
    if (malayalam.hadScript || malayalam.hits > 0) {
      await addUnderstood(text, false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Anything with no date of its own is today's work, timed so it does
      // not read as overdue the moment it is written.
      const today = dueToday();

      const kept: Memory[] = [];
      for (const task of tasks) {
        const when = parseWhen(task);
        kept.push(
          await insertMemory(
            {
              title: when.title || task,
              type: 'task',
              category: 'Other',
              eventDate: when.eventDate ?? today.toISOString(),
              dateExpression: when.dateExpression,
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
          )
        );
      }
      await removeEmptyGroup(groupName);
      logOk(
        tasks.length === 1 ? 'Added to a group' : `Added ${tasks.length} to a group`,
        `${groupName} · ${tasks.join(', ')}`
      );
      setAdded(kept);
      setOutcome(null);
      setText('');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Understood first, exactly as the Record tab understands a note: one call
   * for the whole thing, which picks apart several events, reads amounts,
   * people and places, and files a purchase to Expense as well. What the mic
   * uses, and what the ✨ button runs on typed text.
   */
  async function addUnderstood(note: string, spoken: boolean) {
    if (!note.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const kept = await fileNote(note, { people: knownPeople(memories), groupName });
      if (kept.length === 0) {
        setError('Nothing could be made of that.');
        return;
      }
      await removeEmptyGroup(groupName);
      logOk(
        `Added ${kept.length} to a group${spoken ? ' by voice' : ''}`,
        `${groupName} · ${kept.map((entry) => entry.title).join(', ')}`
      );
      setAdded(kept);
      setOutcome(null);
      if (!spoken) setText('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const voice = useVoiceInput((spoken) => void addUnderstood(spoken, true));
  const listening = voice.stage === 'listening';
  /** Typed Malayalam takes the understood path, so say so before it is sent. */
  const typedMalayalam = normalizeQuery(text);
  const looksMalayalam = text.trim().length > 0 && (typedMalayalam.hadScript || typedMalayalam.hits > 0);

  /** Renaming moves every entry with it, so nothing is left behind. */
  async function rename(follow = true) {
    const next = normalizeGroupName(title);
    if (!next || next === groupName) {
      setTitle(groupName);
      return;
    }
    for (const memory of members) await updateMemory(memory.id, { groupName: next });
    await removeEmptyGroup(groupName);
    if (members.length === 0) await addEmptyGroup(next);
    logOk('Renamed a group', `${groupName} → ${next}`);
    // Leaving the screen saves the name too, and then there is nothing left
    // to point the route at.
    if (follow) router.replace(`/group/${encodeURIComponent(next)}`);
  }

  // Typing a new name and pressing back used to lose it: the field never lost
  // focus, so nothing was ever saved. Whatever is in the box when the screen
  // goes away is kept.
  const pendingRename = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    pendingRename.current = () => rename(false);
  });
  useEffect(() => () => void pendingRename.current?.(), []);

  function confirmDeleteGroup() {
    if (members.length === 0) {
      void (async () => {
        await removeEmptyGroup(groupName);
        logOk('Deleted a group', groupName);
        router.back();
      })();
      return;
    }

    showDialog({
      title: `Delete "${groupName}"?`,
      message: `${members.length} ${members.length === 1 ? 'entry is' : 'entries are'} in it. Keep them in your record, or delete them too?`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Keep the entries',
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
          label: 'Delete them',
          destructive: true,
          onPress: () => {
            void (async () => {
              for (const memory of members) await deleteMemory(memory.id);
              await removeEmptyGroup(groupName);
              logOk('Deleted a group and its entries', `${groupName} · ${members.length}`);
              router.back();
            })();
          },
        },
      ],
    });
  }

  /** Hold a task for the two things a tap cannot do. */
  function taskActions(memory: Memory) {
    showDialog({
      title: memory.title,
      actions: [
        { label: 'Cancel', cancel: true },
        { label: 'Edit', onPress: () => router.push(`/entry/${memory.id}`) },
        {
          label: 'Delete',
          destructive: true,
          onPress: () => {
            void deleteMemory(memory.id);
            logOk('Deleted an entry', memory.title);
          },
        },
      ],
    });
  }

  function toggle(memory: Memory) {
    if (memory.status === 'active') void completeMemory(memory);
    else void reopenMemory(memory);
  }

  const open = members.filter((memory) => memory.status === 'active');
  const done = members.filter((memory) => memory.status !== 'active');

  async function finishAll() {
    for (const memory of open) await completeMemory(memory);
    logOk('Finished a group', groupName);
  }

  async function close() {
    await rename(false);
    router.back();
  }

  const nameChanged = !!normalizeGroupName(title) && normalizeGroupName(title) !== groupName;

  function saveName() {
    setRenaming(false);
    void rename();
  }

  const nextLine =
    !summary || summary.open === 0
      ? null
      : summary.overdue > 0
        ? `${summary.overdue} overdue`
        : summary.nextDue
          ? `Next ${fullDateLabel(summary.nextDue)}`
          : null;

  return (
    <Screen>
      <TopBar
        title={groupName}
        onBack={() => void close()}
        right={
          <Pressable
            onPress={() => setMenu(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Group actions"
            style={({ pressed }) => [styles.roundButton, { backgroundColor: c.well, opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={c.text} />
          </Pressable>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* The name: edit it here and every entry moves with it. */}
          {renaming || nameChanged ? (
            <Card style={styles.gapCard}>
              <Label style={styles.noMargin}>Group name</Label>
              <TextInput
                value={title}
                onChangeText={setTitle}
                onSubmitEditing={saveName}
                autoFocus={renaming}
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                accessibilityLabel="Group name"
                style={[styles.nameInput, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
              />
              <View style={styles.actionsRow}>
                <PillButton label="Save name" primary disabled={!nameChanged} onPress={saveName} />
                <PillButton
                  label="Cancel"
                  onPress={() => {
                    setTitle(groupName);
                    setRenaming(false);
                  }}
                />
              </View>
            </Card>
          ) : null}

          {summary && summary.total > 0 ? (
            <Card style={styles.gapCard}>
              <View style={styles.progressHead}>
                <T size={15} weight="600">{summary.done} of {summary.total} done</T>
                <T size={13} sub tabular>{Math.round(summary.progress * 100)}%</T>
              </View>
              <Meter fraction={summary.progress} />
              {nextLine ? (
                <T size={13} sub style={summary.overdue > 0 ? { color: c.danger } : undefined}>
                  {nextLine}
                </T>
              ) : null}
            </Card>
          ) : null}

          <View style={styles.addBlock}>
            <View style={[styles.add, { backgroundColor: c.card, borderColor: c.border }]}>
              <TextInput
                value={listening ? voice.liveText : text}
                onChangeText={setText}
                onSubmitEditing={() => void addTyped()}
                placeholder={listening ? 'Listening…' : 'Add tasks — one line, or several split by commas'}
                placeholderTextColor={c.faint}
                returnKeyType="done"
                editable={!listening && !saving}
                multiline
                style={[styles.input, { color: c.text }]}
              />
              {text.trim() ? (
                <View style={styles.addActions}>
                  {/* Straight in, or read properly first — the same choice the
                      mic already makes for anything spoken. */}
                  <Pressable
                    onPress={() => void addUnderstood(text, false)}
                    hitSlop={8}
                    disabled={saving}
                    accessibilityLabel="Add, understanding dates, amounts and people"
                    style={[styles.roundButton, { backgroundColor: c.accentSoft }]}
                  >
                    <Ionicons name="sparkles-outline" size={19} color={c.accent} />
                  </Pressable>
                  <PillButton label="Add" primary disabled={saving} onPress={() => void addTyped()} />
                </View>
              ) : (
                <Pressable
                  onPress={() => void voice.toggle()}
                  hitSlop={8}
                  disabled={saving}
                  accessibilityLabel={listening ? 'Stop and add' : 'Add by voice'}
                  style={[styles.roundButton, { backgroundColor: listening ? c.accentSoft : c.well }]}
                >
                  <Ionicons
                    name={listening ? 'stop-circle-outline' : 'mic-outline'}
                    size={22}
                    color={listening ? c.accent : c.sub}
                  />
                </Pressable>
              )}
            </View>

            {listening ? <VoiceWaveform level={voice.level} /> : null}

            <View style={styles.hintRow}>
              <T size={13} sub style={styles.flex}>
                {saving
                  ? 'Adding…'
                  : listening
                    ? 'Say everything at once — dates are understood'
                    : looksMalayalam
                      ? 'Malayalam is read properly either way, and written down the way Settings says.'
                      : text.trim()
                        ? 'Add puts the lines in as typed, with their dates. ✨ reads the whole thing properly — amounts, people, several events.'
                        : 'Type the date in and it is read: table parcel by tomorrow 9am'}
              </T>
              {/* A way out of either kind of adding, the same as on Record. */}
              {listening ? (
                <Pressable onPress={voice.cancel} hitSlop={12} accessibilityRole="button">
                  <T size={14} weight="600" sub>Cancel</T>
                </Pressable>
              ) : text.trim() && !saving ? (
                <Pressable
                  onPress={() => {
                    setText('');
                    setError(null);
                    voice.clearError();
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                >
                  <T size={14} weight="600" sub>Clear</T>
                </Pressable>
              ) : null}
            </View>
          </View>

          {error || voice.error ? (
            <T size={15} style={{ color: c.danger }}>{error ?? voice.error}</T>
          ) : null}

          {/* Nothing has happened yet: this is what an instruction would do. */}
          {plan && !saving ? (
            <PlanCard plan={plan} onCancel={() => setPlan(null)} onConfirm={() => void confirmPlan()} />
          ) : null}

          {outcome && !saving ? (
            <Card style={styles.gapCard}>
              <T size={14} weight="700" style={{ color: c.accent }}>{toSentence(outcome.label)}</T>
              <T size={15}>{outcome.summary}</T>
              <View style={styles.actionsRow}>
                {outcome.undo ? (
                  <PillButton
                    label="Undo"
                    icon="arrow-undo-outline"
                    onPress={() => {
                      void (async () => {
                        await outcome.undo?.();
                        setOutcome(null);
                      })();
                    }}
                  />
                ) : null}
                <PillButton label="Dismiss" onPress={() => setOutcome(null)} />
              </View>
            </Card>
          ) : null}

          {/* What just went in, read back the way Record reads a saved note —
              a mishearing is obvious while it is still one press to undo. */}
          {added && added.length > 0 && !saving ? (
            <Card style={styles.addedCard}>
              <T size={14} weight="700" style={{ color: c.accent }}>
                {added.length === 1 ? 'Added' : `Added ${added.length}`}
              </T>
              {added.map((entry) => (
                <MemoryRow key={`added-${entry.id}`} memory={entry} gutter="date" showAdded={false} />
              ))}
              <View style={[styles.actionsRow, styles.addedActions]}>
                <PillButton
                  label="Undo"
                  icon="arrow-undo-outline"
                  onPress={() => {
                    void (async () => {
                      for (const entry of added) await deleteMemory(entry.id);
                      logOk('Undone', `${groupName} · ${added.map((e) => e.title).join(', ')}`);
                      setAdded(null);
                    })();
                  }}
                />
                {added.length === 1 ? (
                  <PillButton label="Edit" icon="pencil-outline" onPress={() => router.push(`/entry/${added[0].id}`)} />
                ) : null}
                <PillButton label="Dismiss" onPress={() => setAdded(null)} />
              </View>
            </Card>
          ) : null}

          {open.length > 0 ? (
            <Section label={`To do · ${open.length}`}>
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

          {open.length > 0 ? (
            <Button title="Tick off everything left" kind="ghost" icon="checkmark-done-outline" onPress={() => void finishAll()} />
          ) : null}

          {done.length > 0 ? (
            <Section label={`Done · ${done.length}`}>
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
            <T size={13} sub style={styles.centre}>Tap to tick off · hold to edit or delete</T>
          ) : (
            <Empty
              icon="checkbox-outline"
              title="Nothing in this group yet"
              hint="Type the tasks above — several at once, split by commas — or say them."
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Rename, finish and delete: the group's own actions. */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.scrim} onPress={() => setMenu(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.menu, { backgroundColor: c.card, borderColor: c.line }]}>
            <ListRow
              icon="pencil-outline"
              label="Rename"
              chevron={false}
              onPress={() => {
                setMenu(false);
                setRenaming(true);
              }}
            />
            {open.length > 0 ? (
              <ListRow
                icon="checkmark-done-outline"
                label="Tick off everything left"
                chevron={false}
                onPress={() => {
                  setMenu(false);
                  void finishAll();
                }}
              />
            ) : null}
            <ListRow
              icon="trash-outline"
              iconColor={c.danger}
              label="Delete group"
              chevron={false}
              last
              onPress={() => {
                setMenu(false);
                confirmDeleteGroup();
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gapCard: { gap: 10 },
  noMargin: { marginBottom: 0 },
  nameInput: {
    fontFamily: FONTS.sans,
    fontSize: 16,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  addBlock: { gap: 8 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
  },
  input: { flex: 1, fontFamily: FONTS.sans, fontSize: 16, paddingVertical: 8 },
  addActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  addedCard: { gap: 4, paddingVertical: 14 },
  addedActions: { paddingTop: 8 },
  centre: { textAlign: 'center' },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  menu: { width: '100%', maxWidth: 360, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4 },
});
