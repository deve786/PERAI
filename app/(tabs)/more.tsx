import { ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { NavRow } from '@/components/NavRow';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';

export default function More() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={type.display}>More</Text>

      <NavRow label="Calendar" icon="calendar-outline" onPress={() => router.push('/calendar')} />
      <NavRow label="Lists" icon="bookmark-outline" onPress={() => router.push('/lists')} />
      <NavRow label="Timeline" icon="reorder-two-outline" onPress={() => router.push('/timeline')} />
      <NavRow label="Expense history" icon="receipt-outline" onPress={() => router.push('/expense-history')} />
      <NavRow label="Expense analytics" icon="stats-chart-outline" onPress={() => router.push('/expense-analytics')} />
      <NavRow label="Borrow & Lend" icon="people-outline" onPress={() => router.push('/expense/borrow-lend')} />
      <NavRow label="Net Worth & Accounts" icon="wallet-outline" onPress={() => router.push('/expense/net-worth')} />
      <NavRow label="Activity log" icon="pulse-outline" onPress={() => router.push('/logs')} />
      <NavRow label="Settings" icon="settings-outline" onPress={() => router.push('/settings')} />
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: { padding: SPACE.page, paddingTop: 28, paddingBottom: 48 },
  });
}
