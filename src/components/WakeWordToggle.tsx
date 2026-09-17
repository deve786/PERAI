import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '../ThemeContext';

/**
 * One button that arms or disarms hands-free capture: while armed, saying
 * "start recording" (see useWakeWord.ts) begins a note without touching the
 * phone. `listening` (true while the wake phrase itself is actively being
 * listened for, as opposed to paused mid-capture) tints the icon to show it's
 * live, the same way the dark-mode button just flips a single state.
 */
export function WakeWordToggle({
  armed,
  listening,
  onToggle,
}: {
  armed: boolean;
  listening: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={armed ? 'Turn off hands-free listening' : 'Turn on hands-free listening'}
    >
      <Ionicons
        name={armed ? 'ear' : 'ear-outline'}
        size={22}
        color={listening ? colors.moss : colors.graphite}
      />
    </Pressable>
  );
}
