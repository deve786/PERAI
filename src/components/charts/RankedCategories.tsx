import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { fmtMoney, type CatTotal } from '../../expense/stats';
import { useTheme as useMoneyTheme } from '../../expense/theme';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';
import { Sparkline } from './Sparkline';

interface Props {
  data: CatTotal[];
  total: number;
  /** Monthly budget per category name, for the ones that have one. */
  budgets?: Map<string, number>;
  /** Recent monthly totals per category name, oldest first, for a sparkline. */
  trends?: Map<string, number[]>;
}

/**
 * Categories ranked by what went on them. Every row is labelled with its name
 * and figure, so the dot's colour is identity only — never the sole carrier of
 * meaning. A budget, where one is set, is a tick on the same scale; a
 * sparkline beside the name says whether the category is rising or falling
 * over the last six months.
 *
 * The bars grow in from the left when the chart first appears, so the
 * ranking lands before any number is read.
 */
export function RankedCategories({ data, total, budgets, trends }: Props) {
  const { colors } = useTheme();
  const { symbol } = useMoneyTheme();
  const styles = makeStyles(colors);
  const [grow] = useState(() => new Animated.Value(0));
  const max = Math.max(...data.map((d) => d.total), 1);

  const signature = data.map((d) => `${d.name}:${d.total}`).join('|');
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 320, useNativeDriver: false }).start();
  }, [signature, grow]);

  return (
    <View style={{ gap: 14 }}>
      {data.map((k) => {
        const budget = budgets?.get(k.name);
        // Where the budget falls on the same scale as the bars. Past the end
        // of the track means the budget is larger than the biggest category,
        // and there is nowhere honest to draw it.
        const mark = budget && budget > 0 ? budget / max : null;
        const pct = total > 0 ? Math.round((k.total / total) * 100) : 0;
        const fraction = k.total / max;
        const trend = trends?.get(k.name);
        return (
          <View key={k.name} style={{ gap: 6 }} accessible accessibilityLabel={`${k.name}: ${fmtMoney(k.total, symbol)}, ${pct} percent${budget ? `, budget ${fmtMoney(budget, symbol)}` : ''}`}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: k.color }]} />
              <Text style={styles.name} numberOfLines={1}>
                {k.name}
              </Text>
              {trend ? <Sparkline values={trend} width={44} height={16} /> : null}
              <Text style={styles.figure}>
                {fmtMoney(k.total, symbol)}
                <Text style={styles.pct}> · {pct}%</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <Animated.View
                style={[
                  styles.fill,
                  {
                    backgroundColor: k.color,
                    width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${fraction * 100}%`] }),
                  },
                ]}
              />
              {mark !== null && mark <= 1 ? (
                <View
                  pointerEvents="none"
                  style={[styles.budgetMark, { left: `${mark * 100}%`, backgroundColor: colors.ink }]}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    name: { flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: colors.ink },
    figure: { fontFamily: FONTS.mono, fontSize: 13, color: colors.ink },
    pct: { fontFamily: FONTS.mono, fontSize: 12, color: colors.graphite },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.well },
    fill: { height: 6, borderRadius: 3 },
    budgetMark: { position: 'absolute', top: -2, width: 2, height: 10, borderRadius: 1 },
  });
}
