import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { blend, waterfallDomain, waterfallSteps } from '../../charts/chartLogic';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';

interface Props {
  income: number;
  categories: { name: string; total: number }[];
  format: (value: number) => string;
}

/**
 * Where the month's money went, as one picture: income at the top, each
 * category taking its bite in turn, and what was left at the bottom.
 *
 * A list of categories says how big each one was; it cannot say what they
 * did to the month. Stepping down from income shows that directly — the
 * point where the bars cross below zero is the point the month stopped
 * paying for itself.
 *
 * Laid on its side so category names have room to be read on a phone. Every
 * step carries its figure; the colour only separates money coming in and
 * what was left from the money going out, and is never the only way to tell.
 */
export function Waterfall({ income, categories, format }: Props) {
  const { colors, scheme } = useTheme();
  const styles = makeStyles(colors);
  const [grow] = useState(() => new Animated.Value(0));

  const steps = useMemo(() => waterfallSteps(income, categories), [income, categories]);
  const [low, high] = useMemo(() => waterfallDomain(steps), [steps]);
  const span = high - low;
  const downFill = blend(colors.graphite, colors.surface, scheme === 'dark' ? 0.55 : 0.4);

  const signature = steps.map((s) => `${s.label}:${s.amount}`).join('|');
  useEffect(() => {
    grow.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 320, useNativeDriver: false }).start();
  }, [signature, grow]);

  // Where zero sits on the track, when money ran out before the month did.
  const zeroAt = low < 0 ? (-low / span) * 100 : null;

  return (
    <View style={styles.wrap}>
      {steps.map((step, i) => {
        const a = Math.min(step.from, step.to);
        const b = Math.max(step.from, step.to);
        const left = ((a - low) / span) * 100;
        const width = Math.max(((b - a) / span) * 100, 0.8);
        const overspent = step.kind === 'end' && step.to < 0;
        const fill =
          step.kind === 'down' ? downFill : overspent ? colors.alert : colors.moss;
        const figure =
          step.kind === 'down' ? `−${format(step.amount)}` : format(step.amount);

        return (
          <View
            key={`${step.label}-${i}`}
            style={[styles.row, step.kind === 'end' && styles.endRow]}
            accessible
            accessibilityLabel={`${step.label}: ${figure}`}
          >
            <Text
              style={[styles.label, step.kind !== 'down' && styles.labelStrong]}
              numberOfLines={1}
            >
              {step.label}
            </Text>
            <View style={styles.track}>
              {zeroAt !== null ? <View style={[styles.zero, { left: `${zeroAt}%` }]} /> : null}
              <Animated.View
                style={[
                  styles.bar,
                  {
                    left: `${left}%`,
                    width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${width}%`] }),
                    backgroundColor: fill,
                  },
                ]}
              />
            </View>
            <Text
              style={[styles.figure, overspent && { color: colors.alert }]}
              numberOfLines={1}
            >
              {figure}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
    endRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule, marginTop: 4, paddingTop: 4 },
    label: { width: 92, fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
    labelStrong: { fontFamily: FONTS.sansSemi, color: colors.ink },
    track: { flex: 1, height: 14, justifyContent: 'center' },
    zero: { position: 'absolute', top: -4, bottom: -4, width: 1, backgroundColor: colors.mist },
    bar: { position: 'absolute', height: 12, borderRadius: 3 },
    figure: { width: 86, textAlign: 'right', fontFamily: FONTS.mono, fontSize: 12, color: colors.ink },
  });
}
