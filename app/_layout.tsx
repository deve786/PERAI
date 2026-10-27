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
import { ShareIntentProvider } from 'expo-share-intent';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { UpdateBanner } from '@/components/UpdateBanner';
import { initDatabase } from '@/db/client';
import { getSetting } from '@/db/queries';
import { initSourcesDb } from '@/sources/client';
import { startOverdueSweep } from '@/overdue';
import { startReminderSync } from '@/reminders';
import { applySavedVoiceLanguage } from '@/settings';
import { DialogHost } from '@/components/DialogHost';
import { ShareProcessingOverlay } from '@/components/ShareProcessingOverlay';
import { ThemeProvider, useTheme } from '@/ThemeContext';
import { ThemeProvider as ExpenseThemeProvider } from '@/expense/theme';
import { COLORS, SPACE, TYPE } from '@/theme';
import { useAutoUpdate } from '@/useAutoUpdate';
import { useNotificationActions } from '@/useNotificationActions';
import { useShareIntentCapture } from '@/useShareIntentCapture';
import { startWidgetSync } from '@/widget/widgetSync';
import { useSync as useExpenseSync } from '@/expense/sync/useSync';
import { startTelegramAutoSync } from '@/sources/telegramAutoSync';

/**
 * Without this, an error while rendering any screen unmounts the whole app
 * and leaves nothing but Android's bare window behind — a blank screen with
 * no clue why. Uses the static tokens, since the theme may be what failed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.gate}>
      <Text style={[TYPE.label, { color: COLORS.alert }]}>SOMETHING BROKE</Text>
      <Text style={[TYPE.body, styles.gateText]}>{error.message}</Text>
      <Pressable onPress={() => void retry()} hitSlop={12}>
        <Text style={TYPE.label}>TRY AGAIN</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useAutoUpdate();
  // Done and Tomorrow on a reminder, and the weekly review notification.
  useNotificationActions(dbReady);

  // Once the database is open, keep scheduled reminders in step with it.
  useEffect(() => (dbReady ? startReminderSync() : undefined), [dbReady]);
  // Anything whose time has gone by is recorded as done, not just drawn struck.
  useEffect(() => (dbReady ? startOverdueSweep() : undefined), [dbReady]);
  useEffect(() => (dbReady ? startWidgetSync() : undefined), [dbReady]);
  useEffect(() => (dbReady ? startTelegramAutoSync() : undefined), [dbReady]);

  // The recognizer follows the phone's own English unless a language was saved.
  useEffect(() => {
    if (dbReady) void applySavedVoiceLanguage();
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
  const openDb = useCallback(() => {
    setDbError(null);
    let attempts = 0;
    const tryInit = () => {
      Promise.all([initDatabase(), initSourcesDb()])
        .then(() => setDbReady(true))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          // On web, if another tab or recent reload is still holding the OPFS lock, auto-retry up to 3 times
          if (Platform.OS === 'web' && (msg.includes('createSyncAccessHandle') || msg.includes('NoModificationAllowedError')) && attempts < 3) {
            attempts++;
            setTimeout(tryInit, attempts * 600);
            return;
          }
          setDbError(msg);
        });
    };
    tryInit();
  }, []);

  useEffect(() => {
    openDb();
  }, [openDb]);

  // The gate screens below run before the database (and so the saved theme
  // preference) can be trusted, and only for well under a second — they use
  // the static light tokens rather than waiting on ThemeProvider.
  let content;
  if (dbError) {
    const isLockError = dbError.includes('createSyncAccessHandle') || dbError.includes('NoModificationAllowedError');
    content = (
      <View style={styles.gate}>
        <Text style={[TYPE.label, { color: COLORS.alert }]}>
          {isLockError ? 'DATABASE LOCKED' : 'NO RECORD'}
        </Text>
        <Text style={[TYPE.body, styles.gateText]}>
          {isLockError
            ? 'Another browser tab or window has the database open. Please close other open PERAI tabs and click Retry.'
            : `The database could not be opened. ${dbError}`}
        </Text>
        <Pressable
          onPress={openDb}
          style={({ pressed }) => ({
            marginTop: 18,
            paddingVertical: 10,
            paddingHorizontal: 22,
            backgroundColor: COLORS.moss,
            borderRadius: 12,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: COLORS.onAccent, fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 15 }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  } else if (!dbReady || !fontsReady) {
    // Hold the blank ground rather than flashing a spinner: both the fonts
    // and the database resolve in well under a second.
    content = <View style={styles.gate} />;
  } else {
    content = (
      <ThemeProvider>
        <ExpenseThemeProvider>
          <ThemedApp />
        </ExpenseThemeProvider>
      </ThemeProvider>
    );
  }

  // Mounted this high, and above every gate, so a share that arrives before
  // the database opens is still held by the native side and not missed —
  // see useShareIntentCapture, which does the actual filing once ThemedApp
  // (and so the database) is up.
  return <ShareIntentProvider>{content}</ShareIntentProvider>;
}

/** Split out so it can call `useTheme()` — only valid inside ThemeProvider. */
function ThemedApp() {
  const { colors, scheme } = useTheme();
  useExpenseSync();
  useShareIntentCapture();

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
        <Stack.Screen name="today" />
        <Stack.Screen name="lists" />
        <Stack.Screen name="timeline" />
        <Stack.Screen name="expense-history" />
        <Stack.Screen name="expense-analytics" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="preview" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="logs" options={{ presentation: 'modal' }} />
        <Stack.Screen name="review" options={{ presentation: 'modal' }} />
        <Stack.Screen name="entry/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/expense" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/income" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/recurring" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/categories" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/whats-new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="data-sources" options={{ presentation: 'modal' }} />
      </Stack>
      <UpdateBanner />
      {/* The app's own popups, so a question about your record looks like the
          record rather than like Android. */}
      <DialogHost />
      <ShareProcessingOverlay />
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
