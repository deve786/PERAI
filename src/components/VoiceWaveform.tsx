import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { Colors } from '../theme';

const BARS = 28;
const MIN_HEIGHT = 3;
const MAX_HEIGHT = 26;

interface Props {
  /** 0..1, arriving roughly 10 times a second from useVoiceInput while listening. */
  level: number;
}

/**
 * A scrolling bar waveform — the "proof of listening" from Gemini and ChatGPT's
 * voice input, in place of a plain spinner or a sentence of instructions. Bars
 * shift left as each new sample arrives; the level already updates fast enough
 * (useVoiceInput samples every 100ms) that no extra animation is needed to make
 * it read as live.
 */
export function VoiceWaveform({ level }: Props) {
  const { colors } = useTheme();
  const [heights, setHeights] = useState<number[]>(() => Array(BARS).fill(MIN_HEIGHT));

  useEffect(() => {
    setHeights((prev) => [...prev.slice(1), MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT)]);
  }, [level]);

  const styles = makeStyles(colors);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {heights.map((height, i) => (
        <View key={i} style={[styles.bar, { height }]} />
      ))}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      height: MAX_HEIGHT,
    },
    bar: {
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.moss,
    },
  });
}
