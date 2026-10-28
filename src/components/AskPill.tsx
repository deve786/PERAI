import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, Text } from 'react-native';
import { useAskContext } from '../askContextStore';
import { useSnackbar } from '../snackbarStore';
import { useTheme } from '../ThemeContext';
import { FONTS, RADIUS, type Colors } from '../theme';
import { useFloatingInset } from './floatingInset';

/**
 * Where a question can be asked from without leaving for the Ask tab first.
 * Screens with a form, a modal, or Ask itself are left without it.
 */
function showsOn(pathname: string): boolean {
  if (['/', '/expense-home', '/insights', '/more', '/calendar'].includes(pathname)) return true;
  return (
    pathname.startsWith('/group/') ||
    ['/timeline', '/lists', '/groups', '/expense-history'].includes(pathname)
  );
}

/**
 * A small floating Ask button on the screens that are about one thing — a
 * group, a month of money, a period of insights.
 *
 * Asking used to mean leaving what you were looking at for a separate tab and
 * starting the question from nothing. This carries the screen with it: on a
 * trip's page it reads "Ask about Minicoy" and opens Ask with the question
 * already begun, the cursor waiting for the rest.
 *
 * It rises out of the way while an Undo notice is showing, so the two never
 * cover each other.
 */
export function AskPill() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();
  const context = useAskContext();
  const snackbar = useSnackbar();
  const { bottom, pathname } = useFloatingInset(14);
  const [lift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(lift, { toValue: snackbar ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
  }, [snackbar, lift]);

  // Out of the way while you type: with the keyboard up it would sit on top
  // of the very box you are typing in.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setTyping(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setTyping(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Only where it knows what the screen is about. Without that it is a second
  // way to reach the Ask tab that sits on top of a row's figure; with it, it
  // saves starting the question from nothing — and that is its whole point.
  if (!context || !showsOn(pathname) || typing) return null;

  const label = context ? `Ask about ${context.label}` : 'Ask';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -64] }) }] },
      ]}
    >
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          router.push({ pathname: '/(tabs)/ask', params: context ? { prefill: context.prefill } : {} });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
      >
        <Ionicons name="sparkles" size={16} color={colors.onAccent} />
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', right: 16, maxWidth: '70%' },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.mossFill,
      shadowColor: '#000',
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    text: { flexShrink: 1, fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.onAccent },
  });
}
