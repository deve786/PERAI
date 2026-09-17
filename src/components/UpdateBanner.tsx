import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { SPACE, type Colors, type TypeScale } from '../theme';

/**
 * Appears once a new version has finished downloading, so an update can be
 * applied with one tap instead of closing and reopening the app.
 *
 * It asks rather than reloading by itself: a reload in the middle of a voice
 * note would throw that note away. If it is ignored, useAutoUpdate still
 * applies the update the next time the app comes back from the background.
 */
export function UpdateBanner() {
  const { colors, type } = useTheme();
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

  const styles = makeStyles(colors, type);

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]} accessibilityRole="alert">
      <Text style={[type.label, styles.text]}>NEW VERSION READY</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10} disabled={restarting}>
          <Text style={[type.label, styles.later]}>LATER</Text>
        </Pressable>
        <Pressable
          onPress={() => void restart()}
          hitSlop={10}
          disabled={restarting}
          style={styles.restart}
          accessibilityLabel="Restart to use the new version"
        >
          {restarting ? (
            <ActivityIndicator size="small" color={colors.moss} />
          ) : (
            <Text style={[type.label, styles.restartText]}>RESTART</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors, type: TypeScale) {
  return StyleSheet.create({
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
      backgroundColor: colors.moss,
    },
    text: { color: colors.paper },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    later: { color: colors.mossSoft, opacity: 0.8 },
    restart: {
      minWidth: 76,
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      backgroundColor: colors.paper,
    },
    restartText: { color: colors.moss },
  });
}
