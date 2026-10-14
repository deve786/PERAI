import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeMode } from '@/expense/theme';
import { Button, Card, Chip, Divider, Field, Row, Screen, Section, T, Title } from '@/expense/ui';
import { exportCsv } from '@/expense/csv';
import { checkForOtaUpdate, updateInfo } from '@/expense/ota';
import { ASK_MODEL, hasApiKey, testAiConnection } from '@/expense/ai/client';
import { clearAiLogs, getAiLogs, subscribeAiLogs, type AiLogEntry } from '@/expense/ai/logger';
import { useAppMode } from '@/AppModeContext';

const SYMBOLS = ['₹', '$', '€', '£'];

function NavRow({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15,
        borderBottomWidth: 1, borderBottomColor: c.line, opacity: pressed ? 0.55 : 1,
      })}
    >
      <Ionicons name={icon} size={19} color={c.sub} />
      <T size={15} style={{ flex: 1 }}>{label}</T>
      <Ionicons name="chevron-forward" size={17} color={c.faint} />
    </Pressable>
  );
}

export default function Settings() {
  const { c, mode, setMode, symbol, setSymbol, budget, setBudget } = useTheme();
  const { setMode: setAppMode } = useAppMode();
  const router = useRouter();
  const [budgetText, setBudgetText] = useState(budget ? String(budget) : '');
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>(() => getAiLogs());
  const [testingAi, setTestingAi] = useState(false);
  const info = updateInfo();
  const hasKey = hasApiKey();

  useEffect(() => {
    return subscribeAiLogs(() => {
      setAiLogs(getAiLogs());
    });
  }, []);


  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Title>Settings</Title>

        <NavRow
          label="Switch to PERAI"
          icon="mic-outline"
          onPress={() => {
            setAppMode('perai');
            router.replace('/');
          }}
        />

        <Section title="Monthly budget" />
        <T size={13.5} sub style={{ marginBottom: 10, lineHeight: 19 }}>
          Sets the progress bar on Home. Leave empty for no budget.
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
              Alert.alert('Saved', clean > 0 ? `Budget set to ${symbol}${clean}.` : 'Budget cleared.');
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

        <Section title="Manage" />
        <Divider />
        <NavRow label="Backup" icon="cloud-upload-outline" onPress={() => router.push('/expense/account')} />
        <NavRow label="Categories" icon="pricetags-outline" onPress={() => router.push('/expense/categories')} />
        <NavRow label="Recurring expenses" icon="repeat-outline" onPress={() => router.push('/expense/recurring')} />
        <NavRow
          label="Export as CSV"
          icon="download-outline"
          onPress={async () => {
            try {
              const n = await exportCsv();
              if (n === 0) Alert.alert('Nothing to export', 'Add some expenses first.');
            } catch (e) {
              Alert.alert('Export failed', String(e instanceof Error ? e.message : e));
            }
          }}
        />

        <Section title="Updates" />
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Version</T>
          <T size={13.5} tabular>{info.runtimeVersion}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Channel</T>
          <T size={13.5}>{info.channel}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>Build</T>
          <T size={13.5} tabular>{String(info.updateId).slice(0, 8)}</T>
        </Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T size={13.5} sub>OTA update</T>
          <T size={13.5} tabular>#{info.otaBuild}</T>
        </Row>
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
                Alert.alert(res.ok ? 'AI Connected' : 'AI Test Failed', res.message);
              } catch (e) {
                Alert.alert('AI Test Failed', String(e instanceof Error ? e.message : e));
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
          Spendly keeps every expense on this device.{'\n'}Turn on Backup to also keep a copy in your account.
        </T>
        <View style={{ height: 8, backgroundColor: c.bg }} />
      </ScrollView>
    </Screen>
  );
}
