import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../expense/dates';
import { formatAmount } from '../format';
import { setShareProcessing, useShareProcessing } from '../shareProcessingStore';
import { useTheme } from '../ThemeContext';
import { SPACE, type Colors } from '../theme';

/**
 * The card a shared payment goes through: "reading it" while the AI works,
 * then the expense that was added — mounted once at the root, next to
 * DialogHost.
 *
 * Shown here rather than by switching to the expense screen: navigating the
 * moment a share lands left the app on a blank window until it was closed and
 * reopened. Opening the full expense is a tap away, once you choose to.
 */
export function ShareProcessingOverlay() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const { active, label, added } = useShareProcessing();

  if (!active) return null;

  const close = () => setShareProcessing(false);
  const open = () => {
    if (!added) return;
    close();
    router.push({ pathname: '/expense/expense', params: { id: String(added.id) } });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={added ? close : () => {}} statusBarTranslucent>
      <View style={styles.scrim}>
        {added ? (
          <View style={[styles.card, styles.column]}>
            <Text style={[type.label, styles.accent]}>ADDED TO EXPENSES</Text>
            <View>
              <Text style={[type.display, styles.ink]}>{formatAmount(added.amount, 'INR')}</Text>
              <Text style={[type.body, styles.ink]} numberOfLines={2}>{added.title}</Text>
            </View>
            <View style={styles.rows}>
              <Detail label="DATE" value={prettyDate(added.date)} styles={styles} type={type} />
              <Detail label="CATEGORY" value={added.category} styles={styles} type={type} />
              <Detail label="PAID WITH" value={added.bank ? `UPI · ${added.bank}` : 'UPI'} styles={styles} type={type} />
              <Detail label="NOTES" value={added.notes} styles={styles} type={type} />
            </View>
            <View style={styles.actions}>
              <Pressable onPress={open} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
                <Text style={[type.label, styles.quiet]}>OPEN EXPENSE</Text>
              </Pressable>
              <Pressable onPress={close} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
                <Text style={[type.label, styles.ink]}>DONE</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.card, styles.row]}>
            <ActivityIndicator color={colors.moss} />
            <Text style={[type.body, styles.ink, styles.shrink]}>{label || 'Working on it…'}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Detail({
  label,
  value,
  styles,
  type,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>['type'];
}) {
  return (
    <View style={styles.detail}>
      <Text style={[type.label, styles.quiet]}>{label}</Text>
      <Text style={[type.body, styles.ink, styles.detailValue]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACE.page,
    },
    card: {
      backgroundColor: colors.paper,
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingVertical: 20,
      paddingHorizontal: 18,
      maxWidth: 420,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    column: { width: '100%', gap: 16 },
    rows: { gap: 8 },
    detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
    detailValue: { flexShrink: 1, textAlign: 'right' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 22, paddingTop: 4 },
    accent: { color: colors.moss },
    ink: { color: colors.ink },
    quiet: { color: colors.mist },
    shrink: { flexShrink: 1 },
    pressed: { opacity: 0.6 },
  });
}
