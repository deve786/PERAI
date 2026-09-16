import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { MicButton } from '@/components/MicButton';
import { setPendingDrafts } from '@/draftStore';
import { COLORS, FONTS, SPACE, TYPE } from '@/theme';
import { useVoiceInput } from '@/useVoiceInput';

const EXAMPLES = [
  'I got my haircut today',
  'Bought AirPods for 18000 yesterday',
  'Remind me to renew my passport next month',
  'Dentist appointment on Friday at 4pm',
  'Went to Kozhikode yesterday and bought a shirt for 1200 rupees',
];

export default function CaptureScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A transcript joins whatever is already typed rather than replacing it, so
  // you can start typing, finish out loud, or dictate a second event.
  const voice = useVoiceInput((spoken) =>
    setText((current) => (current.trim() ? `${current.trim()} ${spoken}` : spoken))
  );

  const configured = hasApiKey();
  const listening = voice.stage !== 'idle';
  const canSubmit = text.trim().length > 0 && !busy && !listening && configured;

  async function submit() {
    if (!canSubmit) return;
    const raw = text.trim();

    setBusy(true);
    setError(null);
    try {
      const drafts = await extractMemories(raw, new Date().toISOString());
      setPendingDrafts(raw, drafts);
      setText('');
      router.push('/preview');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={TYPE.display}>What happened?</Text>

        <View style={styles.well}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="I got my haircut today"
            placeholderTextColor={COLORS.mist}
            style={styles.input}
            multiline
            editable={!busy}
          />

          <View style={styles.wellFoot}>
            <Text style={TYPE.fine}>
              {voice.stage === 'listening'
                ? 'Listening — press again when you finish'
                : voice.stage === 'transcribing'
                  ? 'Writing that down'
                  : busy
                    ? 'Reading that'
                    : 'Speak or type. One line can hold several events'}
            </Text>
            <View style={styles.controls}>
              <MicButton stage={voice.stage} onPress={voice.toggle} disabled={busy} />
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                hitSlop={8}
                style={[styles.send, !canSubmit && styles.sendOff]}
                accessibilityLabel="Save this to your record"
              >
                {busy ? (
                  <ActivityIndicator color={COLORS.paper} size="small" />
                ) : (
                  <Ionicons name="arrow-forward" size={17} color={COLORS.paper} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {voice.error ? <Notice>{voice.error}</Notice> : null}

        {!configured ? (
          <Notice>
            No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env, then restart
            with npx expo start --clear.
          </Notice>
        ) : null}

        {error ? <Notice>{error}</Notice> : null}

        <View style={styles.examples}>
          <Text style={TYPE.label}>TRY</Text>
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => setText(example)}
              disabled={busy}
              style={({ pressed }) => [styles.example, pressed && styles.pressed]}
            >
              <Text style={TYPE.body}>{example}</Text>
            </Pressable>
          ))}
        </View>
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
  content: {
    padding: SPACE.page,
    paddingTop: 72,
    paddingBottom: 48,
    gap: 22,
  },
  // No box. Both inputs in the app are a line of type over a hairline, so
  // writing always looks the same whether you are recording or asking.
  well: { gap: 14 },
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
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wellFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: COLORS.rule },
  notice: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.alert,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  noticeText: { color: COLORS.alert },
  examples: { gap: 2 },
  example: { paddingVertical: 9 },
  pressed: { opacity: 0.45 },
});
