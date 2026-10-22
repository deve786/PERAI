import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { clearLogs, recentLogs, type LogEntry } from '@/log';
import { shortDate, timeLabel } from '@/format';
import { FONTS, useTheme } from '@/expense/theme';
import { Empty, ListCard, PillButton, Screen, T, TopBar } from '@/expense/ui';

/**
 * What the app has been doing lately.
 *
 * Only what a person would want to read — a note saved, a backup, a name
 * corrected, and anything that failed with its reason. It exists because a
 * failure is often invisible otherwise: a search refused in the background
 * leaves no trace on any screen except a title that stayed as you said it.
 */
export default function LogsScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const [entries, setEntries] = useState<LogEntry[]>([]);

  const load = useCallback(async () => setEntries(await recentLogs()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const failures = entries.filter((entry) => entry.level === 'fail').length;

  return (
    <Screen>
      <TopBar
        title="Activity"
        onBack={() => router.back()}
        right={
          entries.length > 0 ? (
            <PillButton label="Clear" icon="trash-outline" onPress={() => void clearLogs().then(load)} />
          ) : undefined
        }
      />
      {entries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Empty
            icon="pulse-outline"
            title="Nothing here yet"
            hint="Saves, backups and name checks show up here, newest first — handy when something didn't go through."
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <T size={14} sub style={{ marginBottom: 10, lineHeight: 20 }}>
            {failures === 0
              ? 'The last few things the app did. Nothing has failed.'
              : `The last few things the app did, including ${failures} that failed.`}
          </T>
          <ListCard>
            {entries.map((entry, i) => {
              const failed = entry.level === 'fail';
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.row,
                    {
                      borderBottomWidth: i === entries.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: c.line,
                    },
                  ]}
                >
                  <Ionicons
                    name={failed ? 'alert-circle' : 'checkmark-circle-outline'}
                    size={20}
                    color={failed ? c.danger : c.sub}
                    style={{ marginTop: 1 }}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size={15} style={failed ? { color: c.danger } : undefined}>{entry.event}</T>
                    {entry.detail ? (
                      <Text selectable style={[styles.detail, { color: c.sub }]}>
                        {entry.detail}
                      </Text>
                    ) : null}
                    <T size={12} sub tabular>
                      {shortDate(entry.at)} · {timeLabel(entry.at)}
                    </T>
                  </View>
                </View>
              );
            })}
          </ListCard>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 16, paddingBottom: 40 },
  emptyWrap: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  detail: { fontFamily: FONTS.sans, fontSize: 13, lineHeight: 18 },
});
