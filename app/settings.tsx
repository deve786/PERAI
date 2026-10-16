import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeMode } from '@/expense/theme';
import { Button, Card, Chip, Divider, Field, Row, Screen, Section, T, Title } from '@/expense/ui';
import { exportCsv } from '@/expense/csv';
import { checkForOtaUpdate, updateInfo } from '@/expense/ota';
import { ASK_MODEL, hasApiKey, testAiConnection } from '@/expense/ai/client';
import { clearAiLogs, getAiLogs, subscribeAiLogs, type AiLogEntry } from '@/expense/ai/logger';
import { NavRow } from '@/components/NavRow';
import { showDialog } from '@/dialogStore';
import {
  getTitleLanguage,
  getVoiceLanguage,
  setTitleLanguage,
  setVoiceLanguage,
  TITLE_LANGUAGES,
  VOICE_LANGUAGES,
  type TitleLanguage,
  type VoiceLanguage,
} from '@/settings';
import { APP_BUILD, APP_VERSION } from '@/appVersion';

const SYMBOLS = ['₹', '$', '€', '£'];

export default function Settings() {
  const { c, mode, setMode, symbol, setSymbol, budget, setBudget } = useTheme();
  const router = useRouter();
  const [budgetText, setBudgetText] = useState(budget ? String(budget) : '');
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>(() => getAiLogs());
  const [testingAi, setTestingAi] = useState(false);
  const info = updateInfo();
  const hasKey = hasApiKey();

  /** null means the recognizer follows the phone, which is how it shipped. */
  const [voice, setVoice] = useState<VoiceLanguage | null>(null);
  const [titles, setTitles] = useState<TitleLanguage>('english');

  useEffect(() => {
    void getVoiceLanguage().then(setVoice);
    void getTitleLanguage().then(setTitles);
  }, []);

  async function chooseVoice(language: VoiceLanguage | null) {
    setVoice(language);
    await setVoiceLanguage(language);
  }

  async function chooseTitles(language: TitleLanguage) {
    setTitles(language);
    await setTitleLanguage(language);
  }

  useEffect(() => {
    return subscribeAiLogs(() => {
      setAiLogs(getAiLogs());
    });
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Title>Settings</Title>

        <Section title="Backup" />
        <Divider />
        <NavRow label="Record backup" icon="mic-outline" onPress={() => router.push('/account')} />
        <NavRow label="Expense backup" icon="cloud-upload-outline" onPress={() => router.push('/expense/account')} />

        <Section title="Monthly budget" />
        <T size={13.5} sub style={{ marginBottom: 10, lineHeight: 19 }}>
          Sets the progress bar on Expense. Leave empty for no budget.
        </T>
        <Row style={{ gap: 10, alignItems: 'flex-start' }}>
          <Field
            value={budgetText}
            onChangeText={setBudgetText}
            placeholder="0"
            keyboardType="decimal-pad"
            containerStyle={{ flex: 1, marginBottom: 0 }}
          />
          <Button
            title="Save"
            kind="ghost"
            onPress={() => {
              const n = parseFloat(budgetText);
              const clean = isNaN(n) || n < 0 ? 0 : n;
              setBudget(clean);
              showDialog({
                title: 'Saved',
                message: clean > 0 ? `Budget set to ${symbol}${clean}.` : 'Budget cleared.',
              });
            }}
          />
        </Row>

        <Section title="Currency" />
        <Row style={{ flexWrap: 'wrap' }}>
          {SYMBOLS.map((s) => (
            <Chip key={s} label={s} active={symbol === s} onPress={() => setSymbol(s)} />
          ))}
        </Row>

        <Section title="Appearance" />
        <Row>
          {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
            <Chip key={m} label={m[0].toUpperCase() + m.slice(1)} active={mode === m} onPress={() => setMode(m)} />
          ))}
        </Row>

        {/* What the recognizer listens for. Malayalam spoken into the English
            recognizer comes back in English letters, which the app reads. */}
        <Section title="Voice language" />
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip
            label="Phone's own"
            active={voice === null}
            onPress={() => void chooseVoice(null)}
          />
          {VOICE_LANGUAGES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={voice === option.value}
              onPress={() => void chooseVoice(option.value)}
            />
          ))}
        </Row>
        <T size={12.5} sub style={{ marginTop: 6 }}>
          {voice === null
            ? 'Follows your phone. Malayalam spoken to it comes back in English letters.'
            : VOICE_LANGUAGES.find((o) => o.value === voice)?.hint}
        </T>

        <Section title="Save titles in" />
        <Row style={{ flexWrap: 'wrap' }}>
          {TITLE_LANGUAGES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={titles === option.value}
              onPress={() => void chooseTitles(option.value)}
            />
          ))}
        </Row>
        <T size={12.5} sub style={{ marginTop: 6 }}>
          Your note is always kept word for word, whichever you pick. Names are
          never translated.
        </T>

        <Section title="Manage" />
        <Divider />
        <NavRow label="Categories" icon="pricetags-outline" onPress={() => router.push('/expense/categories')} />
        <NavRow label="Recurring expenses" icon="repeat-outline" onPress={() => router.push('/expense/recurring')} />
        <NavRow label="Borrow & Lend" icon="people-outline" onPress={() => router.push('/expense/borrow-lend')} />
        <NavRow label="Net Worth & Accounts" icon="wallet-outline" onPress={() => router.push('/expense/net-worth')} />
        <NavRow
          label="Export as CSV"
          icon="download-outline"
          onPress={async () => {
            try {
              const n = await exportCsv();
              if (n === 0) showDialog({ title: 'Nothing to export', message: 'Add some expenses first.' });
            } catch (e) {
              showDialog({ title: 'Export failed', message: String(e instanceof Error ? e.message : e) });
            }
          }}
        />
        <NavRow label="Activity log" icon="pulse-outline" onPress={() => router.push('/logs')} />

        <Section title="Updates" />
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Version</T>
          <T size={13.5} tabular>{APP_VERSION}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Build</T>
          <T size={13.5} tabular>{APP_BUILD}</T>
        </Row>
        {info.channel && info.channel !== 'n/a' ? (
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <T size={13.5} sub>Channel</T>
            <T size={13.5}>{info.channel}</T>
          </Row>
        ) : null}
        <NavRow label="What's New" icon="sparkles-outline" onPress={() => router.push('/expense/whats-new')} />
        <Button
          title="Check for updates"
          kind="ghost"
          icon="cloud-download-outline"
          onPress={() => checkForOtaUpdate()}
          style={{ marginTop: 14 }}
        />

        <Section title="AI Diagnostics & Logs" />
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Gemini API</T>
          <Row style={{ gap: 6, alignItems: 'center' }}>
            <Ionicons
              name={hasKey ? 'checkmark-circle' : 'alert-circle'}
              size={15}
              color={hasKey ? c.good : c.danger}
            />
            <T size={13.5} weight="600" style={{ color: hasKey ? c.good : c.danger }}>
              {hasKey ? 'Key Configured' : 'Missing API Key'}
            </T>
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Model</T>
          <T size={13.5} tabular>{ASK_MODEL}</T>
        </Row>
        <Row style={{ gap: 10, marginTop: 10 }}>
          <Button
            title={testingAi ? 'Testing...' : 'Test AI connection'}
            kind="ghost"
            icon="sparkles-outline"
            disabled={testingAi}
            onPress={async () => {
              setTestingAi(true);
              try {
                const res = await testAiConnection();
                showDialog({ title: res.ok ? 'AI Connected' : 'AI Test Failed', message: res.message });
              } catch (e) {
                showDialog({ title: 'AI Test Failed', message: String(e instanceof Error ? e.message : e) });
              } finally {
                setTestingAi(false);
              }
            }}
            style={{ flex: 1 }}
          />
          {aiLogs.length > 0 && (
            <Button
              title="Clear logs"
              kind="ghost"
              icon="trash-outline"
              onPress={() => clearAiLogs()}
            />
          )}
        </Row>

        <View style={{ marginTop: 12 }}>
          {aiLogs.length === 0 ? (
            <Card style={{ paddingVertical: 12 }}>
              <T size={13} sub style={{ textAlign: 'center' }}>
                No AI activity logged yet. Type an expense title to trigger auto-categorization.
              </T>
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {aiLogs.slice(0, 10).map((log) => {
                const isErr = log.status === 'error';
                return (
                  <Card
                    key={log.id}
                    style={{
                      padding: 12,
                      borderColor: isErr ? c.danger : c.line,
                      backgroundColor: isErr ? (mode === 'dark' ? '#2A1313' : '#FDF2F2') : c.card,
                    }}
                  >
                    <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <Row style={{ gap: 6, alignItems: 'center' }}>
                        <Ionicons
                          name={isErr ? 'close-circle' : 'checkmark-circle'}
                          size={15}
                          color={isErr ? c.danger : c.good}
                        />
                        <T size={13} weight="600" style={{ color: isErr ? c.danger : c.good }}>
                          {isErr ? 'Error / Failed' : 'Suggested'}
                        </T>
                      </Row>
                      <T size={12} faint tabular>{log.timestamp}</T>
                    </Row>
                    {log.title && (
                      <T size={13} weight="500" style={{ marginBottom: 2 }}>
                        Query: &quot;{log.title}&quot;
                      </T>
                    )}
                    {log.result && (
                      <T size={13} weight="600" style={{ color: c.good }}>
                        Category: {log.result}
                      </T>
                    )}
                    {log.error && (
                      <T size={12.5} style={{ color: c.danger, lineHeight: 17 }}>
                        Issue: {log.error}
                      </T>
                    )}
                  </Card>
                );
              })}
            </View>
          )}
        </View>

        <T size={12.5} faint style={{ marginTop: 28, textAlign: 'center', lineHeight: 18 }}>
          One app, two records — your memories and your expenses each keep their own backup.
        </T>
        <View style={{ height: 8, backgroundColor: c.bg }} />
      </ScrollView>
    </Screen>
  );
}
