import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { dismissSnackbar, pressSnackbarAction, useSnackbar } from '../snackbarStore';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors } from '../theme';
import { useFloatingInset } from './floatingInset';

/**
 * Draws whatever showSnackbar() was last asked for, at the bottom of the
 * screen, above the tab bar.
 *
 * Inverted against the page — ink on paper becomes paper on ink — because
 * it is the one thing on screen that is about what just happened rather than
 * about the record, and should not be mistaken for a row of it.
 */
export function SnackbarHost() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const request = useSnackbar();
  const { bottom } = useFloatingInset(12);

  // Kept after the request clears, so it can slide out with its words still on
  // it. A new request takes its place at once, during render.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (request) {
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
    } else {
      Animated.timing(slide, { toValue: 0, duration: 160, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setShown(null);
      });
    }
  }, [request, slide]);

  if (!shown) return null;

  return (
    <Animated.View
      pointerEvents={request ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        {
          bottom,
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={dismissSnackbar}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={styles.bar}
      >
        <Text style={styles.message} numberOfLines={2}>
          {shown.message}
        </Text>
        {shown.onAction || shown.onCommit ? (
          <Pressable
            onPress={pressSnackbarAction}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={shown.actionLabel ?? 'Undo'}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.actionText}>{shown.actionLabel ?? 'Undo'}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16 },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingLeft: 16,
      paddingRight: 8,
      borderRadius: RADIUS.button,
      backgroundColor: colors.ink,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    message: { flex: 1, fontFamily: FONTS.sans, fontSize: 14, lineHeight: 19, color: colors.paper },
    action: { minHeight: 40, minWidth: 56, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    // The accent's soft wash reads as moss on the dark bar in light mode and on
    // the light bar in dark mode, so the action stays the one coloured thing.
    actionText: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.mossSoft },
  });
}
