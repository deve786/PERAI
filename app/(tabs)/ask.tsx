import { Ionicons } from '@expo/vector-icons';
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
import { askAI, type AskResult } from '@/ai/ask';
import { describeError, hasApiKey } from '@/ai/client';
import { MemoryRow } from '@/components/MemoryRow';
import { MicButton } from '@/components/MicButton';
import { getAllMemories } from '@/db/queries';
import { COLORS, FONTS, GUTTER, SPACE, TYPE } from '@/theme';
import { useVoiceInput } from '@/useVoiceInput';

const SUGGESTIONS = [
  'When did I last cut my hair?',
  'How much did I spend on electronics?',
  'How often do I go to the gym?',
  'What did I do last week?',
];

export default function AskScreen() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A spoken question replaces the box rather than appending: you ask one
  // thing at a time, and the previous question is already answered above.
  const voice = useVoiceInput(setQuestion);

  const configured = hasApiKey();
  const listening = voice.stage !== 'idle';
  const canAsk = question.trim().length > 0 && !busy && !listening && configured;

  async function ask() {
    if (!canAsk) return;
    const q = question.trim();

    setBusy(true);
    setError(null);
    setResult(null);
    setAsked(q);
    try {
      setResult(await askAI(q, new Date().toISOString(), await getAllMemories()));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
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
            placeholder="When did I last…"
            placeholderTextColor={COLORS.mist}
            style={styles.input}
            editable={!busy}
            returnKeyType="search"
            onSubmitEditing={ask}
            multiline
          />
          <MicButton stage={voice.stage} onPress={voice.toggle} disabled={busy} />
          <Pressable
            onPress={ask}
            disabled={!canAsk}
            hitSlop={8}
            style={[styles.send, !canAsk && styles.sendOff]}
            accessibilityLabel="Ask"
          >
            {busy ? (
              <ActivityIndicator color={COLORS.paper} size="small" />
            ) : (
              <Ionicons name="arrow-forward" size={17} color={COLORS.paper} />
            )}
          </Pressable>
        </View>

        {listening ? (
          <Text style={TYPE.label}>
            {voice.stage === 'listening'
              ? 'LISTENING — PRESS AGAIN WHEN YOU FINISH'
              : 'WRITING THAT DOWN'}
          </Text>
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
          <View style={styles.suggestions}>
            <Text style={TYPE.label}>TRY</Text>
            {SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                onPress={() => setQuestion(suggestion)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text style={TYPE.body}>{suggestion}</Text>
              </Pressable>
            ))}
            <Text style={[TYPE.fine, styles.disclaimer]}>
              Answers come only from what you have recorded. When there is no
              entry for something, this says so instead of guessing.
            </Text>
          </View>
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
  askBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
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
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.moss,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendOff: { backgroundColor: COLORS.rule },
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
  suggestions: { gap: 2 },
  suggestion: { paddingVertical: 9 },
  pressed: { opacity: 0.45 },
  disclaimer: { marginTop: 18, maxWidth: 320 },
});
