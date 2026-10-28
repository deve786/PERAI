import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useTheme } from '../ThemeContext';
import { FONTS, type Colors } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SwipeAction {
  label: string;
  icon: IconName;
  /** 'alert' for destructive, 'moss' for affirming. */
  tone: 'alert' | 'moss';
  /**
   * True when doing it takes the row out of the list (delete). The row slides
   * off and folds up; `restore` brings it back if the work is undone.
   */
  removes?: boolean;
  onTrigger: (controls: { restore: () => void }) => void;
}

interface Props {
  /** Revealed by swiping right — usually the affirming one (Done). */
  left?: SwipeAction;
  /** Revealed by swiping left — usually the destructive one (Delete). */
  right?: SwipeAction;
  children: ReactNode;
}

/** A swipe past this share of the row's width does the action on release. */
const TRIGGER_SHARE = 0.32;

/**
 * A row you can swipe: right to do the affirming thing, left to remove it.
 *
 * Your most frequent actions — tick it off, get rid of it — were two or more
 * taps away, behind opening the entry. A swipe is one motion, and the colour
 * that grows behind the row says what letting go will do before you do it.
 *
 * Only a clearly sideways drag starts it, so scrolling the list past a row
 * never catches. A light tick marks the moment a swipe goes far enough to
 * count. The same actions are offered to screen readers as named actions, so
 * nothing is reachable only by a gesture.
 *
 * Built on PanResponder and Animated — no gesture library — so it ships in an
 * over-the-air update.
 */
export function SwipeRow({ left, right, children }: Props) {
  const { colors, scheme } = useTheme();
  const styles = makeStyles(colors);

  const [shift] = useState(() => new Animated.Value(0));
  const [fold] = useState(() => new Animated.Value(1));
  const [height, setHeight] = useState<number | null>(null);
  const [folding, setFolding] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  // Gesture bookkeeping that must not cause a render: read and written only
  // by the gesture and layout handlers, never while rendering.
  const width = useRef(0);
  const armed = useRef(false);
  const facing = useRef<'left' | 'right' | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    width.current = event.nativeEvent.layout.width;
    if (!folding) setHeight(event.nativeEvent.layout.height);
  };

  const run = (action: SwipeAction, side: 'left' | 'right') => {
    const restore = () => {
      Animated.timing(fold, { toValue: 1, duration: 180, useNativeDriver: false }).start(() => {
        setFolding(false);
        Animated.spring(shift, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      });
    };

    if (action.removes) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      const off = (side === 'left' ? 1 : -1) * (width.current || 400);
      Animated.timing(shift, { toValue: off, duration: 180, useNativeDriver: true }).start(() => {
        setFolding(true);
        Animated.timing(fold, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        action.onTrigger({ restore });
      });
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(shift, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      action.onTrigger({ restore });
    }
  };

  const pan = useMemo(
    () =>
      // PanResponder keeps these handlers and calls them during a gesture, never
      // while rendering; the rule cannot see that and reads it as a render-time
      // ref access.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Only a clearly sideways drag: twice as much across as down.
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2 && (g.dx > 0 ? !!left : !!right),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          armed.current = false;
        },
        onPanResponderMove: (_, g) => {
          const allowed = g.dx > 0 ? !!left : !!right;
          const dx = allowed ? g.dx : 0;
          shift.setValue(dx);
          // Only a change of side re-renders; the drag itself never does.
          const side = dx > 0 ? 'left' : dx < 0 ? 'right' : null;
          if (side !== facing.current) {
            facing.current = side;
            setDirection(side);
          }
          const past = Math.abs(dx) > width.current * TRIGGER_SHARE;
          if (past !== armed.current) {
            armed.current = past;
            if (past) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
        },
        onPanResponderRelease: (_, g) => {
          const past = Math.abs(g.dx) > width.current * TRIGGER_SHARE;
          if (past && g.dx > 0 && left) run(left, 'left');
          else if (past && g.dx < 0 && right) run(right, 'right');
          else Animated.spring(shift, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(shift, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [left, right]
  );

  const showing = direction === 'left' ? left : direction === 'right' ? right : null;
  // Fills chosen for the words on them: mossFill is made to carry white, and
  // the alert colour is light enough in dark mode that it carries the page
  // colour instead.
  const toneColor = showing?.tone === 'alert' ? colors.alert : colors.mossFill;
  const onTone = showing?.tone === 'alert' && scheme === 'dark' ? colors.paper : '#FFFFFF';

  const actions = [left, right].filter((a): a is SwipeAction => !!a);

  return (
    <Animated.View
      style={folding && height !== null ? { height: fold.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), overflow: 'hidden' } : undefined}
    >
      <View onLayout={onLayout}>
        {showing ? (
          <View
            style={[
              styles.behind,
              { backgroundColor: toneColor, justifyContent: direction === 'left' ? 'flex-start' : 'flex-end' },
            ]}
          >
            <Ionicons name={showing.icon} size={20} color={onTone} />
            <Text style={[styles.behindLabel, { color: onTone }]}>{showing.label}</Text>
          </View>
        ) : null}
        <Animated.View
          {...pan.panHandlers}
          style={{ transform: [{ translateX: shift }], backgroundColor: colors.surface }}
          accessibilityActions={actions.map((action) => ({ name: action.label, label: action.label }))}
          onAccessibilityAction={(event) => {
            const action = actions.find((a) => a.label === event.nativeEvent.actionName);
            if (action) run(action, action === left ? 'left' : 'right');
          }}
        >
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    behind: {
      ...StyleSheet.absoluteFill,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      borderRadius: 4,
    },
    behindLabel: { fontFamily: FONTS.sansSemi, fontSize: 14 },
  });
}
