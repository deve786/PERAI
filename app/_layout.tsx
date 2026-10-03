import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { UpdateBanner } from '@/components/UpdateBanner';
import { initDatabase } from '@/db/client';
import { getSetting } from '@/db/queries';
import { startOverdueSweep } from '@/overdue';
import { startReminderSync } from '@/reminders';
import { SPEECH_LANGUAGE_KEY, setSpeechLanguage } from '@/speechSession';
import { ThemeProvider, useTheme } from '@/ThemeContext';
import { COLORS, SPACE, TYPE } from '@/theme';
import { useAutoUpdate } from '@/useAutoUpdate';
import { startWidgetSync } from '@/widget/widgetSync';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useAutoUpdate();

  // Once the database is open, keep scheduled reminders in step with it.
  useEffect(() => (dbReady ? startReminderSync() : undefined), [dbReady]);
  // Anything whose time has gone by is recorded as done, not just drawn struck.
  useEffect(() => (dbReady ? startOverdueSweep() : undefined), [dbReady]);
  useEffect(() => (dbReady ? startWidgetSync() : undefined), [dbReady]);

  // The recognizer follows the phone's own English unless a language was saved.
  useEffect(() => {
    if (dbReady) void getSetting(SPEECH_LANGUAGE_KEY).then(setSpeechLanguage);
  }, [dbReady]);

  const [fontsReady] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  // Deferred to an effect rather than module scope: opening SQLite blocks the
  // JS thread, and doing that during module evaluation deadlocks the wasm
  // worker on web. By the time this runs the thread is idle.
  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) =>
        setDbError(err instanceof Error ? err.message : String(err))
      );
  }, []);

  // The gate screens below run before the database (and so the saved theme
  // preference) can be trusted, and only for well under a second — they use
  // the static light tokens rather than waiting on ThemeProvider.
  if (dbError) {
    return (
      <View style={styles.gate}>
        <Text style={[TYPE.label, { color: COLORS.alert }]}>NO RECORD</Text>
        <Text style={[TYPE.body, styles.gateText]}>
          The database could not be opened. {dbError}
        </Text>
      </View>
    );
  }

  // Hold the blank ground rather than flashing a spinner: both the fonts and
  // the database resolve in well under a second.
  if (!dbReady || !fontsReady) return <View style={styles.gate} />;

  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}

/** Split out so it can call `useTheme()` — only valid inside ThemeProvider. */
function ThemedApp() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="preview" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
      </Stack>
      <UpdateBanner />
    </>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: SPACE.page,
    backgroundColor: COLORS.paper,
  },
  gateText: { textAlign: 'center', maxWidth: 280 },
});
