import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { describeError, hasApiKey } from '@/ai/client';
import { ComposeButton, type ComposeMode } from '@/components/ComposeButton';
import { MemoryRow } from '@/components/MemoryRow';
import { SwipeableMemoryRow } from '@/components/SwipeableMemoryRow';
import { EntrySheet } from '@/components/EntrySheet';
import { Section } from '@/components/Section';
import { ThemeToggle } from '@/components/ThemeToggle';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { deleteMemories, queueNote } from '@/db/queries';
import { deleteExpense } from '@/expense/db';
import { setPendingDrafts } from '@/draftStore';
import { fileNote } from '@/fileNote';
import { LISTS } from '@/lists';
import { logFail, logOk } from '@/log';
import { usePendingNotes } from '@/usePendingNotes';
import { useTitleChecks } from '@/useTitleChecks';
import { notificationsAllowed, syncReminders } from '@/reminders';
import { reminderTime } from '@/reminderTime';
import { isStruck, sinkStruck } from '@/strike';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '@/theme';
import { Empty, IconTile, PillButton, Screen } from '@/expense/ui';
import type { Memory, MemoryDraft, MemoryType } from '@/types';
import { useMemories } from '@/useMemories';
import { knownPeople } from '@/speechText';
import { useVoiceInput } from '@/useVoiceInput';
import { NewGroupField } from '@/components/NewGroupField';
import { SyncButton } from '@/components/SyncButton';

interface Saved {
  rawInput: string;
  memories: Memory[];
  /** null when nothing saved is a reminder; otherwise whether alerts can fire. */
  alerts: boolean | null;
  /** Titles a web search corrected, shown so a wrong one is obvious. */
  changed: { from: string; to: string }[];
  /** Linked expense IDs in Expense database */
  expenseIds?: string[];
}

function toDraft({ id, createdAt, confirmed, rawInput, ...draft }: Memory): MemoryDraft {
  return draft;
}

/**
 * Capture in one action.
 *
 * Press the mic, say it, stop talking — the note is transcribed, understood and
 * saved without another press. Typing works the same way with the send
 * button. Instead of a confirmation screen before saving, what was saved is
 * shown right away with Undo and Edit, so a mistake costs one press to fix
 * rather than every note costing one press to confirm.
 */
export default function CaptureScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const router = useRouter();
  // Set by a long press on the Record tab: start talking, or start typing.
  const { start } = useLocalSearchParams<{ start?: string }>();
  const input = useRef<TextInput>(null);
  /** The entry open in the quick-look sheet, if any. */
  const [openEntry, setOpenEntry] = useState<Memory | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The new-group field, opened on request so it is never in the way. */
  const [makingGroup, setMakingGroup] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  const configured = hasApiKey();

  // Live view of the record; refreshes itself after every save, Undo or delete.
  const { memories, loading } = useMemories();
  // Names already recorded: recognizer hints, and spellings the AI should keep.
  const people = useMemo(() => knownPeople(memories), [memories]);
  // Titles already on the lists: heard again, they cost no web search.
  const listTitles = useMemo(() => {
    const types = LISTS.map((list) => list.type as MemoryType);
    return memories.filter((m) => types.includes(m.type)).map((m) => m.title);
  }, [memories]);

  const pending = usePendingNotes({ people, listTitles }, true);
  // Names of new games, films and products are checked against a web search
  // after saving, so adding never waits on it.
  const titles = useTitleChecks(configured);

  async function save(raw: string) {
    const note = raw.trim();
    if (!note || saving) return;

    setSaving(true);
    setError(null);
    setSaved(null);
    const started = Date.now();
    try {
      const kept = await fileNote(note, { people, listTitles });

      // Ask for notification permission here, the first time it matters —
      // right after saving something that is meant to remind you.
      let alerts: boolean | null = null;
      if (kept.some((m) => reminderTime(m) !== null)) {
        alerts = await notificationsAllowed(true);
        if (alerts) await syncReminders();
      }

      const expenseIds = kept.map((m) => m.expenseId).filter((id): id is string => Boolean(id));

      setText('');
      setSaved({
        rawInput: note,
        memories: kept,
        alerts,
        changed: [],
        expenseIds,
      });
      logOk(
        kept.length === 1 ? 'Saved an entry' : `Saved ${kept.length} entries`,
        `${Math.round((Date.now() - started) / 1000)}s · ${kept.map((m) => m.title).join(', ')}`
      );
    } catch (err) {
      // Nothing said is lost: the note is queued and filed automatically once
      // whatever failed — the network, the daily quota — is working again.
      await queueNote(note, describeError(err));
      logFail('Could not save, note queued', describeError(err));
      setText('');
      setError(`${describeError(err)} Your note is kept below and will be filed automatically.`);
    } finally {
      setSaving(false);
    }
  }

  const voice = useVoiceInput((spoken) => void save(spoken), {
    contextualStrings: [...people, ...listTitles],
  });

  // Arrived from a long press on the Record tab: do what was picked, once,
  // then clear it so coming back to the tab later does not do it again.
  useEffect(() => {
    if (!start) return;
    if (start === 'voice' && configured && voice.stage === 'idle') void voice.toggle();
    if (start === 'type') setTimeout(() => input.current?.focus(), 250);
    router.setParams({ start: undefined });
    // Only a new request should act; the voice state changing must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // A name corrected by the search belongs on the card that announced it.
  useEffect(() => {
    const fix = titles.lastFix;
    if (!fix) return;
    setSaved((current) =>
      current?.memories.some((memory) => memory.title === fix.from)
        ? {
            ...current,
            changed: [...current.changed, fix],
            memories: current.memories.map((memory) =>
              memory.title === fix.from ? { ...memory, title: fix.to } : memory
            ),
          }
        : current
    );
  }, [titles.lastFix]);

  // Entries just saved are already shown with Undo and Edit, so neither list
  // below repeats them.
  const justSaved = useMemo(() => new Set(saved?.memories.map((m) => m.id)), [saved]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return memories
      .filter((memory) => !justSaved.has(memory.id))
      .map((memory) => ({ memory, at: reminderTime(memory, now) }))
      .filter((entry): entry is { memory: Memory; at: Date } => entry.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 3)
      .map((entry) => entry.memory);
  }, [memories, justSaved]);

  const recent = useMemo(() => {
    const ahead = new Set(upcoming.map((m) => m.id));
    const latest = [...memories]
      .filter((m) => !justSaved.has(m.id) && !ahead.has(m.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);
    // Still-open entries lead; anything struck or completed sinks below them,
    // newest first within each group.
    return sinkStruck(latest);
  }, [memories, justSaved, upcoming]);

  async function undo() {
    if (!saved) return;
    await deleteMemories(saved.memories.map((m) => m.id));
    if (saved.expenseIds && saved.expenseIds.length > 0) {
      for (const eid of saved.expenseIds) {
        await deleteExpense(eid).catch(() => {});
      }
    }
    setText(saved.rawInput);
    setSaved(null);
  }

  async function edit() {
    if (!saved) return;
    await deleteMemories(saved.memories.map((m) => m.id));
    if (saved.expenseIds && saved.expenseIds.length > 0) {
      for (const eid of saved.expenseIds) {
        await deleteExpense(eid).catch(() => {});
      }
    }
    setPendingDrafts(saved.rawInput, saved.memories.map(toDraft));
    setSaved(null);
    router.push('/preview');
  }

  const listening = voice.stage === 'listening';
  const typed = text.trim().length > 0;
  const mode: ComposeMode = listening
    ? 'listening'
    : saving || voice.stage === 'finishing'
      ? 'busy'
      : typed
        ? 'send'
        : 'voice';

  function press() {
    if (mode === 'send') void save(text);
    else void voice.toggle();
  }

  const busy = saving || voice.stage === 'finishing';
  const status = busy
    ? 'Saving…'
    : typed
      ? 'One line can hold several events'
      : 'Tap to speak';

  const problem = voice.error ?? error;
  // The box shows what's being heard, live, while listening; your typed text
  // is untouched underneath and comes back the moment listening stops.
  const displayText = voice.stage === 'idle' ? text : voice.liveText;
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={type.fine}>{today}</Text>
              <Text style={styles.title} accessibilityRole="header">
                Record
              </Text>
            </View>
            <View style={styles.titleActions}>
              <SyncButton />
              <ThemeToggle />
            </View>
          </View>

          <View style={styles.composer}>
            <View style={styles.composerHead}>
              <Text style={[type.fine, styles.prompt]}>
                {listening ? 'Listening — say “stop” to finish' : 'What happened, or what’s coming up?'}
              </Text>
              {typed && !saving && !listening ? (
                <Pressable
                  onPress={() => {
                    setText('');
                    setError(null);
                    voice.clearError();
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Clear what you have written"
                >
                  <Text style={styles.link}>Clear</Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              ref={input}
              value={displayText}
              onChangeText={(value) => {
                setText(value);
                if (problem) {
                  setError(null);
                  voice.clearError();
                }
              }}
              placeholder={
                listening
                  ? 'Listening…'
                  : 'Speak or type — one note or a whole dump of them'
              }
              placeholderTextColor={colors.mist}
              style={styles.input}
              multiline
              editable={voice.stage === 'idle' && !saving}
              accessibilityLabel="Your note"
            />

            <View style={styles.foot}>
              <ComposeButton
                mode={mode}
                level={voice.level}
                onPress={press}
                disabled={!configured}
                size={56}
                accessibilityLabel={
                  mode === 'send'
                    ? 'Save this'
                    : mode === 'listening'
                      ? 'Stop and save'
                      : 'Record with your voice'
                }
              />
              <View style={styles.statusCol}>
                {listening ? (
                  <View style={styles.wave}>
                    <VoiceWaveform level={voice.level} />
                  </View>
                ) : (
                  <Text style={styles.statusText} accessibilityLiveRegion="polite">
                    {status}
                  </Text>
                )}
              </View>
              {listening ? (
                <Pressable
                  onPress={voice.cancel}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
                >
                  <Text style={styles.pillText}>Cancel</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void save(text)}
                  disabled={!typed || busy || !configured}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Save this"
                  style={({ pressed }) => [
                    styles.pill,
                    typed && !busy && configured ? styles.pillOn : null,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      typed && !busy && configured ? styles.pillTextOn : styles.pillTextOff,
                    ]}
                  >
                    Save
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.tiles}>
            <IconTile icon="calendar-outline" label="Calendar" onPress={() => router.push('/calendar')} />
            <IconTile icon="list-outline" label="Timeline" onPress={() => router.push('/timeline')} />
            <IconTile icon="bookmark-outline" label="Lists" onPress={() => router.push('/lists')} />
            <IconTile icon="folder-outline" label="Groups" onPress={() => router.push('/groups')} />
          </View>

          {/* A group can be made here with nothing in it yet, so the name
              exists before the work does. */}
          {makingGroup ? (
            <NewGroupField
              autoFocus
              onCreated={(name) => {
                setMakingGroup(false);
                router.push(`/group/${encodeURIComponent(name)}`);
              }}
            />
          ) : (
            <Pressable
              onPress={() => setMakingGroup(true)}
              hitSlop={10}
              accessibilityRole="button"
              style={styles.newGroup}
            >
              <Ionicons name="add" size={18} color={colors.moss} />
              <Text style={styles.link}>New group</Text>
            </Pressable>
          )}

          {!configured ? (
            <Notice tone="info">No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env.</Notice>
          ) : null}
          {problem ? <Notice tone="alert">{problem}</Notice> : null}

          {saved ? (
            <View style={styles.saved}>
              <View style={styles.savedHead}>
                <View style={styles.savedTitle}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.moss} />
                  <Text style={styles.kept}>
                    {saved.memories.length === 1
                      ? 'Saved'
                      : `Saved ${saved.memories.length} entries`}
                  </Text>
                </View>
                <View style={styles.savedActions}>
                  <PillButton label="Undo" icon="arrow-undo" onPress={() => void undo()} />
                  <PillButton label="Edit" icon="pencil-outline" onPress={() => void edit()} />
                </View>
              </View>
              {saved.memories.length > 1 ? (
                <View style={styles.badge}>
                  <Ionicons name="sparkles" size={14} color={colors.moss} />
                  <Text style={[type.fine, styles.badgeText]}>
                    Found {saved.memories.length} separate items
                  </Text>
                </View>
              ) : null}
              {saved.memories
                .filter((m) => m.type === 'purchase' && m.amount !== null)
                .map((pm) => (
                  <View key={`exp-${pm.id}`} style={styles.expense}>
                    <Ionicons name="card-outline" size={16} color={colors.graphite} />
                    <Text style={[type.fine, styles.expenseText]}>
                      Recorded to Money ·{' '}
                      <Text style={styles.figure}>
                        {pm.currency ?? '₹'}
                        {pm.amount}
                      </Text>{' '}
                      ({pm.category})
                    </Text>
                    <Pressable
                      onPress={() => router.push('/(tabs)/expense-home')}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={styles.link}>View</Text>
                    </Pressable>
                  </View>
                ))}
              <View>
                {saved.memories.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} gutter="date" />
                ))}
              </View>
              {saved.changed.map((fix) => (
                <Text key={fix.to} style={[type.fine, styles.spelled]}>
                  Heard “{fix.from}” · saved as {fix.to}
                </Text>
              ))}
              {saved.alerts === false ? (
                <Text style={[type.fine, styles.alertsOff]}>
                  Notifications are off, so this won&apos;t remind you. Turn them on in
                  Settings › Apps › PERAI › Notifications.
                </Text>
              ) : null}
            </View>
          ) : null}

          {titles.checking.length > 0 ? (
            <Section
              label="Checking spelling"
              action={{ label: 'Stop all', onPress: titles.stopAll }}
            >
              {titles.checking.map((item) => (
                <View key={item.id} style={styles.cardRow}>
                  <View style={styles.cardRowLine}>
                    <View style={styles.cardRowText}>
                      <Text style={type.entry} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={type.stamp}>
                        {item.lastError ? 'Waiting' : 'Looking it up…'}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => titles.stop(item)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Stop checking ${item.title}`}
                    >
                      <Text style={styles.quiet}>Stop</Text>
                    </Pressable>
                  </View>
                  {item.lastError ? (
                    <Text style={type.fine}>{item.lastError}</Text>
                  ) : null}
                </View>
              ))}
            </Section>
          ) : null}

          {pending.notes.length > 0 ? (
            <Section label="Waiting to be filed">
              {pending.notes.map((note) => (
                <View key={note.id} style={styles.cardRow}>
                  <Text style={[type.body, styles.pendingText]} numberOfLines={3}>
                    {note.text}
                  </Text>
                  <View style={styles.cardRowLine}>
                    <Text style={[type.fine, styles.pendingWhy]} numberOfLines={1}>
                      {note.lastError ?? 'Waiting'}
                    </Text>
                    <View style={styles.inlineActions}>
                      <Pressable
                        onPress={() => pending.retry(note.id)}
                        hitSlop={10}
                        accessibilityRole="button"
                      >
                        <Text style={styles.link}>Retry</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => pending.forget(note.id)}
                        hitSlop={10}
                        accessibilityRole="button"
                      >
                        <Text style={styles.danger}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </Section>
          ) : null}

          {upcoming.length > 0 ? (
            <Section label="Coming up">
              {upcoming.map((memory) => (
                <SwipeableMemoryRow
                  key={memory.id}
                  memory={memory}
                  gutter="date"
                  showAdded={false}
                  struck={isStruck(memory)}
                  onPress={() => setOpenEntry(memory)}
                />
              ))}
            </Section>
          ) : null}

          {recent.length > 0 ? (
            <Section
              label="Recently added"
              action={{ label: 'See all', onPress: () => router.push('/timeline') }}
            >
              {recent.map((memory) => (
                <SwipeableMemoryRow
                  key={memory.id}
                  memory={memory}
                  gutter="date"
                  struck={isStruck(memory)}
                  onPress={() => setOpenEntry(memory)}
                />
              ))}
            </Section>
          ) : null}

          {!loading && memories.length === 0 && !saved ? (
            <Empty
              icon="mic-outline"
              title="Nothing recorded yet"
              hint="Everything you record shows up here and in your Timeline. Ask about any of it later from the Ask tab."
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <EntrySheet memory={openEntry} onClose={() => setOpenEntry(null)} />
    </Screen>
  );
}

/** A calm card that states the fact and the fix. */
function Notice({ children, tone }: { children: React.ReactNode; tone: 'info' | 'alert' }) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const alert = tone === 'alert';
  return (
    <View style={[styles.notice, alert && styles.noticeAlert]}>
      <Ionicons
        name={alert ? 'alert-circle-outline' : 'information-circle-outline'}
        size={20}
        color={alert ? colors.alert : colors.graphite}
      />
      <Text style={[type.body, styles.noticeText, alert && styles.noticeTextAlert]}>{children}</Text>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: { flexGrow: 1, padding: SPACE.page, paddingTop: 16, paddingBottom: 32, gap: 18 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    titleBlock: { flex: 1, gap: 2 },
    title: {
      fontFamily: FONTS.sansSemi,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.4,
      color: colors.ink,
    },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    composer: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 16,
      gap: 12,
    },
    composerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    prompt: { flex: 1 },
    input: {
      fontFamily: FONTS.sans,
      fontSize: 17,
      lineHeight: 24,
      color: colors.ink,
      minHeight: 52,
      textAlignVertical: 'top',
      padding: 0,
    },
    foot: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    statusCol: { flex: 1, minHeight: 56, justifyContent: 'center', overflow: 'hidden' },
    wave: { alignItems: 'flex-start' },
    statusText: { fontFamily: FONTS.sans, fontSize: 14, color: colors.graphite },
    pill: {
      minHeight: 40,
      paddingHorizontal: 18,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.well,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillOn: { backgroundColor: colors.mossFill, borderColor: colors.mossFill },
    pillText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: colors.ink },
    pillTextOn: { color: colors.onAccent },
    pillTextOff: { color: colors.mist },
    pressed: { opacity: 0.7 },
    tiles: { flexDirection: 'row', gap: 8 },
    newGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
    link: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.moss },
    quiet: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.graphite },
    danger: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.alert },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
    },
    noticeAlert: { backgroundColor: colors.alertSoft, borderColor: colors.alertSoft },
    noticeText: { flex: 1, color: colors.ink },
    noticeTextAlert: { color: colors.alert },
    saved: {
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 12,
    },
    savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    savedTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    kept: { fontFamily: FONTS.sansSemi, fontSize: 16, color: colors.moss, flexShrink: 1 },
    savedActions: { flexDirection: 'row', gap: 8 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      minHeight: 28,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.mossSoft,
    },
    badgeText: { color: colors.moss },
    expense: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: RADIUS.input,
      backgroundColor: colors.well,
    },
    expenseText: { flex: 1, color: colors.ink },
    figure: { fontFamily: FONTS.monoMedium, color: colors.ink },
    spelled: { color: colors.moss },
    alertsOff: { color: colors.alert },
    cardRow: {
      gap: 4,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    cardRowLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    cardRowText: { flex: 1, gap: 2 },
    pendingText: { color: colors.ink },
    pendingWhy: { flex: 1, color: colors.alert },
    inlineActions: { flexDirection: 'row', gap: 20 },
  });
}
