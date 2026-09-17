import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, GUTTER, TYPE } from '../theme';

interface Props {
  label: string;
  /** Optional link at the right of the label, e.g. "ALL". */
  action?: { label: string; onPress: () => void };
  /** Tint the label for sections about what is ahead. */
  tone?: 'ahead';
  /** Start the rule at the time column (true) or full width, for rows with no gutter. */
  inset?: boolean;
  children: ReactNode;
}

/**
 * A labelled group of entries, drawn like a day in the Timeline: mono label,
 * then a hairline that starts at the gutter, then rows. Keeps the Record and
 * Ask tabs visually part of the same record rather than separate widgets.
 */
export function Section({ label, action, tone, inset = true, children }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[TYPE.label, tone === 'ahead' && styles.ahead]}>{label}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10}>
            <Text style={[TYPE.label, styles.action]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.rule, !inset && styles.ruleFull]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 4 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  ahead: { color: COLORS.moss },
  action: { color: COLORS.mist },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
    marginLeft: GUTTER,
    marginBottom: 2,
  },
  ruleFull: { marginLeft: 0 },
});
