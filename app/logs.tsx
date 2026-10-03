import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { clearLogs, recentLogs, type LogEntry } from '@/log';
import { shortDate, timeLabel } from '@/format';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';

/**
 * What the app has been doing lately.
 *
 * Only what a person would want to read — a note saved, a backup, a name
 * corrected, and anything that failed with its reason. It exists because a
 * failure is often invisible otherwise: a search refused in the background
 * leaves no trace on any screen except a title that stayed as you said it.
 */
export default function LogsScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const [entries, setEntries] = useState<LogEntry[]>([]);

  const load = useCallback(async () => setEntries(await recentLogs()), []);
  useEffect(() => {
    void load();
  }, [load]);

  const failures = entries.filter((entry) => entry.level === 'fail').length;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>Activity</Text>
      <Text style={[type.fine, styles.lead]}>
        {entries.length === 0
          ? 'Nothing recorded yet. Saves, backups and name checks show up here.'
          : failures === 0
            ? 'The last few things the app did. Nothing has failed.'
            : `The last few things the app did, including ${failures} that failed.`}
      </Text>

      {entries.map((entry) => (
        <View key={entry.id} style={styles.row}>
          <Text style={[type.stamp, styles.when]}>
            {shortDate(entry.at).toUpperCase()} {timeLabel(entry.at)}
          </Text>
          <Text style={[type.body, entry.level === 'fail' && styles.failed]}>{entry.event}</Text>
          {entry.detail ? (
            <Text style={[type.fine, styles.detail]} selectable>
              {entry.detail}
            </Text>
          ) : null}
        </View>
      ))}

      <View style={styles.actions}>
        {entries.length > 0 ? (
          <Pressable onPress={() => void clearLogs().then(load)} hitSlop={8}>
            <Text style={[type.label, styles.clear]}>CLEAR</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[type.label, styles.close]}>CLOSE</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48, gap: 14 },
    lead: { maxWidth: 340, marginTop: -8, marginBottom: 4 },
    row: {
      gap: 3,
      borderLeftWidth: 2,
      borderLeftColor: colors.rule,
      paddingLeft: 12,
      paddingVertical: 2,
    },
    when: { color: colors.mist },
    failed: { color: colors.alert },
    detail: { color: colors.graphite },
    actions: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16 },
    clear: { color: colors.mist },
    close: { color: colors.moss },
  });
}
