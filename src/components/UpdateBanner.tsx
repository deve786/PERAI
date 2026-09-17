import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACE, TYPE } from '../theme';

/**
 * Appears once a new version has finished downloading, so an update can be
 * applied with one tap instead of closing and reopening the app.
 *
 * It asks rather than reloading by itself: a reload in the middle of a voice
 * note would throw that note away. If it is ignored, useAutoUpdate still
 * applies the update the next time the app comes back from the background.
 */
export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  const [restarting, setRestarting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (__DEV__ || !Updates.isEnabled || !isUpdatePending || dismissed) return null;

  async function restart() {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      // Reload refused (rare). Leave the bar so it can be tried again.
      setRestarting(false);
    }
  }

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Text style={[TYPE.label, styles.text]}>NEW VERSION READY</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10} disabled={restarting}>
          <Text style={[TYPE.label, styles.later]}>LATER</Text>
        </Pressable>
        <Pressable
          onPress={() => void restart()}
          hitSlop={10}
          disabled={restarting}
          style={styles.restart}
          accessibilityLabel="Restart to use the new version"
        >
          {restarting ? (
            <ActivityIndicator size="small" color={COLORS.moss} />
          ) : (
            <Text style={[TYPE.label, styles.restartText]}>RESTART</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.page,
    paddingBottom: 10,
    backgroundColor: COLORS.moss,
  },
  text: { color: COLORS.paper },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  later: { color: COLORS.mossSoft, opacity: 0.8 },
  restart: {
    minWidth: 76,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: COLORS.paper,
  },
  restartText: { color: COLORS.moss },
});
