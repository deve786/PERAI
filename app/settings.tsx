import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeMode } from '@/expense/theme';
import { Button, Card, Field, ListCard, ListRow, Row, Screen, Segmented, T, TopBar } from '@/expense/ui';
import { exportCsv } from '@/expense/csv';
import { fmtMoney } from '@/expense/stats';
import { checkForOtaUpdate, updateInfo } from '@/expense/ota';
import { ASK_MODEL, hasApiKey, testAiConnection } from '@/expense/ai/client';
import { clearAiLogs, getAiLogs, subscribeAiLogs, type AiLogEntry } from '@/expense/ai/logger';
import { isConfigured as recordBackupConfigured } from '@/sync/client';
import { isConfigured as expenseBackupConfigured } from '@/expense/sync/client';
import { showDialog } from '@/dialogStore';
import {
  getTitleLanguage,
  getVoiceLanguage,
  setTitleLanguage,
  setVoiceLanguage,
  TITLE_LANGUAGES,
  VOICE_LANGUAGES,
  AI_MODELS,
  getSelectedAiModel,
  setSelectedAiModel,
  type TitleLanguage,
  type VoiceLanguage,
  type AiModelChoice,
} from '@/settings';
import { setSelectedModelInMemory, EXTRACT_MODEL } from '@/ai/client';
import { APP_BUILD, APP_VERSION } from '@/appVersion';
import { KeyboardLift } from '@/components/KeyboardLift';

const SYMBOLS = ['₹', '$', '€', '£'] as const;
const SYMBOL_OPTIONS = SYMBOLS.map((s) => ({ key: s, label: s }));

const MODES: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const TITLE_OPTIONS = TITLE_LANGUAGES.map((o) => ({ key: o.value, label: o.label }));

/** Grey sentence-case heading above a settings card. */
function GroupLabel({ children }: { children: string }) {
  return (
    <T size={14} weight="600" sub style={{ marginTop: 20, marginBottom: 6 }}>
      {children}
    </T>
  );
}

export default function Settings() {
  const { c, mode, setMode, symbol, setSymbol, budget, setBudget } = useTheme();
  const router = useRouter();
  const [budgetText, setBudgetText] = useState(budget ? String(budget) : '');
  const [editingBudget, setEditingBudget] = useState(false);
  const [choosingVoice, setChoosingVoice] = useState(false);
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>(() => getAiLogs());
  const [testingAi, setTestingAi] = useState(false);
  const info = updateInfo();
  const hasKey = hasApiKey();

  /** null means the recognizer follows the phone, which is how it shipped. */
  const [voice, setVoice] = useState<VoiceLanguage | null>(null);
  const [titles, setTitles] = useState<TitleLanguage>('english');
  const [selectedAskModel, setSelectedAskModel] = useState<AiModelChoice>('gemini-3.5-flash-lite');
  const [choosingModel, setChoosingModel] = useState(false);

  useEffect(() => {
    void getVoiceLanguage().then(setVoice);
    void getTitleLanguage().then(setTitles);
    void getSelectedAiModel().then((m) => {
      setSelectedAskModel(m);
      setSelectedModelInMemory(m);
    });
  }, []);

  async function chooseVoice(language: VoiceLanguage | null) {
    setVoice(language);
    await setVoiceLanguage(language);
  }

  async function chooseTitles(language: TitleLanguage) {
    setTitles(language);
    await setTitleLanguage(language);
  }

  async function chooseAskModel(model: AiModelChoice) {
    setSelectedAskModel(model);
    setSelectedModelInMemory(model);
    await setSelectedAiModel(model);
    showDialog({
      title: 'AI Model Updated',
      message: `Ask model set to ${model === 'gemini-3.8-flash' ? 'Gemini 3.8 Flash' : 'Gemini 3.5 Flash Lite'}.`,
    });
  }

  useEffect(() => {
    return subscribeAiLogs(() => {
      setAiLogs(getAiLogs());
    });
  }, []);

  function saveBudget() {
    const n = parseFloat(budgetText);
    const clean = isNaN(n) || n < 0 ? 0 : n;
    setBudget(clean);
    setEditingBudget(false);
    showDialog({
      title: 'Saved',
      message: clean > 0 ? `Budget set to ${symbol}${clean}.` : 'Budget cleared.',
    });
  }

  async function exportExpenses() {
    try {
      const n = await exportCsv();
      if (n === 0) showDialog({ title: 'Nothing to export', message: 'Add some expenses first.' });
    } catch (e) {
      showDialog({ title: 'Export failed', message: String(e instanceof Error ? e.message : e) });
    }
  }

  async function testAi() {
    setTestingAi(true);
    try {
      const res = await testAiConnection();
      showDialog({ title: res.ok ? 'AI connected' : 'AI test failed', message: res.message });
    } catch (e) {
      showDialog({ title: 'AI test failed', message: String(e instanceof Error ? e.message : e) });
    } finally {
      setTestingAi(false);
    }
  }

  const voiceLabel =
    voice === null ? "Phone's own" : VOICE_LANGUAGES.find((o) => o.value === voice)?.label ?? voice;
  const chevron = (open: boolean) => (
    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />
  );

  return (
    <Screen>
      <TopBar title="Settings" onBack={() => router.back()} />
      <KeyboardLift style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <GroupLabel>Money</GroupLabel>
          <ListCard>
            <ListRow
              label="Monthly budget"
              value={budget > 0 ? fmtMoney(budget, symbol) : 'Not set'}
              onPress={() => setEditingBudget((v) => !v)}
              chevron={false}
              right={chevron(editingBudget)}
            />
            {editingBudget ? (
              <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <T size={13} sub style={{ marginBottom: 10, lineHeight: 18 }}>
                  Sets the progress bar on Money. Leave empty for no budget.
                </T>
                <Row style={{ gap: 10, alignItems: 'flex-start' }}>
                  <Field
                    value={budgetText}
                    onChangeText={setBudgetText}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    autoFocus
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                  />
                  <Button title="Save" onPress={saveBudget} />
                </Row>
              </View>
            ) : null}
            <ListRow
              label="Currency"
              last
              right={
                <Segmented
                  options={SYMBOL_OPTIONS}
                  value={(SYMBOLS as readonly string[]).includes(symbol) ? (symbol as (typeof SYMBOLS)[number]) : '₹'}
                  onChange={(s) => setSymbol(s)}
                  style={{ width: 168 }}
                />
              }
            />
          </ListCard>

          <GroupLabel>Appearance</GroupLabel>
          <Card style={{ padding: 10 }}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
          </Card>

          <GroupLabel>Voice</GroupLabel>
          <ListCard>
            {/* What the recognizer listens for. Malayalam spoken into the English
                recognizer comes back in English letters, which the app reads. */}
            <ListRow
              label="Language you speak"
              value={voiceLabel}
              onPress={() => setChoosingVoice((v) => !v)}
              chevron={false}
              right={chevron(choosingVoice)}
            />
            {choosingVoice ? (
              <View style={{ paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
                {[{ value: null, label: "Phone's own" }, ...VOICE_LANGUAGES].map((option) => {
                  const on = voice === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      onPress={() => void chooseVoice(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({
                        minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingLeft: 4, opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Ionicons
                        name={on ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={on ? c.accent : c.faint}
                      />
                      <T size={15} weight={on ? '600' : '400'}>{option.label}</T>
                    </Pressable>
                  );
                })}
                <T size={13} sub style={{ marginTop: 4, lineHeight: 18 }}>
                  {voice === null
                    ? 'Follows your phone. Malayalam spoken to it comes back in English letters.'
                    : VOICE_LANGUAGES.find((o) => o.value === voice)?.hint}
                </T>
              </View>
            ) : null}
            <ListRow
              label="Save titles in"
              last
              right={
                <Segmented
                  options={TITLE_OPTIONS}
                  value={titles}
                  onChange={(v) => void chooseTitles(v)}
                  style={{ width: 196 }}
                />
              }
            />
          </ListCard>
          <T size={13} sub style={{ marginTop: 6, lineHeight: 18 }}>
            Your note is always kept word for word, whichever you pick. Names are never translated.
          </T>

          <GroupLabel>Manage</GroupLabel>
          <ListCard>
            <ListRow icon="pricetags-outline" label="Categories" onPress={() => router.push('/expense/categories')} />
            <ListRow icon="repeat-outline" label="Recurring expenses" onPress={() => router.push('/expense/recurring')} />
            <ListRow icon="people-outline" label="Borrow & Lend" onPress={() => router.push('/expense/borrow-lend')} />
            <ListRow
              icon="wallet-outline"
              label="Net Worth & Accounts"
              onPress={() => router.push('/expense/net-worth')}
              last
            />
          </ListCard>

          <GroupLabel>Data</GroupLabel>
          <ListCard>
            <ListRow
              icon="mic-outline"
              label="Record backup"
              value={recordBackupConfigured() ? undefined : 'This phone only'}
              onPress={() => router.push('/account')}
            />
            <ListRow
              icon="cloud-upload-outline"
              label="Expense backup"
              value={expenseBackupConfigured() ? undefined : 'This phone only'}
              onPress={() => router.push('/expense/account')}
            />
            <ListRow
              icon="download-outline"
              label="Export expenses (CSV)"
              onPress={() => void exportExpenses()}
              last
            />
          </ListCard>

          <GroupLabel>Updates</GroupLabel>
          <ListCard>
            {info.channel && info.channel !== 'n/a' ? (
              <ListRow label="Channel" value={info.channel} />
            ) : null}
            <ListRow
              icon="cloud-download-outline"
              label="Check for updates"
              onPress={() => void checkForOtaUpdate()}
              last
            />
          </ListCard>

          <GroupLabel>AI diagnostics & logs</GroupLabel>
          <ListCard>
            <ListRow
              label="Gemini API"
              right={
                <Row style={{ gap: 6 }}>
                  <Ionicons
                    name={hasKey ? 'checkmark-circle' : 'alert-circle'}
                    size={16}
                    color={hasKey ? c.good : c.danger}
                  />
                  <T size={15} weight="600" style={{ color: hasKey ? c.good : c.danger }}>
                    {hasKey ? 'Key configured' : 'Missing API key'}
                  </T>
                </Row>
              }
            />
            <ListRow
              label="Ask Model"
              value={selectedAskModel === 'gemini-3.8-flash' ? '3.8 Flash (Deep)' : '3.5 Flash Lite (Fast)'}
              onPress={() => setChoosingModel((v) => !v)}
              chevron={false}
              right={chevron(choosingModel)}
            />
            {choosingModel ? (
              <View style={{ paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
                {AI_MODELS.map((opt) => {
                  const on = selectedAskModel === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => void chooseAskModel(opt.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 4,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 12,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Ionicons
                        name={on ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={on ? c.accent : c.faint}
                        style={{ marginTop: 2 }}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <T size={15} weight={on ? '700' : '500'} style={{ color: on ? c.accent : c.text }}>
                            {opt.label}
                          </T>
                          <T size={12} weight="600" style={{ color: on ? c.good : c.sub }}>
                            {opt.speed}
                          </T>
                        </Row>
                        <T size={13} sub style={{ lineHeight: 18 }}>{opt.desc}</T>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <ListRow
              label="Extract Model"
              right={<T size={14} sub tabular>{EXTRACT_MODEL}</T>}
            />
            <ListRow
              icon="sparkles-outline"
              label={testingAi ? 'Testing…' : 'Test AI connection'}
              onPress={testingAi ? undefined : () => void testAi()}
            />
            {aiLogs.length > 0 ? (
              <ListRow icon="trash-outline" label="Clear AI logs" onPress={() => clearAiLogs()} chevron={false} />
            ) : null}
            <ListRow icon="pulse-outline" label="Activity log" onPress={() => router.push('/logs')} last />
          </ListCard>

          <View style={{ marginTop: 10 }}>
            {aiLogs.length === 0 ? (
              <T size={13} sub style={{ lineHeight: 18 }}>
                No AI activity logged yet. Type an expense title to trigger auto-categorisation.
              </T>
            ) : (
              <View style={{ gap: 8 }}>
                {aiLogs.slice(0, 10).map((log) => {
                  const isErr = log.status === 'error';
                  return (
                    <Card
                      key={log.id}
                      style={{
                        padding: 12,
                        gap: 2,
                        borderColor: isErr ? c.danger : c.line,
                        backgroundColor: isErr ? `${c.danger}14` : c.card,
                      }}
                    >
                      <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                        <Row style={{ gap: 6 }}>
                          <Ionicons
                            name={isErr ? 'close-circle' : 'checkmark-circle'}
                            size={16}
                            color={isErr ? c.danger : c.good}
                          />
                          <T size={14} weight="600" style={{ color: isErr ? c.danger : c.good }}>
                            {isErr ? 'Failed' : 'Suggested'}
                          </T>
                        </Row>
                        <T size={12} sub tabular>{log.timestamp}</T>
                      </Row>
                      {log.title ? <T size={14}>Query: &quot;{log.title}&quot;</T> : null}
                      {log.result ? (
                        <T size={14} weight="600" style={{ color: c.good }}>Category: {log.result}</T>
                      ) : null}
                      {log.error ? (
                        <T size={13} style={{ color: c.danger, lineHeight: 18 }}>Issue: {log.error}</T>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>

          <GroupLabel>About</GroupLabel>
          <ListCard>
            <ListRow label="Version" right={<T size={15} sub tabular>{APP_VERSION} · build {APP_BUILD}</T>} />
            <ListRow label="What's new" onPress={() => router.push('/expense/whats-new')} last />
          </ListCard>

          <T size={13} sub style={{ marginTop: 24, textAlign: 'center', lineHeight: 18 }}>
            One app, two records — your notes and your expenses each keep their own backup.
          </T>
        </ScrollView>
      </KeyboardLift>
    </Screen>
  );
}
