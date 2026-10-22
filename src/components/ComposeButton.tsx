import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import type { Colors } from '../theme';

export type ComposeMode = 'voice' | 'send' | 'listening' | 'busy';

interface Props {
  mode: ComposeMode;
  /** 0..1 input level while listening. */
  level?: number;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  /** Diameter in px. Record's capture card uses a bigger, 56px mic. */
  size?: number;
}

/**
 * The single primary control on both tabs.
 *
 * Empty box -> mic. Something typed -> send. While listening, a ring grows
 * with your voice, which is the only proof on screen that you are being
 * heard. One button instead of mic-plus-send means there is never a choice to
 * make about what to press next.
 */
export function ComposeButton({ mode, level = 0, onPress, disabled, accessibilityLabel, size = 48 }: Props) {
  const { colors } = useTheme();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(ring, {
      toValue: mode === 'listening' ? level : 0,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [mode, level, ring]);

  const off = disabled && mode !== 'listening';
  const styles = makeStyles(colors, size);

  return (
    <View style={styles.wrap}>
      {mode === 'listening' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] }),
              transform: [
                { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1.55] }) },
              ],
            },
          ]}
        />
      ) : null}

      <Pressable
        onPress={onPress}
        disabled={off || mode === 'busy'}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.button,
          off && styles.off,
          pressed && styles.pressed,
        ]}
      >
        {mode === 'busy' ? (
          <ActivityIndicator color={colors.onAccent} size="small" />
        ) : (
          <Ionicons
            name={
              mode === 'listening' ? 'stop' : mode === 'send' ? 'arrow-up' : 'mic'
            }
            size={Math.round(size * (mode === 'listening' ? 0.38 : 0.46))}
            color={off ? colors.mist : colors.onAccent}
          />
        )}
      </Pressable>
    </View>
  );
}

function makeStyles(colors: Colors, size: number) {
  return StyleSheet.create({
    wrap: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    ring: {
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.moss,
    },
    button: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: colors.mossFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    off: { backgroundColor: colors.well },
    pressed: { opacity: 0.8 },
  });
}
