import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { GUTTER, type Colors, type TypeScale } from '../theme';

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
  const { colors, type } = useTheme();
  const styles = makeStyles(colors, type);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[type.label, tone === 'ahead' && styles.ahead]}>{label}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10}>
            <Text style={[type.label, styles.action]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.rule, !inset && styles.ruleFull]} />
      {children}
    </View>
  );
}

function makeStyles(colors: Colors, type: TypeScale) {
  return StyleSheet.create({
    section: { gap: 4 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    ahead: { color: colors.moss },
    action: { color: colors.mist },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.rule,
      marginLeft: GUTTER,
      marginBottom: 2,
    },
    ruleFull: { marginLeft: 0 },
  });
}
