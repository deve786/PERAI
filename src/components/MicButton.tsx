import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '../theme';
import type { VoiceStage } from '../useVoiceInput';

interface Props {
  stage: VoiceStage;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Press to talk, press again to stop.
 *
 * The only animation in the app, and it earns its place: while listening there
 * is nothing on screen to show the app is still hearing you, so the button
 * breathes. It stops the moment recording does.
 */
export function MicButton({ stage, onPress, disabled }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (stage !== 'listening') {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [stage, pulse]);

  const listening = stage === 'listening';
  const transcribing = stage === 'transcribing';

  const label = listening
    ? 'Stop recording'
    : transcribing
      ? 'Writing down what you said'
      : 'Record with your voice';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || transcribing}
      hitSlop={8}
      accessibilityLabel={label}
      accessibilityState={{ busy: transcribing, selected: listening }}
      style={[
        styles.button,
        listening && styles.listening,
        (disabled || transcribing) && styles.off,
      ]}
    >
      <Animated.View
        style={{
          opacity: listening
            ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] })
            : 1,
          transform: [
            {
              scale: listening
                ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] })
                : 1,
            },
          ],
        }}
      >
        <Ionicons
          name={listening ? 'stop' : 'mic-outline'}
          size={17}
          color={listening ? COLORS.paper : COLORS.graphite}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.rule,
    backgroundColor: 'transparent',
  },
  listening: { backgroundColor: COLORS.moss, borderColor: COLORS.moss },
  off: { opacity: 0.4 },
});
