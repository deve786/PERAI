import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isConfigured } from '../sync/client';
import { useSync } from '../sync/useSync';
import { useTheme } from '../ThemeContext';

/**
 * Whether the record is safe off this phone, in one glance.
 *
 * A filled cloud means everything is up; an outline with a count means changes
 * are still waiting, which is also what it looks like when offline. Tapping
 * opens the backup screen.
 */
export function SyncButton() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const sync = useSync();

  if (!isConfigured()) return null;

  const signedIn = sync.email !== null;
  const waiting = sync.pending > 0;
  const icon = !signedIn
    ? 'cloud-offline-outline'
    : sync.state === 'error'
      ? 'cloud-offline-outline'
      : waiting || sync.state === 'syncing'
        ? 'cloud-upload-outline'
        : 'cloud-done-outline';

  const tint = !signedIn || sync.state === 'error' ? colors.graphite : colors.moss;

  return (
    <Pressable
      onPress={() => router.push('/account')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        signedIn
          ? waiting
            ? `Backup: ${sync.pending} changes waiting`
            : 'Backup: everything is saved'
          : 'Set up backup'
      }
    >
      <View style={styles.wrap}>
        <Ionicons name={icon} size={22} color={tint} />
        {signedIn && waiting ? (
          <Text style={[type.stamp, styles.count, { color: colors.graphite }]}>
            {sync.pending > 99 ? '99+' : sync.pending}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: 10 },
});
