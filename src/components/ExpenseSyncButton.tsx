import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isConfigured } from '@/expense/sync/client';
import { useSync } from '@/expense/sync/useSync';
import { useTheme } from '@/expense/theme';

/**
 * Whether expense data is safe off this phone, in one glance.
 * Matches the Record tab's SyncButton:
 * - A filled/done cloud means everything is backed up
 * - An outline with a count means changes are waiting
 * - An offline outline means not signed in or offline
 * Tapping opens the Expense backup screen (/expense/account).
 */
export function ExpenseSyncButton() {
  const { c } = useTheme();
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

  const tint = !signedIn || sync.state === 'error' ? c.sub : c.good;

  return (
    <Pressable
      onPress={() => router.push('/expense/account')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        signedIn
          ? waiting
            ? `Expense backup: ${sync.pending} changes waiting`
            : 'Expense backup: everything is saved'
          : 'Set up expense backup'
      }
    >
      <View style={styles.wrap}>
        <Ionicons name={icon} size={22} color={tint} />
        {signedIn && waiting ? (
          <Text style={[styles.count, { color: c.sub }]}>
            {sync.pending > 99 ? '99+' : sync.pending}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: { fontSize: 10, fontWeight: '600' },
});
