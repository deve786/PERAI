import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { askAI, type AskResult } from '@/ai/ask';
import { askAIEnhanced, type EnhancedAskResult } from '@/ai/askEnhanced';
import {
  looksLikeCommand,
  planCommand,
  runCommand,
  type CommandOutcome,
  type CommandPlan,
} from '@/ai/command';
import { extractMemories } from '@/ai/extract';
import { setPendingDrafts } from '@/draftStore';
import {
  getTitleLanguage,
  getSelectedAiModel,
  setSelectedAiModel,
  AI_MODELS,
  getGroqApiKey,
  type AiModelChoice,
} from '@/settings';
import { describeError, hasApiKey, setSelectedModelInMemory } from '@/ai/client';
import { showDialog } from '@/dialogStore';
import { MemoryRow } from '@/components/MemoryRow';
import { PlanCard } from '@/components/PlanCard';
import { forgetQuestion, getAllMemories, getRecentQuestions, saveQuestion, insertMemory } from '@/db/queries';
import { TimetableTimelineCard, extractTimelineFromText, type TimelineStep } from '@/components/TimetableTimelineCard';
import { VoiceWaveform } from '@/components/VoiceWaveform';
import { buildChatContext } from '@/expense/chatContext';
import { getSetting, listExpenses } from '@/expense/db';
import { addDays, todayStr } from '@/expense/dates';
import { useTheme as useExpenseTheme } from '@/expense/theme';
import { Header, PillButton, Screen } from '@/expense/ui';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '@/theme';
import { formatAmount, shortDate, toSentence } from '@/format';
import { reminderTime } from '@/reminderTime';
import { useMemories } from '@/useMemories';
import { answerTripSpend } from '@/expense/tripAnswer';
import { knownPeople } from '@/speechText';
import { tripSpendQuestion } from '@/tripQuestion';
import { useVoiceInput } from '@/useVoiceInput';
import { KeyboardLift } from '@/components/KeyboardLift';

// Prompts that work even on day one, before any week-of-data facts exist.
const TRY_ASKING = [
  'How much did I spend this month?',
  'What was my biggest expense last month?',
  'Compare this month with last month',
  'Where am I spending the most?',
];

/** Which source(s) a found answer actually drew on — memories, Money data, or multi-source. */
function sourceLabel(result: AskResult | EnhancedAskResult): string {
  if ('sourcesUsed' in result && result.sourcesUsed) {
    const sources = result.sourcesUsed;
    if (sources.length === 0) return 'From your record';

    const labels: string[] = [];
    if (sources.includes('memory')) labels.push('memories');
    if (sources.includes('expense')) labels.push('expenses');
    if (sources.includes('document')) labels.push('documents');
    if (sources.includes('website')) labels.push('websites');
    if (sources.includes('telegram')) labels.push('Telegram');

    if (labels.length === 1) return `From your ${labels[0]}`;
    if (labels.length === 2) return `From ${labels[0]} and ${labels[1]}`;
    return `From ${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  }

  const legacyResult = result as AskResult;
  const memoryPart = legacyResult.evidence.length > 0 ? (legacyResult.evidence.length === 1 ? '1 entry' : `${legacyResult.evidence.length} entries`) : null;
  if (memoryPart && legacyResult.usedExpenseData) return `From ${memoryPart} and your Money entries`;
  if (memoryPart) return `From ${memoryPart}`;
  if (legacyResult.usedExpenseData) return 'From your Money entries';
  return 'From your record';
}

export default function AskScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState('');
  /** The conversation, newest first — a follow-up is answered knowing these. */
  const [thread, setThread] = useState<{
    question: string;
    result: AskResult | EnhancedAskResult;
    durationMs?: number;
  }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A change worked out from an instruction, waiting to be confirmed. */
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  /** The change just carried out, kept so it can be undone. */
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  /** What the instruction needs answering before anything can be proposed. */
  const [clarify, setClarify] = useState<string | null>(null);

  const router = useRouter();
  const configured = hasApiKey();
  const { budget, setBudget } = useExpenseTheme();

  const { memories } = useMemories();
  const [recentQuestions, setRecentQuestions] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<AiModelChoice>('gemini-3.5-flash-lite');

  useEffect(() => {
    void getSelectedAiModel().then((m) => {
      setActiveModel(m);
      setSelectedModelInMemory(m);
    });
  }, []);

  function promptSwitchModel() {
    const currentOpt = AI_MODELS.find((m) => m.value === activeModel);
    showDialog({
      title: 'Change AI Model',
      message: `Current: ${currentOpt?.label ?? activeModel} (${currentOpt?.speed ?? ''})\n\nSelect a model for answering questions:`,
      actions: [
        { label: 'Cancel', cancel: true },
        ...AI_MODELS.map((opt) => ({
          label: `${opt.label} (${opt.speed})`,
          onPress: () => {
            void (async () => {
              if (opt.provider === 'groq') {
                const key = await getGroqApiKey();
                if (!key) {
                  showDialog({
                    title: 'Groq Key Required',
                    message:
                      'Please configure your free Groq API key in Settings > AI diagnostics & logs first.',
                  });
                  return;
                }
              }
              setActiveModel(opt.value);
              setSelectedModelInMemory(opt.value);
              await setSelectedAiModel(opt.value);
            })();
          },
        })),
      ],
    });
  }

  // The newest exchange is scrolled to the top of the view when it appears,
  // so a long answer is read from its start rather than its end.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToNewest = useRef(false);
  const onNewestLayout = useCallback((event: LayoutChangeEvent) => {
    if (!scrollToNewest.current) return;
    scrollToNewest.current = false;
    const y = Math.max(0, event.nativeEvent.layout.y - 12);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  // Like a chat app: when the keyboard opens, keep the latest exchange in view.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    });
    return () => sub.remove();
  }, []);

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

  // "Answers from 42 entries · since 3 Sept" — what answers are drawn from.
  const scope = useMemo(() => {
    if (memories.length === 0) return null;
    const first = memories.reduce(
      (earliest, m) => (m.createdAt < earliest ? m.createdAt : earliest),
      memories[0].createdAt
    );
    const count = memories.length === 1 ? '1 entry' : `${memories.length} entries`;
    return `Answers from ${count} · since ${shortDate(first)}`;
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

    const facts: { figure: string; text: string; question: string }[] = [];
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
    setOutcome(null);
    setClarify(null);
    scrollToNewest.current = true;
    try {
      // An instruction is worked out first, but only when it reads like one —
      // the check is local, so asking a question still costs one call as before.
      // Nothing is changed here: a plan only ever goes to the confirm step.
      if (looksLikeCommand(q)) {
        const recentExpenses = await listExpenses(addDays(todayStr(), -365), todayStr()).catch(
          () => []
        );
        const proposed = await planCommand(
          q,
          new Date().toISOString(),
          await getAllMemories(),
          recentExpenses.slice(0, 120)
        );
        if (proposed && 'question' in proposed) {
          // It matched more than one thing. Asking is cheaper than guessing.
          scrollToNewest.current = true;
          setClarify(proposed.question);
          return;
        }
        if (proposed) {
          scrollToNewest.current = true;
          setPlan(proposed);
          return;
        }
        // Not a command after all — fall through and answer it.
      }

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

      const all = await getAllMemories();

      // "How much did I spend on my Kozhikode trip?" is a SUM over the link
      // table: answered here, at once and exactly, rather than by the model.
      // Anything it cannot answer falls through to the ordinary flow.
      const trip = tripSpendQuestion(q, all);
      const tripAnswer = trip ? await answerTripSpend(trip) : null;

      const startTime = Date.now();
      const result =
        tripAnswer ?? (await askAIEnhanced(q, new Date().toISOString(), all, history, expenseContext));
      const durationMs = Date.now() - startTime;
      scrollToNewest.current = true;
      setThread((current) => [{ question: q, result, durationMs }, ...current]);
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

  async function confirmPlan() {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Changes first, so an instruction that both alters something and
      // records something new does both rather than only the new entry.
      const changes = plan.actions.some((action) => action.kind !== 'add_entry');
      const done = changes ? await runCommand(plan, { currentBudget: budget, setBudget }) : null;
      setPlan(null);
      if (done) setOutcome(done);

      // Something new said in the Ask box is not written from here: it is
      // understood and sent to the review screen, like any other capture.
      if (plan.capture) {
        const drafts = await extractMemories(plan.capture, new Date().toISOString(), knownPeople(memories), {
          titleLanguage: await getTitleLanguage(),
          retries: 0,
        });
        if (drafts.length === 0) {
          setError('Nothing could be made of that. Try saying it on the Record tab.');
          return;
        }
        setPendingDrafts(plan.capture, drafts);
        router.push('/preview');
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function undoOutcome() {
    if (!outcome?.undo || busy) return;
    setBusy(true);
    try {
      await outcome.undo();
      setOutcome(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  // Undo is offered for a few seconds and then the card goes, so the screen
  // does not keep a stale "done" notice sitting over the next question.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!outcome) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setOutcome(null), 8000);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [outcome]);

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
  const finishing = voice.stage === 'finishing';
  const typed = question.trim().length > 0;
  // Suggestions ask straight away, so they only work while nothing else is going on.
  const canTapToAsk = configured && !busy && voice.stage === 'idle' && !typed;
  const canSend = configured && typed && !busy && voice.stage === 'idle';
  const micDisabled = !listening && (!configured || busy || finishing);

  const idle = thread.length === 0 && !busy && !error && !plan && !outcome && !clarify;
  // The box shows what's being heard, live, while listening.
  const displayQuestion = voice.stage === 'idle' ? question : voice.liveText;

  // Questions already in this conversation are above; no need to offer them.
  const inThread = new Set(thread.map((turn) => turn.question));
  const otherQuestions = recentQuestions.filter((q) => !inThread.has(q));
  const suggestions = TRY_ASKING.filter((q) => !inThread.has(q));

  // Oldest at the top, newest just above the box — read like a conversation.
  const conversation = [...thread].reverse();

  return (
    <Screen edges={['top']}>
      <KeyboardLift style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Header
            title="Ask"
            subtitle="Search across notes, money, documents, websites & Telegram"
            right={
              thread.length > 0 && !busy ? (
                <PillButton label="Clear" icon="refresh" onPress={() => setThread([])} />
              ) : undefined
            }
          />

          {(() => {
            const activeOpt = AI_MODELS.find((m) => m.value === activeModel);
            const isThinking = activeModel === 'gemini-3.8-flash';
            const isGroq = activeOpt?.provider === 'groq';
            return (
              <Pressable
                onPress={promptSwitchModel}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Switch AI model"
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 5,
                  paddingHorizontal: 11,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: isThinking ? colors.moss : colors.rule,
                  backgroundColor: isThinking ? colors.mossSoft : colors.well,
                  marginTop: 2,
                  marginBottom: 4,
                }}
              >
                <Ionicons
                  name={activeOpt?.icon as any ?? 'flash-outline'}
                  size={13}
                  color={isThinking ? colors.moss : colors.ink}
                />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.ink }}>
                  {activeOpt?.label ?? activeModel} ({activeOpt?.speed ?? ''})
                </Text>
                <Ionicons name="swap-horizontal" size={12} color={colors.graphite} />
              </Pressable>
            );
          })()}


          {scope && thread.length === 0 && !listening ? (
            <Text style={[type.fine, styles.scope]}>{scope}</Text>
          ) : null}

          {!configured ? (
            <View style={styles.info}>
              <Ionicons name="information-circle-outline" size={20} color={colors.graphite} />
              <Text style={[type.body, styles.infoText]}>
                No API key yet. Add EXPO_PUBLIC_GEMINI_API_KEY to .env to ask
                questions.
              </Text>
            </View>
          ) : null}

          {conversation.map(({ question: asked, result, durationMs }, index) => {
            const newest = index === conversation.length - 1;
            return (
              <View
                key={`${asked}-${index}`}
                style={[styles.turn, !newest && styles.earlier]}
                onLayout={newest ? onNewestLayout : undefined}
              >
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{asked}</Text>
                </View>

                <View style={styles.answerCard}>
                  {result.headline ? (
                    <Text style={styles.headline}>{result.headline}</Text>
                  ) : null}

                  <Text style={result.headline ? styles.answerSmall : type.answer}>
                    {result.answer}
                  </Text>

                  {/* The substance as a list: a phone screen makes a paragraph of
                      dates and amounts almost unreadable. */}
                  {result.items.length > 0 ? (
                    <View style={styles.items}>
                      {result.items.map((item, i) => {
                        const status = 'itemStatuses' in result && result.itemStatuses ? result.itemStatuses[i] : undefined;
                        const isUnverified = status && !status.verified;
                        return (
                          <View key={`${item}-${i}`} style={styles.item}>
                            <Text style={[type.gutter, styles.itemMark]}>{i + 1}</Text>
                            <View style={styles.itemContentCol}>
                              <Text style={[type.body, styles.itemText]}>{item}</Text>
                              {isUnverified ? (
                                <View style={styles.unverifiedBadge}>
                                  <Ionicons name="warning-outline" size={11} color={colors.alert} />
                                  <Text style={styles.unverifiedBadgeText}>
                                    Unverified in source{status.reason ? ` · ${status.reason}` : ''}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Island Travel Copilot: Timetable Timeline Step Card (Design 1) */}
                  {(() => {
                    const fullText = `${result.headline || ''} ${result.answer || ''} ${result.items.join(' ')}`;
                    const steps = extractTimelineFromText(fullText, result.items);
                    if (!steps) return null;
                    return (
                      <TimetableTimelineCard
                        steps={steps}
                        onSetReminder={(step) => {
                          const now = new Date();
                          const targetDate = step.date || now.toISOString().slice(0, 10);
                          void insertMemory(
                            {
                              title: `Boarding: ${step.title} (${step.time})`,
                              type: 'reminder',
                              category: 'Travel',
                              eventDate: targetDate,
                              dateExpression: null,
                              amount: null,
                              currency: null,
                              people: null,
                              location: null,
                              tags: 'travel, boat, lakport',
                              priority: 'high',
                              status: 'active',
                              repeat: null,
                              groupName: null,
                            },
                            `Travel boarding reminder: ${step.title} at ${step.time} on ${targetDate}`
                          );
                          showDialog({
                            title: 'Boarding Reminder Added ✓',
                            message: `Saved reminder for ${step.title} (${step.time}) on ${targetDate} to your tasks and calendar.`,
                          });
                        }}
                        onLogExpense={() => {
                          router.push('/expense/expense');
                        }}
                      />
                    );
                  })()}

                  {result.found ? (
                    <>
                      <View style={styles.sourceRow}>
                        <Text style={[type.fine, { color: colors.mist }]}>
                          {sourceLabel(result)}
                        </Text>
                        {durationMs !== undefined ? (
                          <View style={styles.timeBadge}>
                            <Ionicons name="flash-outline" size={10} color={colors.moss} />
                            <Text style={styles.timeBadgeText}>
                              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {result.evidence.length > 0 ? (
                        <View style={styles.evidence}>
                          <View style={styles.evidenceInner}>
                            {result.evidence.map((item) => {
                              const badge = 'badgeLabel' in item && item.badgeLabel ? item.badgeLabel : null;
                              const kind = 'sourceKind' in item ? item.sourceKind : null;
                              return (
                                <View key={item.id} style={styles.evidenceItemCard}>
                                  <View style={styles.evidenceHeaderLine}>
                                    {badge ? (
                                      <View
                                        style={[
                                          styles.sourceBadge,
                                          kind === 'image' && styles.badgeImage,
                                          kind === 'pdf' && styles.badgePdf,
                                          kind === 'video' && styles.badgeVideo,
                                          kind === 'docx' && styles.badgeDoc,
                                          kind === 'website' && styles.badgeWeb,
                                        ]}
                                      >
                                        <Text style={styles.sourceBadgeText}>{badge}</Text>
                                      </View>
                                    ) : null}
                                    <Text style={[type.body, styles.evidenceTitleText]} numberOfLines={1}>
                                      {'title' in item ? item.title : ''}
                                    </Text>
                                  </View>
                                  {'subtitle' in item && item.subtitle ? (
                                    <View style={styles.evidenceTimeRow}>
                                      <Ionicons name="time-outline" size={13} color={colors.mist} />
                                      <Text style={[type.fine, styles.evidenceTimeText]}>
                                        {item.subtitle}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={type.fine}>Nothing in your record matches this.</Text>
                  )}
                </View>
              </View>
            );
          })}

          {busy ? (
            <View style={styles.turn} onLayout={onNewestLayout}>
              {asking ? (
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>{asking}</Text>
                </View>
              ) : null}
              <View style={[styles.answerCard, styles.pending]}>
                <ActivityIndicator size="small" color={colors.moss} />
                <Text style={type.body}>
                  {plan ? 'Applying the change…' : 'Searching your record…'}
                </Text>
              </View>
            </View>
          ) : null}

          {/* An instruction that could mean several entries is asked about
              rather than guessed at. Answering it is just the next question. */}
          {clarify && !busy ? (
            <View style={styles.card} onLayout={onNewestLayout}>
              <Text style={[type.label, styles.cardLabel]}>Which one?</Text>
              <Text style={styles.cardText}>{clarify}</Text>
              <View style={styles.cardActions}>
                <PillButton label="Dismiss" onPress={() => setClarify(null)} />
              </View>
            </View>
          ) : null}

          {/* Nothing has been changed yet: this is what would be, line by line
              and before → after, so a misheard instruction is caught before it
              costs anything. */}
          {plan && !busy ? (
            <View onLayout={onNewestLayout}>
              <PlanCard plan={plan} onCancel={() => setPlan(null)} onConfirm={() => void confirmPlan()} />
            </View>
          ) : null}

          {outcome && !busy ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name="checkmark-circle" size={18} color={colors.moss} />
                <Text style={[type.label, styles.cardLabel]}>{toSentence(outcome.label)}</Text>
              </View>
              <Text style={styles.cardText}>{outcome.summary}</Text>
              <View style={styles.cardActions}>
                <PillButton label="Dismiss" onPress={() => setOutcome(null)} />
                {outcome.undo ? (
                  <PillButton label="Undo" icon="arrow-undo" primary onPress={() => void undoOutcome()} />
                ) : null}
              </View>
            </View>
          ) : null}

          {voice.error ? (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
              <Text style={[type.body, styles.noticeText]}>{voice.error}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.notice}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
              <Text style={[type.body, styles.noticeText]}>{error}</Text>
            </View>
          ) : null}

          {idle && week.length > 0 ? (
            <View style={styles.group}>
              <Text style={type.label}>This week</Text>
              <View style={styles.listCard}>
                {week.map((fact, i) => (
                  <Pressable
                    key={fact.text + fact.figure}
                    onPress={() => void ask(fact.question)}
                    disabled={!canTapToAsk}
                    style={({ pressed }) => [
                      styles.listRow,
                      i === week.length - 1 && styles.listRowLast,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityHint={`Asks: ${fact.question}`}
                  >
                    <Text style={styles.factFigure}>{fact.figure}</Text>
                    <Text style={[type.body, styles.flexText]}>{fact.text}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.mist} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {!busy && !plan && !clarify && suggestions.length > 0 ? (
            <View style={styles.group}>
              <Text style={type.label}>Try asking</Text>
              <View style={styles.chips}>
                {suggestions.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => void ask(q)}
                    disabled={!canTapToAsk}
                    style={({ pressed }) => [
                      styles.chip,
                      !canTapToAsk && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityHint={`Asks: ${q}`}
                  >
                    <Text style={styles.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {!busy && otherQuestions.length > 0 ? (
            <View style={styles.group}>
              <Text style={type.label}>Recent questions</Text>
              <View style={styles.listCard}>
                {otherQuestions.map((q, i) => (
                  <Pressable
                    key={q}
                    onPress={() => void ask(q)}
                    onLongPress={() => void forgetQuestion(q).then(loadRecent)}
                    disabled={!canTapToAsk}
                    style={({ pressed }) => [
                      styles.listRow,
                      i === otherQuestions.length - 1 && styles.listRowLast,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityHint="Asks this again. Long-press to remove it."
                  >
                    <Ionicons name="time-outline" size={18} color={colors.mist} />
                    <Text style={[type.body, styles.recentText]} numberOfLines={2}>
                      {q}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {idle ? (
            <Text style={[type.fine, styles.disclaimer]}>
              Answers come only from what you have recorded. When there is no
              entry for something, this says so instead of guessing.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.dock}>
          {listening ? (
            <View style={styles.listening}>
              <VoiceWaveform level={voice.level} />
              <View style={styles.listenRow}>
                <Text style={[type.fine, styles.live]} accessibilityLiveRegion="polite">
                  Listening · say “stop” to finish
                </Text>
                <Pressable
                  onPress={voice.cancel}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={styles.textButton}
                >
                  <Text style={[type.label, styles.cancel]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <TextInput
              value={displayQuestion}
              onChangeText={setQuestion}
              placeholder={
                listening
                  ? 'Listening…'
                  : busy
                    ? 'Type next message…'
                    : thread.length > 0
                      ? 'Follow on, or ask something new'
                      : 'Ask anything…'
              }
              placeholderTextColor={colors.mist}
              style={styles.input}
              editable={voice.stage === 'idle'}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (canSend && !busy) void ask(question);
              }}
              accessibilityLabel="Your question"
              multiline
            />
            <Pressable
              onPress={() => void voice.toggle()}
              disabled={micDisabled}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Stop and ask' : 'Ask with your voice'}
              style={({ pressed }) => [
                styles.round,
                styles.mic,
                listening && styles.micLive,
                micDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {finishing ? (
                <ActivityIndicator size="small" color={colors.moss} />
              ) : (
                <Ionicons
                  name={listening ? 'stop' : 'mic-outline'}
                  size={listening ? 18 : 21}
                  color={listening ? colors.onAccent : colors.moss}
                />
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                if (canSend && !busy) void ask(question);
              }}
              disabled={!canSend || busy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Ask"
              style={({ pressed }) => [
                styles.round,
                styles.send,
                (!canSend || busy) && styles.sendOff,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Ionicons name="arrow-up" size={22} color={canSend ? colors.onAccent : colors.mist} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardLift>

    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      paddingHorizontal: SPACE.page,
      paddingTop: 22,
      paddingBottom: 32,
      gap: 16,
    },
    scope: { marginTop: -14 },
    info: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
    },
    infoText: { flex: 1 },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: RADIUS.input,
      backgroundColor: colors.alertSoft,
    },
    noticeText: { flex: 1, color: colors.alert },

    turn: { gap: 12 },
    // Earlier exchanges stay readable but step back from the newest one.
    earlier: { opacity: 0.6 },
    bubble: {
      alignSelf: 'flex-end',
      maxWidth: '82%',
      backgroundColor: colors.mossFill,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 4,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    bubbleText: { fontFamily: FONTS.sans, fontSize: 16, lineHeight: 22, color: colors.onAccent },
    answerCard: {
      alignSelf: 'flex-start',
      width: '92%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomLeftRadius: 4,
      padding: 14,
      gap: 8,
    },
    pending: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 'auto' },
    headline: {
      fontFamily: FONTS.monoMedium,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.5,
      color: colors.ink,
    },
    answerSmall: { fontFamily: FONTS.sans, fontSize: 15, lineHeight: 22, color: colors.ink },
    items: { gap: 4 },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
    itemMark: { width: 18, color: colors.mist, marginTop: 2 },
    itemContentCol: { flex: 1, gap: 2 },
    itemText: { color: colors.ink },
    unverifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: RADIUS.input,
      backgroundColor: colors.alertSoft,
      borderWidth: 1,
      borderColor: colors.alert,
      alignSelf: 'flex-start',
    },
    unverifiedBadgeText: {
      fontFamily: FONTS.sansMedium,
      fontSize: 11,
      color: colors.alert,
    },
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    timeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.well,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
    },
    timeBadgeText: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      color: colors.mist,
    },
    evidence: {
      marginTop: 4,
      marginBottom: -4,
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    evidenceInner: { gap: 6, paddingTop: 6 },
    evidenceItemCard: {
      paddingVertical: 7,
      paddingHorizontal: 9,
      borderRadius: RADIUS.input,
      backgroundColor: colors.well,
      gap: 3,
    },
    evidenceHeaderLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    evidenceTitleText: {
      flex: 1,
      fontFamily: FONTS.sansMedium,
      fontSize: 13,
      color: colors.ink,
    },
    evidenceTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    evidenceTimeText: {
      fontSize: 12,
      color: colors.mist,
    },
    sourceBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sourceBadgeText: {
      fontFamily: FONTS.sansMedium,
      fontSize: 11,
      color: colors.graphite,
    },
    badgeImage: {
      backgroundColor: colors.mossSoft,
      borderColor: colors.moss,
    },
    badgePdf: {
      backgroundColor: '#FEF3E2',
      borderColor: '#F59E0B',
    },
    badgeVideo: {
      backgroundColor: '#F3E8FF',
      borderColor: '#9333EA',
    },
    badgeDoc: {
      backgroundColor: '#E0F2FE',
      borderColor: '#0284C7',
    },
    badgeWeb: {
      backgroundColor: '#E6FFFA',
      borderColor: '#0D9488',
    },

    card: {
      gap: 10,
      padding: 14,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardLabel: { color: colors.moss },
    cardText: { fontFamily: FONTS.sans, fontSize: 16, lineHeight: 23, color: colors.ink },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 2 },

    group: { gap: 8, marginTop: 4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 38,
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 13,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipText: { fontFamily: FONTS.sans, fontSize: 14, lineHeight: 19, color: colors.ink },
    listCard: {
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    listRowLast: { borderBottomWidth: 0 },
    factFigure: { fontFamily: FONTS.monoMedium, fontSize: 16, color: colors.ink, minWidth: 44 },
    flexText: { flex: 1 },
    recentText: { flex: 1, color: colors.ink },
    disclaimer: { maxWidth: 320 },

    dock: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
      backgroundColor: colors.paper,
    },
    listening: { gap: 6, paddingHorizontal: 4 },
    listenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    live: { color: colors.moss },
    cancel: { color: colors.graphite },
    textButton: { minHeight: 32, justifyContent: 'center' },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    input: {
      flex: 1,
      minHeight: 46,
      maxHeight: 110,
      borderRadius: 23,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontFamily: FONTS.sans,
      fontSize: 16,
      lineHeight: 21,
      color: colors.ink,
    },
    round: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mic: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    micLive: { backgroundColor: colors.mossFill, borderColor: colors.mossFill },
    send: { backgroundColor: colors.mossFill },
    sendOff: { backgroundColor: colors.well },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.6 },
  });
}
