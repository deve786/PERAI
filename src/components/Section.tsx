import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { toSentence } from '../format';
import { type Colors, type TypeScale } from '../theme';

interface Props {
  label: string;
  /** Optional link at the right of the label, e.g. "See all". */
  action?: { label: string; onPress: () => void };
  /** Tint the label for sections about what is ahead. */
  tone?: 'ahead';
  /**
   * true (default): the children are rows, drawn together in one card.
   * false: free content (charts, totals) laid out by the caller.
   */
  inset?: boolean;
  children: ReactNode;
}

/**
 * A labelled group: a sentence-case heading, then its rows in a white card.
 * Labels written in capitals ("STILL WAITING") are shown in sentence case
 * ("Still waiting"), so older call sites read right without changes.
 */
export function Section({ label, action, tone, inset = true, children }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors, type);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[styles.label, tone === 'ahead' && styles.ahead]}>{toSentence(label)}</Text>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={10} accessibilityRole="button">
            <Text style={styles.action}>{toSentence(action.label)}</Text>
          </Pressable>
        ) : null}
      </View>
      {inset ? (
        <View style={styles.card}>
          {/* Rows draw a hairline under themselves; this hides the last one. */}
          <View style={styles.cardInner}>{children}</View>
        </View>
      ) : (
        children
      )}
    </View>
  );
}

function makeStyles(colors: Colors, type: TypeScale) {
  return StyleSheet.create({
    section: { gap: 8 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: { ...type.entry, fontFamily: type.display.fontFamily, color: colors.ink },
    ahead: { color: colors.moss },
    action: { ...type.label, color: colors.moss },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingHorizontal: 14,
      overflow: 'hidden',
    },
    cardInner: { marginBottom: -1 },
  });
}
