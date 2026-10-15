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

      <NavRow label="Today" icon="today-outline" onPress={() => router.push('/today')} />
      <NavRow label="Lists" icon="bookmark-outline" onPress={() => router.push('/lists')} />
      <NavRow label="Timeline" icon="reorder-two-outline" onPress={() => router.push('/timeline')} />
      <NavRow label="Expense history" icon="receipt-outline" onPress={() => router.push('/expense-history')} />
      <NavRow label="Expense analytics" icon="stats-chart-outline" onPress={() => router.push('/expense-analytics')} />
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
