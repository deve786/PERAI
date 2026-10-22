import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { isConfigured } from '@/expense/sync/client';
import { useSync } from '@/expense/sync/useSync';
import { FONTS, useTheme } from '@/expense/theme';

/**
 * Whether expense data is safe off this phone, in one glance — a small round
 * button in the Money title row:
 * - A done cloud means everything is backed up
 * - An upload cloud with a count means changes are waiting
 * - An offline cloud means not signed in, or the last sync failed
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
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        signedIn
          ? waiting
            ? `Expense backup: ${sync.pending} changes waiting`
            : 'Expense backup: everything is saved'
          : 'Set up expense backup'
      }
      style={({ pressed }) => [styles.wrap, { backgroundColor: c.well, opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={tint} />
      {signedIn && waiting ? (
        <View style={[styles.badge, { backgroundColor: c.solid, borderColor: c.bg }]}>
          <Text style={[styles.count, { color: c.inkText }]}>
            {sync.pending > 99 ? '99+' : sync.pending}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -4, right: -6, minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  count: { fontSize: 12, fontFamily: FONTS.monoMedium },
});
