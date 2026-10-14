import React, { useRef } from 'react';
import { Pressable } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from './theme';
import { T } from './ui';

const ACTION_WIDTH = 84;

/**
 * Wraps a list row with swipe actions: right-swipe reveals Edit, left-swipe
 * reveals Delete. Long-press still works independently on the wrapped row —
 * this is an additional, more discoverable path to the same two actions, not
 * a replacement.
 */
export function SwipeableRow({ children, onEdit, onDelete }: {
  children: React.ReactNode; onEdit: () => void; onDelete: () => void;
}) {
  const { c } = useTheme();
  const ref = useRef<SwipeableMethods>(null);

  return (
    <Swipeable
      ref={ref}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={40}
      rightThreshold={40}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
      renderLeftActions={() => (
        <Pressable
          onPress={() => { ref.current?.close(); onEdit(); }}
          accessibilityLabel="Edit"
          style={{ width: ACTION_WIDTH, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="pencil-outline" size={20} color={c.inkText} />
          <T size={12} weight="600" style={{ color: c.inkText, marginTop: 4 }}>Edit</T>
        </Pressable>
      )}
      renderRightActions={() => (
        <Pressable
          onPress={() => { ref.current?.close(); onDelete(); }}
          accessibilityLabel="Delete"
          style={{ width: ACTION_WIDTH, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={20} color={c.inkText} />
          <T size={12} weight="600" style={{ color: c.inkText, marginTop: 4 }}>Delete</T>
        </Pressable>
      )}
    >
      {children}
    </Swipeable>
  );
}
