import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional heading at the top of the sheet. */
  title?: string;
  children: ReactNode;
}

/** Past this far down, or this fast, a drag closes the sheet instead of springing back. */
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.9;

/**
 * A card that rises from the bottom over the screen you are on.
 *
 * Opening an entry used to mean leaving the list for a full screen, and
 * coming back meant finding your place again. A sheet keeps the list in view
 * behind it: look, act, drag it away, and you are exactly where you were.
 *
 * Built from React Native's own Modal, Animated and PanResponder, with no
 * gesture library, so it ships in an over-the-air update. Close it by
 * dragging the handle down, tapping the shade, or the back button.
 */
export function BottomSheet({ visible, onClose, title, children }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get('window').height;

  // Mounted for as long as it is on screen, including while it slides away.
  // Opening mounts it at once, during render; closing unmounts it only when
  // the slide out has finished.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [rise] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      Animated.spring(rise, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 3 }).start();
    } else {
      Animated.timing(rise, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, rise, drag]);

  // Remade only when the close handler changes; nothing re-renders during a
  // drag, because the drag lives in an Animated value rather than in state.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) {
            onClose();
          } else {
            Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
          }
        },
      }),
    [drag, onClose]
  );

  if (!mounted) return null;

  const translateY = Animated.add(
    rise.interpolate({ inputRange: [0, 1], outputRange: [screen * 0.6, 0] }),
    drag
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[styles.shade, { opacity: rise }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, maxHeight: screen * 0.86, transform: [{ translateY }] },
        ]}
        accessibilityViewIsModal
      >
        <View {...pan.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
        </View>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/** One full-width action row in a sheet: icon-less, plain words, red when destructive. */
export function SheetAction({
  label,
  hint,
  onPress,
  destructive,
  icon,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.well }]}
    >
      {icon}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.actionLabel, destructive && { color: colors.alert }]}>{label}</Text>
        {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.rule,
    },
    // Tall enough to grab with a thumb, though the visible handle is small.
    handleArea: { paddingTop: 10, paddingBottom: 6, paddingHorizontal: 20, alignItems: 'center', gap: 10 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.rule },
    title: { alignSelf: 'stretch', fontFamily: FONTS.sansSemi, fontSize: 17, color: colors.ink },
    body: { paddingHorizontal: 20, paddingTop: 4, gap: 4 },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 52,
      paddingHorizontal: 12,
      marginHorizontal: -12,
      borderRadius: 12,
    },
    actionLabel: { fontFamily: FONTS.sansMedium, fontSize: 16, color: colors.ink },
    actionHint: { fontFamily: FONTS.sans, fontSize: 13, color: colors.graphite },
  });
}
