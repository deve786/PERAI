import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useAppMode } from '../AppModeContext';
import { useTheme } from '../ThemeContext';

/**
 * One button, same shape as ThemeToggle: shows the icon of the mode you'd
 * switch *to*. PERAI and the Expense tracker are two independent zones under
 * one app shell — this just persists the choice and jumps to that zone's
 * root screen.
 */
export function ModeToggle() {
  const { colors } = useTheme();
  const { mode, setMode } = useAppMode();
  const router = useRouter();
  const toExpense = mode === 'perai';

  function press() {
    setMode(toExpense ? 'expense' : 'perai');
    router.replace(toExpense ? '/expense' : '/');
  }

  return (
    <Pressable
      onPress={press}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={toExpense ? 'Switch to Expense tracker' : 'Switch to PERAI'}
    >
      <Ionicons
        name={toExpense ? 'wallet-outline' : 'mic-outline'}
        size={22}
        color={colors.graphite}
      />
    </Pressable>
  );
}
