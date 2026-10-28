import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { AnswerRow } from '../ai/answerRows';
import { groupAnswerRows, hasSections } from '../ai/answerRows';
import { answerBarShares } from '../charts/chartLogic';
import type { GroundingCheckResult } from '../sources/chunkLogic';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors, type TypeScale } from '../theme';

interface AnswerRowsProps {
  rows: AnswerRow[];
  /** One per row, in the same order. A row the source could not be shown for is flagged. */
  statuses?: GroundingCheckResult[];
}

/**
 * The substance of an answer, laid out rather than written out.
 *
 * It used to be one sentence per line — "Minicoy total spend: ₹2,904.90
 * (Bills: ₹465.90, Ticket: ₹1,825.00…)" — so two places in a row read as a
 * single paragraph and every figure had to be hunted for inside it.
 *
 * Now each line gets a date in the gutter, its title on the baseline, its
 * supporting facts beneath, and its figure right-aligned in mono so the
 * amounts form a column the eye can run down. When the lines cover more than
 * one place or month, each set sits under its own heading with a rule above
 * it, so one group visibly ends before the next begins.
 */
export const AnswerRows = memo(function AnswerRows({ rows, statuses }: AnswerRowsProps) {
  const { colors, type } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const groups = useMemo(() => groupAnswerRows(rows), [rows]);
  const sectioned = hasSections(groups);
  // One scale for the whole answer, so a figure in one group can be compared
  // by eye with a figure in another. Null when fewer than two rows carry money.
  const shares = useMemo(() => answerBarShares(rows.map((row) => row.amount)), [rows]);

  if (rows.length === 0) return null;

  // Numbering runs across the whole answer, not per section, so "the third
  // one" means the same thing whether or not the list happens to be grouped.
  // Each group starts where the ones before it left off.
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((sum, g) => sum + g.rows.length, 0));

  return (
    <View style={styles.list}>
      {groups.map((group, groupIndex) => (
        <View
          key={`${group.heading ?? 'flat'}-${groupIndex}`}
          style={sectioned && groupIndex > 0 ? styles.sectionAfter : undefined}
        >
          {sectioned && group.heading ? (
            <View style={styles.headingRow}>
              <Text style={[type.label, styles.heading]}>{group.heading}</Text>
              <Text style={styles.headingCount}>
                {group.rows.length === 1 ? '1 entry' : `${group.rows.length} entries`}
              </Text>
            </View>
          ) : null}

          {group.rows.map((row, rowIndex) => {
            const index = starts[groupIndex] + rowIndex;
            const position = index + 1;
            const status = statuses?.[index];
            const unverified = status !== undefined && !status.verified;
            const share = shares?.[index] ?? null;

            return (
              <View key={`${row.title}-${rowIndex}`} style={styles.row}>
                <View style={styles.gutter}>
                  {row.date ? (
                    <Text style={styles.date} numberOfLines={2}>
                      {row.date}
                    </Text>
                  ) : (
                    <Text style={styles.mark}>{position}</Text>
                  )}
                </View>

                <View style={styles.main}>
                  <Text style={[type.entry, styles.title]}>{row.title}</Text>
                  {row.detail ? (
                    <Text style={[type.fine, styles.detail]}>{row.detail}</Text>
                  ) : null}
                  {share !== null ? <AnswerBar share={share} color={colors.moss} track={colors.well} /> : null}
                  {row.note ? (
                    <View style={styles.note}>
                      <Text style={styles.noteText}>{row.note}</Text>
                    </View>
                  ) : null}
                  {unverified ? (
                    <View style={styles.unverified}>
                      <Ionicons name="warning-outline" size={11} color={colors.alert} />
                      <Text style={styles.unverifiedText}>
                        Unverified in source{status?.reason ? ` · ${status.reason}` : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {row.amount ? (
                  <Text style={styles.amount} numberOfLines={1}>
                    {row.amount}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
});

/**
 * A thin bar under a row with a money figure, its length that figure's share
 * of the largest in the answer. It grows in once, from the left, so the eye
 * catches the ranking before reading any number. The figure itself stays in
 * text at the end of the row; the bar never stands in for it.
 */
function AnswerBar({ share, color, track }: { share: number; color: string; track: string }) {
  const [grow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(grow, { toValue: share, duration: 320, useNativeDriver: false }).start();
  }, [grow, share]);

  return (
    <View
      style={{ height: 6, borderRadius: 3, backgroundColor: track, marginTop: 5, marginBottom: 1, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
          width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    list: { marginTop: 4 },
    sectionAfter: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.rule,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 6,
      gap: 8,
    },
    heading: { color: colors.ink, flexShrink: 1 },
    headingCount: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      color: colors.mist,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 7,
    },
    // Wide enough for "28 October 2026" on two lines, so every title starts
    // at the same x whatever form the date was recorded in.
    gutter: { width: 62, paddingTop: 2 },
    date: {
      fontFamily: FONTS.mono,
      fontSize: 11,
      lineHeight: 15,
      color: colors.graphite,
    },
    mark: {
      fontFamily: FONTS.mono,
      fontSize: 12,
      color: colors.mist,
    },
    main: { flex: 1, gap: 2 },
    title: { color: colors.ink },
    detail: { color: colors.graphite },
    note: {
      alignSelf: 'flex-start',
      marginTop: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: RADIUS.input,
      backgroundColor: colors.mossSoft,
    },
    noteText: {
      fontFamily: FONTS.sansMedium,
      fontSize: 11,
      color: colors.moss,
    },
    amount: {
      fontFamily: FONTS.monoMedium,
      fontSize: 15,
      lineHeight: 22,
      color: colors.ink,
      paddingTop: 1,
    },
    unverified: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      marginTop: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: RADIUS.input,
      backgroundColor: colors.alertSoft,
      borderWidth: 1,
      borderColor: colors.alert,
    },
    unverifiedText: {
      fontFamily: FONTS.sansMedium,
      fontSize: 11,
      color: colors.alert,
    },
  });
}

export type { TypeScale };
