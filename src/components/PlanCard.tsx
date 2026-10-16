import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_BATCH } from '../actions';
import type { CommandPlan } from '../ai/command';
import { useTheme } from '../ThemeContext';
import { type Colors } from '../theme';

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

  return (
    <View style={[styles.plan, plan.destructive && styles.planDestructive]}>
      <Text style={[type.label, plan.destructive ? styles.planLabelWarn : styles.planLabel]}>
        {plan.destructive ? 'THIS CANNOT BE UNDONE' : 'ABOUT TO CHANGE'}
      </Text>
      <Text style={type.answer}>{plan.summary}</Text>

      <View style={styles.planList}>
        {plan.changes.map((change, index) => (
          <View key={`${change.label}-${index}`} style={styles.change}>
            <Text style={[type.body, styles.changeTitle]} numberOfLines={2}>
              {change.label}
            </Text>
            <Text style={[type.body, styles.changeFrom]} numberOfLines={1}>
              {change.before}
            </Text>
            <Text style={[type.body, styles.changeTo]} numberOfLines={1}>
              → {change.after}
            </Text>
          </View>
        ))}
      </View>

      {plan.trimmed ? (
        <Text style={[type.body, styles.planNote]}>
          Only the first {MAX_BATCH} are included — ask again for the rest.
        </Text>
      ) : null}
      {plan.refused.map((reason, index) => (
        <Text key={`${reason}-${index}`} style={[type.body, styles.planNote]}>
          {reason}
        </Text>
      ))}

      <View style={styles.planActions}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={[type.label, styles.cancel]}>CANCEL</Text>
        </Pressable>
        <Pressable onPress={onConfirm} hitSlop={10}>
          <Text style={[type.label, plan.destructive ? styles.confirmWarn : styles.confirm]}>
            {plan.destructive ? 'DELETE' : plan.capture ? 'REVIEW' : 'CONFIRM'}
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
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingLeft: 12,
      paddingVertical: 2,
    },
    planDestructive: { borderLeftColor: colors.alert },
    planLabel: { color: colors.moss },
    planLabelWarn: { color: colors.alert },
    planList: { gap: 2 },
    change: {
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    changeTitle: { color: colors.ink },
    changeFrom: { color: colors.mist, textDecorationLine: 'line-through' },
    changeTo: { color: colors.moss },
    planNote: { color: colors.mist },
    planActions: { flexDirection: 'row', gap: 20, paddingTop: 2 },
    cancel: { color: colors.mist },
    confirm: { color: colors.moss },
    confirmWarn: { color: colors.alert },
  });
}
