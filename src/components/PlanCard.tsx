import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MAX_BATCH } from '../actions';
import type { CommandPlan } from '../ai/command';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors } from '../theme';

interface Props {
  plan: CommandPlan;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * What an instruction would change, before any of it happens.
 *
 * Every line states what it replaces, so a misheard instruction is caught
 * while it still costs nothing. Shared by the Ask tab and a group's own box,
 * because the question — "is this what you meant?" — is the same question.
 */
export function PlanCard({ plan, onCancel, onConfirm }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const confirmLabel = plan.destructive ? 'Delete' : plan.capture ? 'Review' : 'Confirm';

  return (
    <View style={[styles.plan, plan.destructive && styles.planDestructive]}>
      <View style={styles.head}>
        <Ionicons
          name={plan.destructive ? 'warning-outline' : 'create-outline'}
          size={18}
          color={plan.destructive ? colors.alert : colors.moss}
        />
        <Text style={[type.label, plan.destructive ? styles.planLabelWarn : styles.planLabel]}>
          {plan.destructive ? 'This cannot be undone' : 'About to change'}
        </Text>
      </View>
      <Text style={styles.summary}>{plan.summary}</Text>

      {plan.changes.length > 0 ? (
        <View style={styles.planList}>
          {plan.changes.map((change, index) => (
            <View
              key={`${change.label}-${index}`}
              style={[styles.change, index === plan.changes.length - 1 && styles.changeLast]}
            >
              <Text style={[type.entry, styles.changeTitle]} numberOfLines={2}>
                {change.label}
              </Text>
              <Text style={[type.fine, styles.changeFrom]} numberOfLines={1}>
                {change.before}
              </Text>
              <Text style={[type.fine, styles.changeTo]} numberOfLines={1}>
                → {change.after}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {plan.trimmed ? (
        <Text style={type.fine}>
          Only the first {MAX_BATCH} are included — ask again for the rest.
        </Text>
      ) : null}
      {plan.refused.map((reason, index) => (
        <Text key={`${reason}-${index}`} style={type.fine}>
          {reason}
        </Text>
      ))}

      <View style={styles.planActions}>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, styles.ghost, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, styles.ghostText]}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            plan.destructive ? styles.danger : styles.primary,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, plan.destructive ? styles.dangerText : styles.primaryText]}>
            {confirmLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    plan: {
      gap: 10,
      padding: 14,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
    },
    planDestructive: { borderColor: colors.alert },
    head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    planLabel: { color: colors.moss },
    planLabelWarn: { color: colors.alert },
    summary: { fontFamily: FONTS.sans, fontSize: 16, lineHeight: 23, color: colors.ink },
    planList: {
      borderRadius: RADIUS.input,
      backgroundColor: colors.paper,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
      paddingHorizontal: 12,
    },
    change: {
      paddingVertical: 9,
      gap: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    changeLast: { borderBottomWidth: 0 },
    changeTitle: { color: colors.ink, fontSize: 15 },
    changeFrom: { color: colors.mist, textDecorationLine: 'line-through' },
    changeTo: { color: colors.moss },
    planActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: RADIUS.button,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    ghost: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    primary: { backgroundColor: colors.mossFill },
    danger: { borderWidth: 1, borderColor: colors.alert, backgroundColor: colors.alertSoft },
    buttonText: { fontFamily: FONTS.sansSemi, fontSize: 15 },
    ghostText: { color: colors.ink },
    primaryText: { color: colors.onAccent },
    dangerText: { color: colors.alert },
    pressed: { opacity: 0.7 },
  });
}
