import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Section } from '@/components/Section';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { forgetQuestion, getAllMemories, getRecentQuestions, saveQuestion } from '@/db/queries';
import { buildChatContext } from '@/expense/chatContext';
import { getSetting } from '@/expense/db';
import { useTheme } from '@/ThemeContext';
import { FONTS, GUTTER, SPACE, type Colors } from '@/theme';
import { formatAmount, shortDate } from '@/format';
import { reminderTime } from '@/reminderTime';
import { useMemories } from '@/useMemories';
import { knownPeople } from '@/speechText';
import { useVoiceInput } from '@/useVoiceInput';

/** Which source(s) a found answer actually drew on — memories, Expense data, or both. */
function sourceLabel(result: AskResult): string {
  const { evidence, usedExpenseData } = result;
  const memoryPart = evidence.length > 0 ? (evidence.length === 1 ? '1 ENTRY' : `${evidence.length} ENTRIES`) : null;
  if (memoryPart && usedExpenseData) return `FROM ${memoryPart} + EXPENSE DATA`;
  if (memoryPart) return `FROM ${memoryPart}`;
  if (usedExpenseData) return 'FROM EXPENSE DATA';
  return 'FROM YOUR RECORD';
}

export default function AskScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState('');
  /** The conversation, newest first — a follow-up is answered knowing these. */
  const [thread, setThread] = useState<{ question: string; result: AskResult }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = hasApiKey();

  const { memories } = useMemories();
  const [recentQuestions, setRecentQuestions] = useState<string[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      setRecentQuestions(await getRecentQuestions(5));
    } catch {
      // Not worth interrupting the screen for.
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  // "42 ENTRIES · SINCE 3 SEPT" — what answers are drawn from.
  const scope = useMemo(() => {
    if (memories.length === 0) return null;
    const first = memories.reduce(
      (earliest, m) => (m.createdAt < earliest ? m.createdAt : earliest),
      memories[0].createdAt
    );
    const count = memories.length === 1 ? '1 ENTRY' : `${memories.length} ENTRIES`;
    return `ANSWERS FROM ${count} · SINCE ${shortDate(first).toUpperCase()}`;
  }, [memories]);

  // A few facts about the last 7 days, worked out on the phone. Each one is a
  // question you might ask anyway, so tapping it asks.
  const week = useMemo(() => {
    const now = new Date();
    const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const inWeek = memories.filter((m) => {
      const t = new Date(m.eventDate).getTime();
      return t >= since && t <= now.getTime();
    });
    const spentByCurrency = new Map<string, number>();
    for (const m of inWeek) {
      if (m.amount === null) continue;
      const code = m.currency ?? 'INR';
      spentByCurrency.set(code, (spentByCurrency.get(code) ?? 0) + m.amount);
    }
    const ahead = memories.filter((m) => reminderTime(m, now) !== null).length;

    const facts: Array<{ figure: string; text: string; question: string }> = [];
    if (inWeek.length > 0) {
      facts.push({
        figure: String(inWeek.length),
        text: inWeek.length === 1 ? 'entry in the last 7 days' : 'entries in the last 7 days',
        question: 'What did I do in the last 7 days?',
      });
    }
    for (const [code, total] of spentByCurrency) {
      facts.push({
        figure: formatAmount(total, code) ?? String(total),
        text: 'spent in the last 7 days',
        question: 'How much did I spend in the last 7 days?',
      });
    }
    if (ahead > 0) {
      facts.push({
        figure: String(ahead),
        text: ahead === 1 ? 'reminder coming up' : 'reminders coming up',
        question: 'What reminders and appointments are coming up?',
      });
    }
    return facts;
  }, [memories]);

  async function ask(raw: string) {
    const q = raw.trim();
    if (!q || busy || !configured) return;

    setBusy(true);
    setError(null);
    setAsking(q);
    setQuestion('');
    try {
      // Oldest first, as the model reads it: what was asked, and what it said.
      const history = [...thread]
        .reverse()
        .map((turn) => ({ question: turn.question, answer: turn.result.answer }));

      // Expense mode's own data joins the memories as a second source, so a
      // question about spending is answered whether it was voice-captured or
      // logged as a structured expense. Failing to read it (e.g. Expense mode
      // was never opened) should not block answering from memories alone.
      const expenseContext = await buildChatContext(
        await getSetting('symbol', '₹'),
        Number(await getSetting('budget', '0')) || 0
      ).catch(() => undefined);

      const result = await askAI(q, new Date().toISOString(), await getAllMemories(), history, expenseContext);
      setThread((current) => [{ question: q, result }, ...current]);
      await saveQuestion(q);
      await loadRecent();
    } catch (err) {
      // Leave the question in the box so it can be retried with one press.
      setQuestion(q);
      setError(describeError(err));
    } finally {
      setAsking('');
      setBusy(false);
    }
  }

  // Speak the question and it is asked as soon as you stop talking. The
  // question stays visible above the answer, so a mis-hearing is obvious.
  // Names and list titles already recorded, so a question about them is heard
  // the way they are spelled.
  const hints = useMemo(
    () => [...knownPeople(memories), ...memories.slice(0, 40).map((m) => m.title)],
    [memories]
  );
  const voice = useVoiceInput((spoken) => void ask(spoken), { contextualStrings: hints });

  const listening = voice.stage === 'listening';
  const typed = question.trim().length > 0;
  const mode: ComposeMode = listening
    ? 'listening'
    : busy || voice.stage === 'finishing'
      ? 'busy'
      : typed
        ? 'send'
        : 'voice';

  function press() {
    if (mode === 'send') void ask(question);
    else void voice.toggle();
  }

  const idle = thread.length === 0 && !busy && !error;
  // The box shows what's being heard, live, while listening.
  const displayQuestion = voice.stage === 'idle' ? question : voice.liveText;

  // Questions already in this conversation are above; no need to offer them.
  const inThread = new Set(thread.map((turn) => turn.question));
  const otherQuestions = recentQuestions.filter((q) => !inThread.has(q));

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
        <Text style={type.display}>Ask your record</Text>

        <View style={styles.askBar}>
          <TextInput
            value={displayQuestion}
            onChangeText={setQuestion}
            placeholder={listening ? 'Listening…' : 'Ask out loud or type'}
            placeholderTextColor={colors.mist}
            style={styles.input}
            editable={voice.stage === 'idle' && !busy}
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

        {scope && !listening ? (
          <View style={styles.scopeRow}>
            <Text style={[type.stamp, styles.scope]}>
              {thread.length > 0 ? 'FOLLOW ON, OR ASK SOMETHING NEW' : scope}
            </Text>
            {thread.length > 0 ? (
              <Pressable onPress={() => setThread([])} hitSlop={10}>
                <Text style={[type.label, styles.cancel]}>CLEAR</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {listening ? (
          <View style={styles.listening}>
            <VoiceWaveform level={voice.level} />
            <View style={styles.listenRow}>
              <Text style={[type.label, styles.live]} accessibilityLiveRegion="polite">
                LISTENING · SAY "STOP" TO FINISH
              </Text>
              <Pressable onPress={voice.cancel} hitSlop={10}>
                <Text style={[type.label, styles.cancel]}>CANCEL</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {voice.error ? (
          <View style={styles.notice}>
            <Text style={[type.body, styles.noticeText]}>{voice.error}</Text>
          </View>
        ) : null}

        {!configured ? (
          <View style={styles.notice}>
            <Text style={[type.body, styles.noticeText]}>
              No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env to ask
              questions.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.notice}>
            <Text style={[type.body, styles.noticeText]}>{error}</Text>
          </View>
        ) : null}

        {busy ? (
          <View style={styles.answerBlock}>
            <Text style={[type.stamp, styles.question]}>{asking.toUpperCase()}</Text>
            <Text style={type.label}>SEARCHING YOUR RECORD</Text>
          </View>
        ) : null}

        {thread.map(({ question: asked, result }, index) => (
          <View
            key={`${asked}-${thread.length - index}`}
            style={[styles.answerBlock, index > 0 && styles.earlier]}
          >
            <Text style={[type.stamp, styles.question]}>{asked.toUpperCase()}</Text>

            {result.headline ? (
              <Text style={[type.figure, styles.headline]}>{result.headline}</Text>
            ) : null}

            <Text style={type.answer}>{result.answer}</Text>

            {/* The substance as a list: a phone screen makes a paragraph of
                dates and amounts almost unreadable. */}
            {result.items.length > 0 ? (
              <View style={styles.items}>
                {result.items.map((item, index) => (
                  <View key={`${item}-${index}`} style={styles.item}>
                    <Text style={[type.gutter, styles.itemMark]}>{index + 1}</Text>
                    <Text style={[type.body, styles.itemText]}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {result.found ? (
              <View style={styles.evidence}>
                <Text style={type.label}>{sourceLabel(result)}</Text>
                <View style={styles.evidenceRule} />
                {result.evidence.map((memory) => (
                  <MemoryRow key={memory.id} memory={memory} gutter="date" />
                ))}
              </View>
            ) : (
              <Text style={[type.fine, styles.noEvidence]}>
                Nothing in your record matches this.
              </Text>
            )}
          </View>
        ))}

        {idle && week.length > 0 ? (
          <Section label="THIS WEEK" inset={false}>
            {week.map((fact) => (
              <Pressable
                key={fact.text + fact.figure}
                onPress={() => void ask(fact.question)}
                disabled={!configured || mode !== 'voice'}
                style={({ pressed }) => [styles.fact, pressed && styles.pressed]}
                accessibilityHint={`Asks: ${fact.question}`}
              >
                <Text style={[type.figure, styles.factFigure]}>{fact.figure}</Text>
                <Text style={type.body}>{fact.text}</Text>
              </Pressable>
            ))}
          </Section>
        ) : null}

        {!busy && otherQuestions.length > 0 ? (
          <Section label="RECENT QUESTIONS" inset={false}>
            {otherQuestions
              .map((q) => (
                <Pressable
                  key={q}
                  onPress={() => void ask(q)}
                  onLongPress={() => void forgetQuestion(q).then(loadRecent)}
                  disabled={!configured || mode !== 'voice'}
                  style={({ pressed }) => [styles.recent, pressed && styles.pressed]}
                  accessibilityHint="Asks this again. Long-press to remove it."
                >
                  <Text style={type.body} numberOfLines={2}>
                    {q}
                  </Text>
                </Pressable>
              ))}
          </Section>
        ) : null}

        {idle ? (
          <Text style={[type.fine, styles.disclaimer]}>
            Answers come only from what you have recorded. When there is no
            entry for something, this says so instead of guessing.
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
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
      color: colors.ink,
      maxHeight: 110,
      paddingVertical: 10,
      paddingHorizontal: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    listening: { gap: 8 },
    listenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    live: { color: colors.moss },
    cancel: { color: colors.mist },
    notice: {
      borderLeftWidth: 2,
      borderLeftColor: colors.alert,
      paddingLeft: 12,
      paddingVertical: 2,
    },
    noticeText: { color: colors.alert },
    answerBlock: { gap: 14 },
    headline: { fontSize: 30, lineHeight: 36, color: colors.ink, marginBottom: -6 },
    items: { gap: 2, marginTop: -4 },
    item: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 5 },
    itemMark: { width: 18, color: colors.mist },
    itemText: { flex: 1, color: colors.ink },
    question: { color: colors.mist },
    evidence: { gap: 6, marginTop: 6 },
    evidenceRule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.rule,
      marginLeft: GUTTER,
    },
    noEvidence: { marginTop: -4 },
    disclaimer: { maxWidth: 320 },
    scopeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: -8,
    },
    scope: { color: colors.mist },
    // Earlier exchanges stay readable but step back from the newest one.
    earlier: { opacity: 0.6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule, paddingTop: 16 },
    recent: { paddingVertical: 9 },
    fact: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 8 },
    factFigure: { minWidth: GUTTER - 10, fontSize: 16 },
    pressed: { opacity: 0.45 },
  });
}
