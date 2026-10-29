import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { useTheme } from '../../ThemeContext';
import { FONTS, type Colors } from '../../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** Share used, 0..1 (may run past 1). */
  used: number;
  /** Where an even pace would be by now, 0..1. Drawn as a tick on the ring. */
  expected?: number;
  /** The colour of the filled arc: the budget's tone. */
  tone: string;
  /** Written in the middle. */
  figure: string;
  /** A short line under the figure, inside the ring. */
  caption?: string;
  size?: number;
}

/**
 * How much of the budget is gone, and where it should be by now.
 *
 * The arc is what has been spent; the tick across the ring is where an even
 * month would have it today. Arc short of the tick: under pace. Arc past it:
 * spending is running ahead of the month. One look answers the question a
 * bare percentage cannot — "is 68% a problem on the 20th?"
 */
export function ProgressRing({ used, expected, tone, figure, caption, size = 112 }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [sweep] = useState(() => new Animated.Value(0));

  const stroke = 10;
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.max(0, Math.min(used, 1));

  useEffect(() => {
    Animated.timing(sweep, { toValue: shown, duration: 600, useNativeDriver: false }).start();
  }, [shown, sweep]);

  // The pace tick, drawn as a short line across the ring at that angle.
  const tick =
    expected !== undefined
      ? (() => {
          const angle = Math.max(0, Math.min(expected, 1)) * 2 * Math.PI - Math.PI / 2;
          const inner = radius - stroke / 2 - 3;
          const outer = radius + stroke / 2 + 3;
          return {
            x1: centre + inner * Math.cos(angle),
            y1: centre + inner * Math.sin(angle),
            x2: centre + outer * Math.cos(angle),
            y2: centre + outer * Math.sin(angle),
          };
        })()
      : null;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={centre} cy={centre} r={radius} stroke={colors.well} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={sweep.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
        {tick ? (
          <Line {...tick} stroke={colors.ink} strokeWidth={2} strokeLinecap="round" />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>
        <Text style={styles.figure}>{figure}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
    figure: { fontFamily: FONTS.monoMedium, fontSize: 22, color: colors.ink },
    caption: { fontFamily: FONTS.sans, fontSize: 11, color: colors.graphite, textAlign: 'center' },
  });
}
