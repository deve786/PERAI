import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '../ThemeContext';

/**
 * One button that arms or disarms hands-free capture for a session: while
 * armed, saying "start recording" (see useWakeWord.ts) begins a note without
 * touching the phone. Deliberately session-scoped rather than always-on —
 * Android shows a mic-in-use indicator the whole time a wake phrase is being
 * listened for (an OS privacy feature, not something an app can suppress),
 * so this keeps that indicator on only while you've chosen to have it on.
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
