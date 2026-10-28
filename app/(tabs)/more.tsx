import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APP_VERSION } from '@/appVersion';
import { seedAllDummyData } from '@/db/seedData';
import {
  describeSampleData,
  findSampleData,
  removeSampleData,
  sampleDataTotal,
  type SampleDataFound,
} from '@/db/removeSampleData';
import { showDialog } from '@/dialogStore';
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

  const [cleaning, setCleaning] = useState(false);

  // Sample data goes into the same tables as your own entries, so loading it
  // is never a single tap: it asks first, and says how to undo it.
  const handleSeedData = () => {
    showDialog({
      title: 'Load sample data?',
      message:
        'This adds made-up expenses, accounts, notes, documents and a Telegram channel alongside your own entries. You can take it all out again with "Remove sample data" below.',
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Load it',
          onPress: async () => {
            setSeeding(true);
            try {
              await seedAllDummyData(true);
              router.replace('/(tabs)/expense-home');
            } finally {
              setSeeding(false);
            }
          },
        },
      ],
    });
  };

  // Finds the sample rows first and says exactly what it found, so nothing is
  // removed that you have not seen listed.
  const handleRemoveSample = async () => {
    if (cleaning) return;
    setCleaning(true);
    let found: SampleDataFound;
    try {
      found = await findSampleData();
    } catch (err) {
      setCleaning(false);
      showDialog({
        title: 'Could not check for sample data',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    setCleaning(false);

    const lines = describeSampleData(found);
    if (lines.length === 0) {
      showDialog({
        title: 'No sample data found',
        message: 'Everything here is your own. Nothing was changed.',
      });
      return;
    }

    showDialog({
      title: 'Remove sample data?',
      message: [
        'Found and ready to remove:',
        ...lines.map((line) => `• ${line.count} ${line.label}`),
        '',
        'Only rows that match the sample data exactly are removed. Your own entries are not touched.',
      ].join('\n'),
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: `Remove ${sampleDataTotal(found)}`,
          destructive: true,
          onPress: async () => {
            setCleaning(true);
            try {
              const { removed, failed } = await removeSampleData(found);
              showDialog({
                title: failed === 0 ? 'Sample data removed' : 'Mostly removed',
                message:
                  failed === 0
                    ? `${removed} sample items are gone. Your own entries are as they were.`
                    : `${removed} sample items removed; ${failed} could not be. Try again to finish.`,
              });
            } finally {
              setCleaning(false);
            }
          },
        },
      ],
    });
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
            label={seeding ? 'Loading sample data…' : 'Load sample data'}
            onPress={handleSeedData}
          />
          <ListRow
            icon="trash-outline"
            label={cleaning ? 'Checking…' : 'Remove sample data'}
            onPress={() => void handleRemoveSample()}
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
