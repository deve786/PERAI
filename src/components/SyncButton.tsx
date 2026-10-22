import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { isConfigured } from '../sync/client';
import { useSync } from '../sync/useSync';
import { useTheme } from '../ThemeContext';
import { FONTS } from '../theme';

/**
 * Whether the record is safe off this phone, in one glance: a small labelled
 * pill. A done cloud means everything is up; an upload cloud with a count
 * means changes are still waiting, which is also what offline looks like.
 * Tapping opens the backup screen.
 */
export function SyncButton() {
  const { colors } = useTheme();
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
  const label = !signedIn
    ? 'Backup'
    : waiting
      ? `${sync.pending > 99 ? '99+' : sync.pending} waiting`
      : sync.state === 'syncing'
        ? 'Syncing'
        : sync.state === 'error'
          ? 'Not synced'
          : 'Backed up';

  return (
    <Pressable
      onPress={() => router.push('/account')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={
        signedIn
          ? waiting
            ? `Backup: ${sync.pending} changes waiting`
            : 'Backup: everything is saved'
          : 'Set up backup'
      }
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={[styles.label, { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: { fontFamily: FONTS.sansSemi, fontSize: 13 },
  pressed: { opacity: 0.7 },
});
