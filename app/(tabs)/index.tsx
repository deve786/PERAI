import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { appVersion } from '@/appVersion';
import { ComposeButton, type ComposeMode } from '@/components/ComposeButton';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { ThemeToggle } from '@/components/ThemeToggle';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { deleteMemories, queueNote } from '@/db/queries';
import { setPendingDrafts } from '@/draftStore';
import { fileNote } from '@/fileNote';
import { LISTS } from '@/lists';
import { usePendingNotes } from '@/usePendingNotes';
import { notificationsAllowed, syncReminders } from '@/reminders';
import { reminderTime } from '@/reminderTime';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory, MemoryDraft, MemoryType } from '@/types';
import { useMemories } from '@/useMemories';
import { knownPeople } from '@/speechText';
import { useVoiceInput } from '@/useVoiceInput';
import { DEFAULT_WAKE_PHRASES, useWakeWord } from '@/useWakeWord';
import { WakeWordToggle } from '@/components/WakeWordToggle';

interface Saved {
  rawInput: string;
  memories: Memory[];
  /** null when nothing saved is a reminder; otherwise whether alerts can fire. */
  alerts: boolean | null;
  /** Titles a web search corrected, shown so a wrong one is obvious. */
  changed: { from: string; to: string }[];
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
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const pending = usePendingNotes({ people, listTitles }, configured);

  async function save(raw: string) {
    const note = raw.trim();
    if (!note || saving || !configured) return;

    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const { memories: kept, changed } = await fileNote(note, { people, listTitles });

      // Ask for notification permission here, the first time it matters —
      // right after saving something that is meant to remind you.
      let alerts: boolean | null = null;
      if (kept.some((m) => reminderTime(m) !== null)) {
        alerts = await notificationsAllowed(true);
        if (alerts) await syncReminders();
      }

      setText('');
      setSaved({ rawInput: note, memories: kept, alerts, changed });
    } catch (err) {
      // Nothing said is lost: the note is queued and filed automatically once
      // whatever failed — the network, the daily quota — is working again.
      await queueNote(note, describeError(err));
      setText('');
      setError(`${describeError(err)} Your note is kept below and will be filed automatically.`);
    } finally {
      setSaving(false);
    }
  }

  const voice = useVoiceInput((spoken) => void save(spoken), {
    contextualStrings: [...people, ...listTitles],
  });
  const [wakeArmed, setWakeArmed] = useState(false);

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
    return [...memories]
      .filter((m) => !justSaved.has(m.id) && !ahead.has(m.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);
  }, [memories, justSaved, upcoming]);

  async function undo() {
    if (!saved) return;
    await deleteMemories(saved.memories.map((m) => m.id));
    setText(saved.rawInput);
    setSaved(null);
  }

  async function edit() {
    if (!saved) return;
    await deleteMemories(saved.memories.map((m) => m.id));
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

  // Hands-free: tap the ear icon to arm, then say "start recording" and
  // useVoiceInput's own mic session begins, exactly as if the button had
  // been pressed. Only listens while armed AND the composer is genuinely
  // idle (mode === 'voice'), so it never fights the mic with an in-progress
  // capture, never overwrites text you're typing, and never fires again
  // mid-save — see useWakeWord.ts for how it hands the mic back and forth
  // with useVoiceInput's own session as mode changes.
  const wakeWord = useWakeWord(
    wakeArmed && mode === 'voice',
    DEFAULT_WAKE_PHRASES,
    () => void voice.toggle()
  );

  function press() {
    if (mode === 'send') void save(text);
    else void voice.toggle();
  }

  const status = saving || voice.stage === 'finishing'
    ? 'Saving'
    : typed
      ? 'One line can hold several events'
      : wakeArmed
        ? `Say "${DEFAULT_WAKE_PHRASES[0]}", or tap the mic`
        : 'Tap the mic and say what happened';

  const problem = voice.error ?? wakeWord.error ?? error;
  // The box shows what's being heard, live, while listening; your typed text
  // is untouched underneath and comes back the moment listening stops.
  const displayText = voice.stage === 'idle' ? text : voice.liveText;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Text style={type.display}>What happened?</Text>
          <View style={styles.titleActions}>
            <WakeWordToggle
              armed={wakeArmed}
              listening={wakeWord.stage === 'listening'}
              onToggle={() => setWakeArmed((a) => !a)}
            />
            <ThemeToggle />
          </View>
        </View>

        <View style={styles.composer}>
          <TextInput
            value={displayText}
            onChangeText={(value) => {
              setText(value);
              if (problem) {
                setError(null);
                voice.clearError();
              }
            }}
            placeholder={listening ? 'Listening…' : 'Speak or type'}
            placeholderTextColor={colors.mist}
            style={styles.input}
            multiline
            editable={voice.stage === 'idle' && !saving}
          />

          <View style={styles.foot}>
            <View style={styles.statusCol}>
              {listening ? (
                <>
                  <VoiceWaveform level={voice.level} />
                  <View style={styles.listeningMeta}>
                    <Text
                      style={[type.label, styles.live]}
                      accessibilityLiveRegion="polite"
                    >
                      LISTENING · SAY "STOP" TO FINISH
                    </Text>
                    <Pressable onPress={voice.cancel} hitSlop={10}>
                      <Text style={[type.label, styles.cancel]}>CANCEL</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={styles.statusRow}>
                  <Text style={[type.fine, styles.statusText]}>{status}</Text>
                  {typed && !saving ? (
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
                      <Text style={[type.label, styles.cancel]}>CLEAR</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
            <ComposeButton
              mode={mode}
              level={voice.level}
              onPress={press}
              disabled={!configured}
              accessibilityLabel={
                mode === 'send'
                  ? 'Save this'
                  : mode === 'listening'
                    ? 'Stop and save'
                    : 'Record with your voice'
              }
            />
          </View>
        </View>

        {!configured ? (
          <Notice>No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env.</Notice>
        ) : null}
        {problem ? <Notice>{problem}</Notice> : null}

        {saved ? (
          <View style={styles.saved}>
            <View style={styles.savedHead}>
              <Text style={[type.label, styles.kept]}>
                {saved.memories.length === 1
                  ? 'SAVED'
                  : `SAVED ${saved.memories.length} ENTRIES`}
              </Text>
              <View style={styles.savedActions}>
                <Pressable onPress={() => void undo()} hitSlop={10}>
                  <Text style={[type.label, styles.action]}>UNDO</Text>
                </Pressable>
                <Pressable onPress={() => void edit()} hitSlop={10}>
                  <Text style={[type.label, styles.action]}>EDIT</Text>
                </Pressable>
              </View>
            </View>
            {saved.memories.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} gutter="date" />
            ))}
            {saved.changed.map((fix) => (
              <Text key={fix.to} style={[type.stamp, styles.spelled]}>
                HEARD "{fix.from.toUpperCase()}" · SAVED AS {fix.to.toUpperCase()}
              </Text>
            ))}
            {saved.alerts === false ? (
              <Text style={[type.body, styles.alertsOff]}>
                Notifications are off, so this won't remind you. Turn them on in
                Settings › Apps › PERAI › Notifications.
              </Text>
            ) : null}
          </View>
        ) : null}

        {pending.notes.length > 0 ? (
          <Section label="WAITING TO BE FILED" inset={false}>
            {pending.notes.map((note) => (
              <View key={note.id} style={styles.pendingNote}>
                <Text style={type.body} numberOfLines={3}>
                  {note.text}
                </Text>
                <View style={styles.pendingFoot}>
                  <Text style={[type.stamp, styles.pendingWhy]} numberOfLines={1}>
                    {note.lastError ?? 'Waiting'}
                  </Text>
                  <View style={styles.savedActions}>
                    <Pressable onPress={() => pending.retry(note.id)} hitSlop={10}>
                      <Text style={[type.label, styles.action]}>RETRY</Text>
                    </Pressable>
                    <Pressable onPress={() => pending.forget(note.id)} hitSlop={10}>
                      <Text style={[type.label, styles.action]}>DELETE</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {upcoming.length > 0 ? (
          <Section label="COMING UP" tone="ahead">
            {upcoming.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} gutter="date" showAdded={false} />
            ))}
          </Section>
        ) : null}

        {recent.length > 0 ? (
          <Section
            label="RECENTLY ADDED"
            action={{ label: 'ALL', onPress: () => router.push('/timeline') }}
          >
            {recent.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} gutter="date" />
            ))}
          </Section>
        ) : null}

        {!loading && memories.length === 0 && !saved ? (
          <Text style={[type.body, styles.firstRun]}>
            Everything you record shows up here and in your Timeline. Ask about
            any of it later from the Ask tab.
          </Text>
        ) : null}

        <Text style={[type.stamp, styles.version]}>PERAI {appVersion()}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A rule in the margin, not a coloured box. States the fact and the fix. */
function Notice({ children }: { children: React.ReactNode }) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.notice}>
      <Text style={[type.body, styles.noticeText]}>{children}</Text>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: SPACE.page, paddingTop: 72, paddingBottom: 28, gap: 22 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    composer: { gap: 14 },
    input: {
      fontFamily: FONTS.sans,
      fontSize: 19,
      lineHeight: 28,
      color: colors.ink,
      minHeight: 56,
      textAlignVertical: 'top',
      paddingHorizontal: 0,
      paddingTop: 4,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    statusCol: { flex: 1, gap: 6 },
    listeningMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    statusText: { flex: 1 },
    live: { color: colors.moss },
    cancel: { color: colors.mist },
    notice: { borderLeftWidth: 2, borderLeftColor: colors.alert, paddingLeft: 12, paddingVertical: 2 },
    noticeText: { color: colors.alert },
    saved: {
      gap: 4,
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingLeft: 12,
    },
    savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kept: { color: colors.moss },
    savedActions: { flexDirection: 'row', gap: 20 },
    action: { color: colors.graphite },
    alertsOff: { color: colors.alert, marginTop: 8 },
    spelled: { color: colors.moss, marginTop: 2 },
    pendingNote: { gap: 6, paddingVertical: 8 },
    pendingFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    pendingWhy: { flex: 1, color: colors.alert },
    firstRun: { maxWidth: 320, marginTop: 8 },
    // Pinned to the bottom of the screen, out of the way of capturing.
    version: { marginTop: 'auto', textAlign: 'center', color: colors.mist },
  });
}
