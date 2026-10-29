import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

interface Props {
  /** What is happening right now, from describeStage(). */
  stage: string;
}

/**
 * The shape of an answer, before the answer.
 *
 * A spinner says only "wait". The card's own outline — a figure, a sentence,
 * three rows — already standing where the answer will appear says what is
 * coming and where, so the wait feels shorter and the answer lands without
 * the page jumping. The line under it says what is happening, in the words of
 * your own record.
 *
 * The pulse is slow and low-contrast, and stops the moment the card unmounts.
 */
export function AnswerSkeleton({ stage }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [pulse] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.card} accessibilityRole="progressbar" accessibilityLabel={stage}>
      <Animated.View style={{ opacity: pulse, gap: 10 }}>
        <View style={[styles.block, { width: '38%', height: 22 }]} />
        <View style={[styles.block, { width: '86%', height: 12 }]} />
        <View style={[styles.block, { width: '64%', height: 12 }]} />
        <View style={styles.rows}>
          {[0.72, 0.58, 0.66].map((share, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.block, { width: 44, height: 10 }]} />
              <View style={[styles.block, { flex: share, height: 12 }]} />
              <View style={{ flex: 1 - share }} />
              <View style={[styles.block, { width: 52, height: 12 }]} />
            </View>
          ))}
        </View>
      </Animated.View>
      <Text style={styles.stage} accessibilityLiveRegion="polite">
        {stage}
      </Text>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      alignSelf: 'flex-start',
      width: '92%',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomRightRadius: 18,
      borderBottomLeftRadius: 4,
      padding: 14,
      gap: 12,
    },
    block: { borderRadius: 6, backgroundColor: colors.well },
    rows: { gap: 12, marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stage: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
  });
}
