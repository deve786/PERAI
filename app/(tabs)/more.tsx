import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APP_VERSION } from '@/appVersion';
import { seedAllDummyData } from '@/db/seedData';
import { getNetWorthSummary } from '@/expense/accountsDb';
import { fmtMoney } from '@/expense/stats';
import { useTheme } from '@/expense/theme';
import { IconTile, ListCard, ListRow, Screen, T, Title } from '@/expense/ui';

export default function More() {
  const router = useRouter();
  const { symbol } = useTheme();
  const [seeding, setSeeding] = useState(false);

  // Shown beside "Net worth & accounts" once there is at least one account.
  const [netWorth, setNetWorth] = useState<number | null>(null);

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await seedAllDummyData(true);
      router.replace('/(tabs)/expense-home');
    } finally {
      setSeeding(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getNetWorthSummary()
        .then((s) => {
          if (active) setNetWorth(s.accountsCount > 0 ? s.netWorth : null);
        })
        .catch(() => {
          if (active) setNetWorth(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>More</Title>

        <T size={16} weight="700" sub style={styles.heading}>Organise</T>
        <View style={styles.grid}>
          <View style={styles.tiles}>
            <IconTile icon="calendar-outline" label="Calendar" onPress={() => router.push('/calendar')} />
            <IconTile icon="list-outline" label="Timeline" onPress={() => router.push('/timeline')} />
            <IconTile icon="bookmark-outline" label="Lists" onPress={() => router.push('/lists')} />
          </View>
          <View style={styles.tiles}>
            <IconTile icon="folder-outline" label="Groups" onPress={() => router.push('/groups')} />
            <IconTile icon="trending-up-outline" label="Your week" onPress={() => router.push('/review')} />
            <IconTile icon="pulse-outline" label="Activity" onPress={() => router.push('/logs')} />
          </View>
        </View>

        <T size={16} weight="700" sub style={styles.heading}>Money</T>
        <ListCard>
          <ListRow icon="receipt-outline" label="History" onPress={() => router.push('/expense-history')} />
          <ListRow
            icon="business-outline"
            label="Net worth & accounts"
            right={netWorth !== null ? <T size={15} sub tabular>{fmtMoney(netWorth, symbol)}</T> : undefined}
            onPress={() => router.push('/expense/net-worth')}
          />
          <ListRow icon="people-outline" label="Borrow & lend" onPress={() => router.push('/expense/borrow-lend')} />
          <ListRow icon="pricetag-outline" label="Categories & budgets" onPress={() => router.push('/expense/categories')} />
          <ListRow icon="repeat-outline" label="Recurring bills" onPress={() => router.push('/expense/recurring')} last />
        </ListCard>

        <T size={16} weight="700" sub style={styles.heading}>App</T>
        <ListCard>
          <ListRow icon="documents-outline" label="Data Sources" onPress={() => router.push('/data-sources' as any)} />
          <ListRow icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          <ListRow icon="cloud-outline" label="Backup" onPress={() => router.push('/account')} />
          <ListRow
            icon="flask-outline"
            label={seeding ? 'Populating Sample Data...' : 'Load Sample Data'}
            onPress={handleSeedData}
          />
          <ListRow
            icon="sparkles-outline"
            label="What's new"
            right={<T size={15} sub tabular>v{APP_VERSION}</T>}
            onPress={() => router.push('/expense/whats-new')}
            last
          />
        </ListCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  heading: { marginTop: 22, marginBottom: 10 },
  grid: { gap: 8 },
  tiles: { flexDirection: 'row', gap: 8 },
});
