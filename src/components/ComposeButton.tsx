import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { COLORS } from '../theme';

export type ComposeMode = 'voice' | 'send' | 'listening' | 'busy';

interface Props {
  mode: ComposeMode;
  /** 0..1 input level while listening. */
  level?: number;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

const SIZE = 48;

/**
 * The single primary control on both tabs.
 *
 * Empty box -> mic. Something typed -> send. While listening, a ring grows
 * with your voice, which is the only proof on screen that you are being
 * heard. One button instead of mic-plus-send means there is never a choice to
 * make about what to press next.
 */
export function ComposeButton({ mode, level = 0, onPress, disabled, accessibilityLabel }: Props) {
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(ring, {
      toValue: mode === 'listening' ? level : 0,
      duration: 90,
      useNativeDriver: true,
    }).start();
  }, [mode, level, ring]);

  const off = disabled && mode !== 'listening';

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
          <ActivityIndicator color={COLORS.paper} size="small" />
        ) : (
          <Ionicons
            name={
              mode === 'listening' ? 'stop' : mode === 'send' ? 'arrow-up' : 'mic'
            }
            size={mode === 'listening' ? 18 : 22}
            color={COLORS.paper}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.moss,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLORS.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { backgroundColor: COLORS.rule },
  pressed: { opacity: 0.8 },
});
