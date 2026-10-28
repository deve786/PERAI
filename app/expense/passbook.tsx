import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { listPassbookEntries } from '@/expense/passbookDb';
import {
  attachRunningBalances,
  computePassbookSummary,
  groupPassbookByDate,
  sourceBadge,
  type PassbookEntry,
} from '@/expense/passbookLogic';
import { fmtMoney } from '@/expense/stats';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Card, Chip, Empty, IconDot, ListCard, Row, Screen, Segmented, T, TopBar } from '@/expense/ui';

type FlowFilter = 'all' | 'in' | 'out';

const FLOW_OPTIONS: { key: FlowFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in (+)' },
  { key: 'out', label: 'Spent (−)' },
];

export default function PassbookScreen() {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ accountId?: string }>();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(params.accountId || null);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [entries, setEntries] = useState<PassbookEntry[]>([]);
  const [flow, setFlow] = useState<FlowFilter>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [accs, allTx] = await Promise.all([
        listAccounts(),
        listPassbookEntries(selectedAccountId),
      ]);
      setAccounts(accs);
      setEntries(allTx);
    } catch (err) {
      console.warn('Could not load passbook entries:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const entriesWithBalances = useMemo(() => {
    const baseBalance = selectedAccount
      ? (selectedAccount.balance || 0)
      : accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    return attachRunningBalances(entries, baseBalance);
  }, [entries, selectedAccount, accounts]);

  const filteredEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entriesWithBalances.filter((e) => {
      if (flow === 'in' && e.type !== 'in') return false;
      if (flow === 'out' && e.type !== 'out') return false;
      if (!needle) return true;
      return (
        e.title.toLowerCase().includes(needle) ||
        e.subtitle.toLowerCase().includes(needle) ||
        e.category.toLowerCase().includes(needle) ||
        e.accountName.toLowerCase().includes(needle) ||
        e.method.toLowerCase().includes(needle) ||
        String(e.amount).includes(needle) ||
        e.date.includes(needle) ||
        (e.place?.toLowerCase().includes(needle) ?? false) ||
        (e.userTag?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [entriesWithBalances, flow, q]);

  const summary = useMemo(() => computePassbookSummary(filteredEntries), [filteredEntries]);
  const dayGroups = useMemo(() => groupPassbookByDate(filteredEntries), [filteredEntries]);

  function handleOpenDetail(entry: PassbookEntry) {
    if (entry.type === 'out') {
      const cleanId = entry.id.replace('exp-', '');
      router.push({ pathname: '/expense/expense', params: { id: cleanId } });
    } else {
      const cleanId = entry.id.replace('inc-', '');
      router.push({ pathname: '/expense/income', params: { id: cleanId } });
    }
  }

  const header = (
    <View style={{ paddingTop: 12, gap: 14 }}>
      {/* Horizontal Account Filter Scroller */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        <Chip
          label="All accounts (Net Worth)"
          icon="globe-outline"
          active={selectedAccountId === null}
          onPress={() => setSelectedAccountId(null)}
        />
        {accounts.map((acc) => (
          <Chip
            key={acc.id}
            label={`${acc.name} (${fmtMoney(acc.balance, symbol)})`}
            icon={acc.type === 'bank' ? 'business-outline' : acc.type === 'cash' ? 'cash-outline' : 'stats-chart-outline'}
            active={selectedAccountId === acc.id}
            onPress={() => setSelectedAccountId(acc.id)}
          />
        ))}
      </ScrollView>

      {/* Summary Card */}
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ gap: 2 }}>
          <T size={13} sub>
            {selectedAccount
              ? `${selectedAccount.institution ? `${selectedAccount.institution} · ` : ''}${selectedAccount.name} Statement`
              : 'Total Net Worth Activity (All Sources)'}
          </T>
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T size={32} weight="600" tabular style={{ letterSpacing: -1 }}>
              {summary.netFlow >= 0 ? `+${fmtMoney(summary.netFlow, symbol)}` : fmtMoney(summary.netFlow, symbol)}
            </T>
            {selectedAccount ? (
              <View style={{ alignItems: 'flex-end' }}>
                <T size={12} sub>Current Balance</T>
                <T size={15} weight="600" tabular>{fmtMoney(selectedAccount.balance, symbol)}</T>
              </View>
            ) : null}
          </Row>
        </View>

        <View style={[styles.hairline, { backgroundColor: c.line }]} />

        <Row style={{ gap: 10 }}>
          <View style={[styles.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Row style={{ gap: 4, alignItems: 'center' }}>
              <Ionicons name="arrow-down-circle" size={14} color={c.good} />
              <T size={12} sub>Money In (Comes)</T>
            </Row>
            <T size={16} weight="600" tabular style={{ color: c.good, marginTop: 2 }}>
              +{fmtMoney(summary.totalIn, symbol)}
            </T>
          </View>

          <View style={[styles.statBox, { backgroundColor: c.card, borderColor: c.border }]}>
            <Row style={{ gap: 4, alignItems: 'center' }}>
              <Ionicons name="arrow-up-circle" size={14} color={c.danger} />
              <T size={12} sub>Money Out (Spent)</T>
            </Row>
            <T size={16} weight="600" tabular style={{ color: c.danger, marginTop: 2 }}>
              −{fmtMoney(summary.totalOut, symbol)}
            </T>
          </View>
        </Row>
      </Card>

      {/* Search Bar */}
      <Row style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.sub} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search payee, note, bank or category"
          placeholderTextColor={c.faint}
          returnKeyType="search"
          accessibilityLabel="Search passbook"
          style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 15, color: c.text, paddingVertical: 10 }}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={c.faint} />
          </Pressable>
        ) : null}
      </Row>

      {/* In / Out Flow Segmented */}
      <Segmented options={FLOW_OPTIONS} value={flow} onChange={setFlow} />

      <T size={13} sub>
        {filteredEntries.length} {filteredEntries.length === 1 ? 'transaction' : 'transactions'}
        {selectedAccountId ? ` for ${selectedAccount?.name ?? 'account'}` : ' across all accounts'}
      </T>
    </View>
  );

  return (
    <Screen>
      <TopBar
        title={selectedAccount ? selectedAccount.name : 'Passbook & Net Worth'}
        onBack={() => router.back()}
      />
      <FlatList
        data={dayGroups}
        keyExtractor={(g) => g.date}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        renderItem={({ item: g }) => (
          <View style={{ marginTop: 16 }}>
            {/* Day Header with Day Net */}
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <T size={14} weight="600" sub>{g.heading}</T>
              <Row style={{ gap: 8 }}>
                {g.dayIn > 0 ? (
                  <T size={13} weight="600" tabular style={{ color: c.good }}>
                    +{fmtMoney(g.dayIn, symbol)}
                  </T>
                ) : null}
                {g.dayOut > 0 ? (
                  <T size={13} weight="600" tabular style={{ color: c.danger }}>
                    −{fmtMoney(g.dayOut, symbol)}
                  </T>
                ) : null}
              </Row>
            </Row>

            <ListCard>
              {g.items.map((it, i) => {
                const badge = sourceBadge(it);

                return (
                  <Pressable
                    key={it.id}
                    onPress={() => handleOpenDetail(it)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      borderBottomWidth: i === g.items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: c.line,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Row style={{ gap: 12, alignItems: 'flex-start' }}>
                      <IconDot icon={it.categoryIcon} color={it.categoryColor} size={36} />

                      <View style={{ flex: 1, gap: 2 }}>
                        <T size={15} weight="600" numberOfLines={1}>{it.title}</T>
                        {it.subtitle ? <T size={13} sub numberOfLines={1}>{it.subtitle}</T> : null}

                        {/* Source/Destination badge showing which bank it came from or went to */}
                        <Row style={{ marginTop: 2, alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                          <View
                            style={[
                              styles.sourcePill,
                              {
                                backgroundColor: it.type === 'in' ? `${c.good}15` : c.well,
                                borderColor: it.type === 'in' ? `${c.good}40` : c.border,
                              },
                            ]}
                          >
                            <Ionicons
                              name={it.type === 'in' ? 'arrow-down' : 'arrow-up'}
                              size={11}
                              color={it.type === 'in' ? c.good : c.sub}
                            />
                            <T
                              size={11}
                              weight="500"
                              style={{ color: it.type === 'in' ? c.good : c.sub }}
                            >
                              {badge.label}
                            </T>
                          </View>
                          {it.refundAmount ? (
                            <View style={[styles.sourcePill, { backgroundColor: `${c.warn}15`, borderColor: `${c.warn}40` }]}>
                              <T size={11} weight="500" style={{ color: c.warn }}>
                                Refunded {fmtMoney(it.refundAmount, symbol)}
                              </T>
                            </View>
                          ) : null}
                          {it.reimburseAmount ? (
                            <View style={[styles.sourcePill, { backgroundColor: `${c.good}15`, borderColor: `${c.good}40` }]}>
                              <T size={11} weight="500" style={{ color: c.good }}>
                                Paid back {fmtMoney(it.reimburseAmount, symbol)}
                              </T>
                            </View>
                          ) : null}
                        </Row>
                      </View>

                      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                        <T
                          size={15}
                          weight="600"
                          tabular
                          style={{ color: it.type === 'in' ? c.good : c.text }}
                        >
                          {it.type === 'in' ? `+${fmtMoney(it.amount, symbol)}` : `−${fmtMoney(it.amount, symbol)}`}
                        </T>
                        {it.runningBalance !== undefined ? (
                          <T size={12} sub tabular style={{ color: c.sub, marginTop: 2 }}>
                            {selectedAccountId ? 'Bal: ' : 'Net: '}{fmtMoney(it.runningBalance, symbol)}
                          </T>
                        ) : null}
                      </View>
                    </Row>
                  </Pressable>
                );
              })}
            </ListCard>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Empty
              icon="receipt-outline"
              title="No transactions found"
              hint={
                selectedAccountId
                  ? 'No activity recorded for this account yet.'
                  : 'No transactions recorded across your accounts yet.'
              }
            />
          ) : null
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  statBox: {
    flex: 1,
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
