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
import { askAI, type AskResult } from '@/ai/ask';
import { describeError, hasApiKey } from '@/ai/client';
import { MemoryRow } from '@/components/MemoryRow';
import { ComposeButton, type ComposeMode } from '@/components/ComposeButton';
import { getAllMemories } from '@/db/queries';
import { COLORS, FONTS, GUTTER, SPACE, TYPE } from '@/theme';
import { useVoiceInput } from '@/useVoiceInput';

export default function AskScreen() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = hasApiKey();

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || busy || !configured) return;

    setBusy(true);
    setError(null);
    setResult(null);
    setAsked(q);
    setQuestion('');
    try {
      setResult(await askAI(q, new Date().toISOString(), await getAllMemories()));
    } catch (err) {
      // Leave the question in the box so it can be retried with one press.
      setQuestion(q);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // Speak the question and it is asked as soon as you stop talking. The
  // question stays visible above the answer, so a mis-hearing is obvious.
  const voice = useVoiceInput((spoken) => void ask(spoken));

  const typed = question.trim().length > 0;
  const mode: ComposeMode =
    voice.stage === 'listening'
      ? 'listening'
      : voice.stage === 'transcribing' || busy
        ? 'busy'
        : typed
          ? 'send'
          : 'voice';

  function press() {
    if (mode === 'send') void ask(question);
    else void voice.toggle();
  }

  const idle = !result && !busy && !error;

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
        <Text style={TYPE.display}>Ask your record</Text>

        <View style={styles.askBar}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask out loud or type"
            placeholderTextColor={COLORS.mist}
            style={styles.input}
            editable={mode !== 'listening' && !busy}
            returnKeyType="search"
            onSubmitEditing={() => void ask(question)}
            multiline
          />
          <ComposeButton
            mode={mode}
            level={voice.level}
            onPress={press}
            disabled={!configured}
            accessibilityLabel={
              mode === 'send' ? 'Ask' : mode === 'listening' ? 'Stop and ask' : 'Ask with your voice'
            }
          />
        </View>

        {mode === 'listening' ? (
          <View style={styles.listenRow}>
            <Text style={[TYPE.label, styles.live]}>LISTENING. STOPS WHEN YOU PAUSE</Text>
            <Pressable onPress={voice.cancel} hitSlop={10}>
              <Text style={[TYPE.label, styles.cancel]}>CANCEL</Text>
            </Pressable>
          </View>
        ) : voice.stage === 'transcribing' ? (
          <Text style={TYPE.label}>WRITING THAT DOWN</Text>
        ) : null}

        {voice.error ? (
          <View style={styles.notice}>
            <Text style={[TYPE.body, styles.noticeText]}>{voice.error}</Text>
          </View>
        ) : null}

        {!configured ? (
          <View style={styles.notice}>
            <Text style={[TYPE.body, styles.noticeText]}>
              No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env to ask
              questions.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.notice}>
            <Text style={[TYPE.body, styles.noticeText]}>{error}</Text>
          </View>
        ) : null}

        {busy ? <Text style={TYPE.label}>SEARCHING YOUR RECORD</Text> : null}

        {result && !busy ? (
          <View style={styles.answerBlock}>
            <Text style={[TYPE.stamp, styles.question]}>{asked.toUpperCase()}</Text>

            <Text style={TYPE.answer}>{result.answer}</Text>

            {result.found ? (
              <View style={styles.evidence}>
                <Text style={TYPE.label}>
                  {result.evidence.length === 1
                    ? 'FROM 1 ENTRY'
                    : `FROM ${result.evidence.length} ENTRIES`}
                </Text>
                <View style={styles.evidenceRule} />
                {result.evidence.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} gutter="date" />
                ))}
              </View>
            ) : (
              <Text style={[TYPE.fine, styles.noEvidence]}>
                Nothing in your record matches this.
              </Text>
            )}
          </View>
        ) : null}

        {idle ? (
          <Text style={[TYPE.fine, styles.disclaimer]}>
            Answers come only from what you have recorded. When there is no
            entry for something, this says so instead of guessing.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.paper },
  content: {
    padding: SPACE.page,
    paddingTop: 68,
    paddingBottom: 48,
    gap: 20,
  },
  askBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flex: 1,
    fontFamily: FONTS.sans,
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.ink,
    maxHeight: 110,
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  listenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  live: { color: COLORS.moss },
  cancel: { color: COLORS.mist },
  notice: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.alert,
    paddingLeft: 12,
    paddingVertical: 2,
  },
  noticeText: { color: COLORS.alert },
  answerBlock: { gap: 14 },
  question: { color: COLORS.mist },
  evidence: { gap: 6, marginTop: 6 },
  evidenceRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
    marginLeft: GUTTER,
  },
  noEvidence: { marginTop: -4 },
  disclaimer: { maxWidth: 320 },
});
