import { useRouter } from 'expo-router';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { prettyDate } from '../expense/dates';
import { Button } from '../expense/ui';
import { formatAmount } from '../format';
import { setShareProcessing, useShareProcessing } from '../shareProcessingStore';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '../theme';

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
            <View style={styles.heading}>
              <View style={styles.tick}>
                <Ionicons name="checkmark" size={18} color={colors.moss} />
              </View>
              <Text style={[type.label, styles.accent]}>Added to expenses</Text>
            </View>
            <View style={styles.hero}>
              <Text style={[styles.amount, styles.ink]}>{formatAmount(added.amount, 'INR')}</Text>
              <Text style={[type.entry, styles.ink]} numberOfLines={2}>{added.title}</Text>
            </View>
            <View style={styles.rows}>
              <Detail label="Date" value={prettyDate(added.date)} styles={styles} type={type} />
              <Detail label="Category" value={added.category} styles={styles} type={type} />
              <Detail label="Paid with" value={added.bank ? `UPI · ${added.bank}` : 'UPI'} styles={styles} type={type} last={!added.notes} />
              <Detail label="Notes" value={added.notes} styles={styles} type={type} last />
            </View>
            <View style={styles.actions}>
              <Button title="Open expense" kind="ghost" onPress={open} style={styles.action} />
              <Button title="Done" onPress={close} style={styles.action} />
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
  last,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  type: ReturnType<typeof useTheme>['type'];
  last?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={[styles.detail, last && styles.detailLast]}>
      <Text style={type.fine}>{label}</Text>
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
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 20,
      maxWidth: 420,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    column: { width: '100%', gap: 16 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tick: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.mossSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hero: { gap: 4 },
    amount: { fontFamily: FONTS.monoMedium, fontSize: 32, letterSpacing: -0.8 },
    rows: {},
    detail: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      minHeight: 44,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    detailLast: { borderBottomWidth: 0 },
    detailValue: { flexShrink: 1, textAlign: 'right' },
    actions: { flexDirection: 'row', gap: 10, paddingTop: 4 },
    action: { flex: 1 },
    accent: { color: colors.moss },
    ink: { color: colors.ink },
    shrink: { flexShrink: 1 },
  });
}
