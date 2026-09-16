import { useRouter } from 'expo-router';
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
import { describeError, hasApiKey } from '@/ai/client';
import { extractMemories } from '@/ai/extract';
import { ComposeButton, type ComposeMode } from '@/components/ComposeButton';
import { MemoryRow } from '@/components/MemoryRow';
import { deleteMemories, insertMemory } from '@/db/queries';
import { setPendingDrafts } from '@/draftStore';
import { COLORS, FONTS, SPACE, TYPE } from '@/theme';
import type { Memory, MemoryDraft } from '@/types';
import { useVoiceInput } from '@/useVoiceInput';

const EXAMPLES = [
  'I got my haircut today',
  'Bought AirPods for 18000 yesterday',
  'Remind me to renew my passport next month',
  'Went to Kozhikode yesterday and bought a shirt for 1200 rupees',
];

interface Saved {
  rawInput: string;
  memories: Memory[];
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
  const router = useRouter();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  const configured = hasApiKey();

  async function save(raw: string) {
    const note = raw.trim();
    if (!note || saving || !configured) return;

    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const drafts = await extractMemories(note, new Date().toISOString());
      const memories: Memory[] = [];
      for (const draft of drafts) memories.push(await insertMemory(draft, note));
      setText('');
      setSaved({ rawInput: note, memories });
    } catch (err) {
      // Put a spoken note in the box so nothing said is lost.
      setText(note);
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const voice = useVoiceInput((spoken) => void save(spoken));

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

  const typed = text.trim().length > 0;
  const mode: ComposeMode =
    voice.stage === 'listening'
      ? 'listening'
      : voice.stage === 'transcribing' || saving
        ? 'busy'
        : typed
          ? 'send'
          : 'voice';

  function press() {
    if (mode === 'send') void save(text);
    else void voice.toggle();
  }

  const status =
    voice.stage === 'listening'
      ? 'Listening. Stops when you pause'
      : voice.stage === 'transcribing'
        ? 'Writing that down'
        : saving
          ? 'Saving'
          : typed
            ? 'One line can hold several events'
            : 'Tap the mic and say what happened';

  const problem = voice.error ?? error;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={TYPE.display}>What happened?</Text>

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (problem) {
                setError(null);
                voice.clearError();
              }
            }}
            placeholder="Speak or type"
            placeholderTextColor={COLORS.mist}
            style={styles.input}
            multiline
            editable={mode !== 'listening' && !saving}
          />

          <View style={styles.foot}>
            <View style={styles.statusCol}>
              <Text style={[TYPE.fine, mode === 'listening' && styles.live]}>{status}</Text>
              {mode === 'listening' ? (
                <Pressable onPress={voice.cancel} hitSlop={10}>
                  <Text style={[TYPE.label, styles.cancel]}>CANCEL</Text>
                </Pressable>
              ) : null}
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
              <Text style={[TYPE.label, styles.kept]}>
                {saved.memories.length === 1
                  ? 'SAVED'
                  : `SAVED ${saved.memories.length} ENTRIES`}
              </Text>
              <View style={styles.savedActions}>
                <Pressable onPress={() => void undo()} hitSlop={10}>
                  <Text style={[TYPE.label, styles.action]}>UNDO</Text>
                </Pressable>
                <Pressable onPress={() => void edit()} hitSlop={10}>
                  <Text style={[TYPE.label, styles.action]}>EDIT</Text>
                </Pressable>
              </View>
            </View>
            {saved.memories.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} gutter="date" />
            ))}
          </View>
        ) : (
          <View style={styles.examples}>
            <Text style={TYPE.label}>FOR EXAMPLE</Text>
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                onPress={() => setText(example)}
                disabled={mode !== 'voice' && mode !== 'send'}
                style={({ pressed }) => [styles.example, pressed && styles.pressed]}
              >
                <Text style={TYPE.body}>{example}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A rule in the margin, not a coloured box. States the fact and the fix. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={[TYPE.body, styles.noticeText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: SPACE.page, paddingTop: 72, paddingBottom: 48, gap: 22 },
  composer: { gap: 14 },
  input: {
    fontFamily: FONTS.sans,
    fontSize: 19,
    lineHeight: 28,
    color: COLORS.ink,
    minHeight: 92,
    textAlignVertical: 'top',
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusCol: { flex: 1, gap: 6 },
  live: { color: COLORS.moss },
  cancel: { color: COLORS.mist },
  notice: { borderLeftWidth: 2, borderLeftColor: COLORS.alert, paddingLeft: 12, paddingVertical: 2 },
  noticeText: { color: COLORS.alert },
  saved: {
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.moss,
    paddingLeft: 12,
  },
  savedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kept: { color: COLORS.moss },
  savedActions: { flexDirection: 'row', gap: 20 },
  action: { color: COLORS.graphite },
  examples: { gap: 2 },
  example: { paddingVertical: 9 },
  pressed: { opacity: 0.45 },
});
