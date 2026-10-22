import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { FONTS, SPACE, type Colors } from '../theme';

/**
 * Appears once a new version has finished downloading, so an update can be
 * applied with one tap instead of closing and reopening the app.
 *
 * It asks rather than reloading by itself: a reload in the middle of a voice
 * note would throw that note away. If it is ignored, useAutoUpdate still
 * applies the update the next time the app comes back from the background.
 */
export function UpdateBanner() {
  const { colors } = useTheme();
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
      // Reload refused (rare). Leave the card so it can be tried again.
      setRestarting(false);
    }
  }

  const styles = makeStyles(colors);

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} accessibilityRole="alert">
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="arrow-down-circle-outline" size={22} color={colors.moss} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>New version ready</Text>
          <Text style={styles.hint}>Restart to start using it.</Text>
        </View>
        <Pressable
          onPress={() => setDismissed(true)}
          hitSlop={8}
          disabled={restarting}
          accessibilityRole="button"
          style={styles.later}
        >
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
        <Pressable
          onPress={() => void restart()}
          disabled={restarting}
          accessibilityRole="button"
          accessibilityLabel="Restart to use the new version"
          style={({ pressed }) => [styles.restart, pressed && styles.pressed]}
        >
          {restarting ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Text style={styles.restartText}>Restart</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: SPACE.page,
      right: SPACE.page,
      zIndex: 10,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingLeft: 12,
      paddingRight: 10,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.mossSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: { flex: 1 },
    title: { fontFamily: FONTS.sansSemi, fontSize: 15, color: colors.ink },
    hint: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
    later: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
    laterText: { fontFamily: FONTS.sansMedium, fontSize: 15, color: colors.graphite },
    restart: {
      minWidth: 84,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.mossFill,
    },
    restartText: { fontFamily: FONTS.sansSemi, fontSize: 15, color: colors.onAccent },
    pressed: { opacity: 0.7 },
  });
}
