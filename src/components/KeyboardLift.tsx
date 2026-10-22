import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, View, type ViewProps } from 'react-native';

/**
 * Keeps a screen's bottom edge above the keyboard, like a chat app's input
 * bar. React Native's KeyboardAvoidingView does nothing on Android when the
 * app draws edge to edge, so the keyboard sat on top of the text box.
 *
 * Instead of guessing which keyboard mode the phone is in, this measures:
 * how far the keyboard's top edge is above this box's bottom edge is exactly
 * the padding needed. If the system already shrank the window for the
 * keyboard, that distance is zero and nothing is added.
 */
export function KeyboardLift({ style, children, onLayout, ...rest }: ViewProps) {
  const box = useRef<View>(null);
  // Top edge of the keyboard on screen while it is open, else null.
  const keyboardTop = useRef<number | null>(null);
  const [lift, setLift] = useState(0);

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      const top = keyboardTop.current;
      if (top === null) return;
      box.current?.measureInWindow((_x, y, _w, h) => {
        // Re-check: the keyboard may have closed while measuring.
        if (keyboardTop.current === null) return;
        setLift(Math.max(0, Math.round(y + h - top)));
      });
    });
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      measure();
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = null;
      setLift(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure]);

  return (
    <View
      ref={box}
      collapsable={false}
      {...rest}
      // This box's own size changes when the tab bar hides or the window
      // resizes for the keyboard, so measure again then.
      onLayout={(e) => {
        onLayout?.(e);
        measure();
      }}
      style={[style, { paddingBottom: lift }]}
    >
      {children}
    </View>
  );
}
