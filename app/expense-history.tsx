import React, { useCallback, useMemo, useState } from 'react';
import { SectionList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { expenseTripLabels, listCategories, listExpenses, listIncome, listIncomeCategories, type Category, type ExpenseRow, type IncomeRow } from '@/expense/db';
import { getAllMemories } from '@/db/queries';
import { todayStr } from '@/expense/dates';
import { monthsWithData, OVERALL, periodRange, type Period } from '@/expense/period';
import { PeriodPicker } from '@/expense/PeriodPicker';
import { fmtMoney, sum } from '@/expense/stats';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Chip, Empty, ListCard, Row, Screen, Segmented, T, TopBar } from '@/expense/ui';
import { dayHeading, ExpenseItem, groupByDate } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';

type Kind = 'all' | 'expense' | 'income';
type Entry = { kind: 'expense'; row: ExpenseRow } | { kind: 'income'; row: IncomeRow };

const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Spent' },
  { key: 'income', label: 'Income' },
];

export default function History() {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseCats, setExpenseCats] = useState<Category[]>([]);
  const [incomeCats, setIncomeCats] = useState<Category[]>([]);
  /** Entry title per expense id, for the trip badge. */
  const [tripFor, setTripFor] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [catName, setCatName] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [period, setPeriod] = useState<Period>(OVERALL);

  const load = useCallback(async () => {
    const [ex, inc, exCats, incCats, links, memories] = await Promise.all([
      listExpenses(), listIncome(), listCategories(), listIncomeCategories(),
      expenseTripLabels(), getAllMemories().catch(() => []),
    ]);
    setExpenseRows(ex);
    setIncomeRows(inc);
    setExpenseCats(exCats);
    setIncomeCats(incCats);

    // The link table knows entry ids; the titles live in the other database,
    // so they are joined here rather than in SQL.
    const titles = new Map(memories.map((m) => [m.id, m.title]));
    setTripFor(
      new Map(
        [...links].flatMap(([expenseId, memoryId]) => {
          const title = titles.get(memoryId);
          return title ? ([[expenseId, title]] as [string, string][]) : [];
        })
      )
    );
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const currentMonth = todayStr().slice(0, 7);
  const monthOptions = useMemo(
    () => monthsWithData([...expenseRows, ...incomeRows].map((r) => r.date), currentMonth),
    [expenseRows, incomeRows, currentMonth]
  );
  const range = periodRange(period);
  const from = range?.from ?? '';
  const to = range?.to ?? '';

  const visibleCats = kind === 'income' ? incomeCats : kind === 'expense' ? expenseCats : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const entries: Entry[] = [
      ...(kind === 'income' ? [] : expenseRows.map((row): Entry => ({ kind: 'expense', row }))),
      ...(kind === 'expense' ? [] : incomeRows.map((row): Entry => ({ kind: 'income', row }))),
    ];
    return entries
      .filter(({ row }) => {
        if (from && (row.date < from || row.date > to)) return false;
        if (catName && row.cat_name !== catName) return false;
        if (!needle) return true;
        return (
          row.note.toLowerCase().includes(needle) ||
          row.notes.toLowerCase().includes(needle) ||
          row.cat_name.toLowerCase().includes(needle) ||
          ((row as ExpenseRow).user_tag?.toLowerCase().includes(needle) ?? false) ||
          (row.place?.toLowerCase().includes(needle) ?? false) ||
          row.method.toLowerCase().includes(needle) ||
          String(row.amount).includes(needle) ||
          row.date.includes(needle)
        );
      })
      .sort((a, b) => b.row.date.localeCompare(a.row.date));
  }, [expenseRows, incomeRows, q, catName, kind, from, to]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const expenseTotal = sum(filtered.filter((e) => e.kind === 'expense').map((e) => e.row));
  const incomeTotal = sum(filtered.filter((e) => e.kind === 'income').map((e) => e.row));
  const hasAny = expenseRows.length > 0 || incomeRows.length > 0;

  const header = (
    <View style={{ paddingTop: 14 }}>
      <Row style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search" size={18} color={c.sub} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search title, category, place, amount"
          placeholderTextColor={c.faint}
          returnKeyType="search"
          accessibilityLabel="Search history"
          style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 16, color: c.text, paddingVertical: 12 }}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={c.faint} />
          </Pressable>
        ) : null}
      </Row>

      <Row style={{ gap: 8, marginTop: 12 }}>
        <Segmented
          options={KINDS}
          value={kind}
          onChange={(k) => { setKind(k); setCatName(null); }}
          style={{ flex: 1 }}
        />
        <PeriodPicker value={period} months={monthOptions} currentMonth={currentMonth} onChange={setPeriod} />
      </Row>

      {visibleCats.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12, marginHorizontal: -20, flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <Chip label="All categories" active={catName === null} onPress={() => setCatName(null)} />
          {visibleCats.map((k) => (
            <Chip
              key={k.id}
              label={k.name}
              color={k.color}
              active={catName === k.name}
              onPress={() => setCatName(catName === k.name ? null : k.name)}
            />
          ))}
        </ScrollView>
      )}

      <T size={14} sub style={{ marginTop: visibleCats.length > 0 ? 4 : 12 }}>
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
        {kind !== 'income' ? (
          <>
            {' · spent '}
            <T size={14} weight="600" tabular>{fmtMoney(expenseTotal, symbol)}</T>
          </>
        ) : null}
        {kind !== 'expense' ? (
          <>
            {' · earned '}
            <T size={14} weight="600" tabular style={{ color: c.good }}>{fmtMoney(incomeTotal, symbol)}</T>
          </>
        ) : null}
      </T>
    </View>
  );

  return (
    <Screen>
      <TopBar
        title="History"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={() => router.push('/expense/passbook' as any)}
            accessibilityRole="button"
            accessibilityLabel="Open bank passbook and net worth history"
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: c.accentSoft,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="receipt-outline" size={15} color={c.accent} />
            <T size={13} weight="600" style={{ color: c.accent }}>Passbook</T>
          </Pressable>
        }
      />
      {/* Each day's heading and totals stay pinned while its entries scroll
          under them, so a long day never leaves you guessing which it was. */}
      <SectionList
        sections={groups.map((g) => ({ key: g.date, data: [g] }))}
        keyExtractor={(g) => g.date}
        stickySectionHeadersEnabled
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        renderSectionHeader={({ section }) => {
          const g = section.data[0];
          const dayExpenses = g.items.filter((e) => e.kind === 'expense').map((e) => e.row);
          const dayIncomes = g.items.filter((e) => e.kind === 'income').map((e) => e.row);
          const daySpent = sum(dayExpenses);
          const dayEarned = sum(dayIncomes);

          return (
            <View style={{ paddingTop: 16, paddingBottom: 6, backgroundColor: c.bg }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <T size={14} weight="600" sub>{dayHeading(g.date)}</T>
                {kind === 'expense' ? (
                  daySpent > 0 ? (
                    <T size={13} weight="600" tabular style={{ color: c.sub }}>
                      {fmtMoney(daySpent, symbol)}
                    </T>
                  ) : null
                ) : kind === 'income' ? (
                  dayEarned > 0 ? (
                    <T size={13} weight="600" tabular style={{ color: c.good }}>
                      +{fmtMoney(dayEarned, symbol)}
                    </T>
                  ) : null
                ) : (
                  <Row style={{ gap: 8 }}>
                    {daySpent > 0 ? (
                      <T size={13} weight="600" tabular style={{ color: c.sub }}>
                        {fmtMoney(daySpent, symbol)}
                      </T>
                    ) : null}
                    {dayEarned > 0 ? (
                      <T size={13} weight="600" tabular style={{ color: c.good }}>
                        +{fmtMoney(dayEarned, symbol)}
                      </T>
                    ) : null}
                  </Row>
                )}
              </Row>
            </View>
          );
        }}
        renderItem={({ item: g }) => (
          <ListCard>
            {g.items.map((e, i) =>
              e.kind === 'expense'
                ? <ExpenseItem key={`e${e.row.id}`} e={e.row} showDate={false} onDeleted={load} trip={tripFor.get(e.row.id)} last={i === g.items.length - 1} />
                : <IncomeItem key={`i${e.row.id}`} e={e.row} showDate={false} onDeleted={load} last={i === g.items.length - 1} />
            )}
          </ListCard>
        )}
        ListEmptyComponent={
          <Empty
            icon={hasAny ? 'search-outline' : 'receipt-outline'}
            title={hasAny ? 'Nothing matches' : 'Nothing yet'}
            hint={hasAny ? 'Try a different search, category or month.' : 'Add your first entry from the Money tab.'}
          />
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
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
});
