import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { categorySpendBetween, listCategories, listExpenses, listIncome, listRecurring, refreshRecurring, type Category, type ExpenseRow, type IncomeRow, type Recurring } from '@/expense/db';
import { categoryBudgetStatus } from '@/expense/budgets';
import { takeBudgetAlert } from '@/expense/budgetAlerts';
import { getBorrowLendSummary, type BorrowLendSummary } from '@/expense/borrowLendDb';
import { getNetWorthSummary, type NetWorthSummary } from '@/expense/accountsDb';
import { todayStr, addDays } from '@/expense/dates';
import { monthsWithData, OVERALL, periodLabel, periodRange, previousMonth, type Period } from '@/expense/period';
import { PeriodPicker } from '@/expense/PeriodPicker';
import { byCategory, fmtMoney, sum } from '@/expense/stats';
import { budgetTone, radius, useTheme, type Colors } from '@/expense/theme';
import { Button, Divider, Empty, Meter, Money, Row, Screen, Section, T } from '@/expense/ui';
import { ExpenseItem } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';
import { ExpenseSyncButton } from '@/components/ExpenseSyncButton';
import { UpcomingBills } from '@/components/UpcomingBills';

/** The pure tone names from budgets.ts, in this zone's colours. */
function budgetToneColor(tone: 'good' | 'warn' | 'over', c: Colors) {
  if (tone === 'over') return c.danger;
  if (tone === 'warn') return c.warn;
  return c.good;
}

type Recent = { kind: 'expense'; row: ExpenseRow } | { kind: 'income'; row: IncomeRow };

export default function Home() {
  const { c, symbol, budget } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [borrowLend, setBorrowLend] = useState<BorrowLendSummary | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthSummary | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [spentPerCat, setSpentPerCat] = useState<Map<string, number>>(new Map());
  const [budgetAlert, setBudgetAlert] = useState<string | null>(null);

  // Derived from the date string rather than a Date object: primitives keep the
  // memoised range referentially stable, which the focus effect depends on.
  const today = todayStr();
  const currentMonth = today.slice(0, 7);
  // Null follows the current month, so leaving the app open across midnight
  // on the 1st rolls over by itself; picking from the drop-down overrides it.
  const [picked, setPicked] = useState<Period | null>(null);
  const period: Period = picked ?? currentMonth;
  const isOverall = period === OVERALL;
  const isCurrentMonth = period === currentMonth;
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  // The period as plain date strings (empty = no limit), like the old month
  // range, so the loader's dependencies are primitives.
  const range = periodRange(period);
  const prev = range ? periodRange(previousMonth(period)) : null;
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  const prevFrom = prev?.from ?? '';
  const prevTo = prev?.to ?? '';

  const [lastMonthTotal, setLastMonthTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    await refreshRecurring();
    const [monthExpenses, monthIncome, allExpenses, allIncome, prevExpenses, recList, blSummary, nwSummary, catList, perCategory] = await Promise.all([
      from ? listExpenses(from, to) : listExpenses(),
      from ? listIncome(from, to) : listIncome(),
      listExpenses(),
      listIncome(),
      prevFrom ? listExpenses(prevFrom, prevTo) : Promise.resolve([] as ExpenseRow[]),
      listRecurring(),
      getBorrowLendSummary().catch(() => null),
      getNetWorthSummary().catch(() => null),
      listCategories(),
      from ? categorySpendBetween(from, to) : Promise.resolve(new Map<string, number>()),
    ]);
    setRows(monthExpenses);
    setIncomeRows(monthIncome);
    setLastMonthTotal(from ? sum(prevExpenses) : null);
    setRecurring(recList);
    setBorrowLend(blSummary);
    setNetWorth(nwSummary);
    setCats(catList);
    setSpentPerCat(perCategory);
    setMonthOptions(monthsWithData([...allExpenses, ...allIncome].map((r) => r.date), todayStr().slice(0, 7)));
    // Left behind by the expense screen when a budget was just crossed.
    setBudgetAlert(await takeBudgetAlert());
    // The latest entries within whatever the page is showing.
    const merged: Recent[] = [
      ...allExpenses.map((row): Recent => ({ kind: 'expense', row })),
      ...allIncome.map((row): Recent => ({ kind: 'income', row })),
    ]
      .filter((r) => !from || (r.row.date >= from && r.row.date <= to))
      .sort((a, b) => b.row.date.localeCompare(a.row.date));
    setRecent(merged.slice(0, 6));
  }, [from, to, prevFrom, prevTo]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = sum(rows);
  const incomeTotal = sum(incomeRows);
  const net = incomeTotal - total;
  const todayTotal = sum(rows.filter((r) => r.date === today));
  const weekTotal = sum(rows.filter((r) => r.date >= addDays(today, -6)));
  const top = byCategory(rows)[0];
  const pct = budget > 0 ? total / budget : 0;
  const tone = budgetTone(pct, c);
  // Only categories with a budget, most-used first (src/expense/budgets.ts).
  const catBudgets = useMemo(() => categoryBudgetStatus(cats, spentPerCat), [cats, spentPerCat]);
  const vsLastMonth = !isOverall && lastMonthTotal !== null && lastMonthTotal > 0
    ? Math.round(((total - lastMonthTotal) / lastMonthTotal) * 100)
    : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }}>
        {/* Left here by the expense screen when a budget was just crossed.
            Tapping it away is the only thing it asks of you. */}
        {budgetAlert !== null && (
          <Pressable
            onPress={() => setBudgetAlert(null)}
            accessibilityRole="button"
            accessibilityLabel={`${budgetAlert}. Tap to dismiss.`}
            style={{
              marginBottom: 14,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              borderLeftWidth: 3,
              borderLeftColor: c.warn,
              backgroundColor: c.card,
            }}
          >
            <T size={13.5} weight="600">{budgetAlert}</T>
          </Pressable>
        )}

        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <PeriodPicker value={period} months={monthOptions.length ? monthOptions : [currentMonth]} currentMonth={currentMonth} onChange={setPicked} />
          <Row style={{ gap: 16, alignItems: 'center' }}>
            <Pressable
              onPress={() => router.push('/expense/net-worth')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Net Worth & Accounts"
            >
              <Ionicons name="wallet-outline" size={21} color={c.sub} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/expense/borrow-lend')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Borrow & Lend"
            >
              <Ionicons name="people-outline" size={21} color={c.sub} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/expense-history')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Expense history"
            >
              <Ionicons name="receipt-outline" size={21} color={c.sub} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/expense-analytics')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Expense analytics"
            >
              <Ionicons name="stats-chart-outline" size={21} color={c.sub} />
            </Pressable>
            <ExpenseSyncButton />
          </Row>
        </Row>
        <T size={48} weight="700" tabular style={{ marginTop: 2, letterSpacing: -1.6 }}>
          {fmtMoney(total, symbol)}
        </T>
        <Row style={{ marginTop: 1 }}>
          <T size={14} sub>{isOverall ? 'spent overall' : isCurrentMonth ? 'spent this month' : `spent in ${periodLabel(period)}`}</T>
          {vsLastMonth !== null && (
            <T size={13} weight="600" style={{ color: vsLastMonth > 0 ? c.danger : c.good, marginLeft: 8 }}>
              {vsLastMonth > 0 ? '↑' : vsLastMonth < 0 ? '↓' : ''} {Math.abs(vsLastMonth)}% vs {isCurrentMonth ? 'last month' : 'month before'}
            </T>
          )}
        </Row>

        {budget > 0 && !isOverall && (
          <View style={{ marginTop: 18 }}>
            <Meter fraction={pct} tone={tone} />
            <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <T size={13} sub tabular>{Math.round(pct * 100)}% of {fmtMoney(budget, symbol)}</T>
              <T size={13} weight="500" tabular style={{ color: tone }}>
                {pct >= 1
                  ? `${fmtMoney(total - budget, symbol)} over`
                  : `${fmtMoney(budget - total, symbol)} left`}
              </T>
            </Row>
          </View>
        )}

        {/* Per-category budgets, tightest first. Categories without one are
            left out entirely — not setting a budget is a choice. */}
        {catBudgets.length > 0 && !isOverall && (
          <View style={{ marginTop: budget > 0 ? 16 : 18, gap: 11 }}>
            {catBudgets.map((k) => (
              <View key={k.id}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                  <Row style={{ gap: 8, flex: 1 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: k.color }} />
                    <T size={13} weight="600" numberOfLines={1}>{k.name}</T>
                  </Row>
                  <T size={12} sub tabular>
                    {fmtMoney(k.spent, symbol)} / {fmtMoney(k.budget, symbol)}
                  </T>
                </Row>
                <Meter fraction={k.fraction} tone={budgetToneColor(k.tone, c)} />
              </View>
            ))}
          </View>
        )}

        <Row style={{ marginTop: 20 }}>
          <View style={{ flex: 1 }}>
            <T size={13} sub>Income</T>
            <T size={18} weight="700" tabular style={{ marginTop: 3, color: c.good }}>+{fmtMoney(incomeTotal, symbol)}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T size={13} sub>Net</T>
            <T size={18} weight="700" tabular style={{ marginTop: 3, color: net >= 0 ? c.good : c.danger }}>
              {net >= 0 ? '+' : ''}{fmtMoney(net, symbol)}
            </T>
          </View>
        </Row>

        {(isCurrentMonth || isOverall) && (
        <Row style={{ marginTop: 20, alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>
            <T size={13} sub>Today</T>
            <Money value={todayTotal} size={21} weight="700" style={{ marginTop: 3 }} />
          </View>
          <View style={{ width: 1, backgroundColor: c.line, marginHorizontal: 18 }} />
          <View style={{ flex: 1 }}>
            <T size={13} sub>Last 7 days</T>
            <Money value={weekTotal} size={21} weight="700" style={{ marginTop: 3 }} />
          </View>
        </Row>
        )}

        {borrowLend && (borrowLend.totalLentActive > 0 || borrowLend.pendingRequestsCount > 0 || borrowLend.totalBorrowedActive > 0) ? (
          <Pressable
            onPress={() => router.push('/expense/borrow-lend')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: c.card,
              borderRadius: 8,
              paddingVertical: 12,
              paddingHorizontal: 14,
              marginTop: 18,
              borderWidth: 1,
              borderColor: c.line,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Row style={{ gap: 12, alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: `${c.good}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="people" size={16} color={c.good} />
              </View>
              <View style={{ flex: 1 }}>
                <Row style={{ alignItems: 'center', gap: 6 }}>
                  <T size={13} weight="600">Borrow & Lend</T>
                  {borrowLend.pendingRequestsCount > 0 && (
                    <View style={{ backgroundColor: '#F59E0B25', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                      <T size={10} weight="700" style={{ color: '#D97706' }}>
                        {borrowLend.pendingRequestsCount} new request{borrowLend.pendingRequestsCount > 1 ? 's' : ''}
                      </T>
                    </View>
                  )}
                </Row>
                <T size={12} sub numberOfLines={1}>
                  {borrowLend.totalLentActive > 0
                    ? `${fmtMoney(borrowLend.totalLentActive, symbol)} owed to you`
                    : borrowLend.totalBorrowedActive > 0
                    ? `You owe ${fmtMoney(borrowLend.totalBorrowedActive, symbol)}`
                    : `${borrowLend.pendingRequestsCount} pending requests`}
                </T>
              </View>
            </Row>
            <Ionicons name="chevron-forward" size={16} color={c.sub} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.push('/expense/net-worth')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: c.card,
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 14,
            marginTop: 14,
            borderWidth: 1,
            borderColor: c.line,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Row style={{ gap: 12, alignItems: 'center', flex: 1 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#3B82F620',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="wallet" size={16} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <T size={13} weight="600">Net Worth & Wealth</T>
                {netWorth && netWorth.accountsCount > 0 && (
                  <T size={14} weight="700" tabular style={{ color: c.good }}>
                    {fmtMoney(netWorth.netWorth, symbol)}
                  </T>
                )}
              </Row>
              <T size={12} sub numberOfLines={1}>
                {netWorth && netWorth.accountsCount > 0
                  ? `Bank: ${fmtMoney(netWorth.bankTotal, symbol)} · Stocks: ${fmtMoney(netWorth.stockTotal, symbol)}${netWorth.totalLent > 0 ? ` · Lent: ${fmtMoney(netWorth.totalLent, symbol)}` : ''}`
                  : 'Add Bank, Stocks, Cash & track total wealth'}
              </T>
            </View>
          </Row>
          <Ionicons name="chevron-forward" size={16} color={c.sub} style={{ marginLeft: 8 }} />
        </Pressable>

        {top && (
          <>
            <Divider style={{ marginTop: 20 }} />
            <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <T size={14} sub>Most spent on</T>
              <Row style={{ gap: 8 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: top.color }} />
                <T size={14} weight="600">{top.name}</T>
                <Money value={top.total} size={14} weight="600" />
              </Row>
            </Row>
          </>
        )}

        <Row style={{ gap: 10, marginTop: 24, alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>
            <Button title="Add expense" icon="add" onPress={() => router.push('/expense/expense')} />
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/expense/expense', params: { scan: '1' } })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 8,
              paddingHorizontal: 16,
              opacity: pressed ? 0.7 : 1,
            })}
            accessibilityRole="button"
            accessibilityLabel="Scan receipt or bill with AI"
          >
            <Ionicons name="camera-outline" size={18} color={c.accent} />
            <T size={13.5} weight="600" style={{ color: c.accent }}>Scan Bill</T>
          </Pressable>
        </Row>
        <Row style={{ justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <Pressable
            onPress={() => router.push('/expense/income')}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="add-circle-outline" size={16} color={c.good} />
            <T size={13.5} weight="600" style={{ color: c.good }}>Add income</T>
          </Pressable>

          <View style={{ width: 1, height: 12, backgroundColor: c.line }} />

          <Pressable
            onPress={() => router.push('/expense/borrow-lend')}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="people-outline" size={16} color={c.sub} />
            <T size={13.5} weight="600" style={{ color: c.sub }}>Borrow & Lend</T>
          </Pressable>
        </Row>

        <UpcomingBills recurring={recurring} onBillPaid={load} />

        <Section title="Recent" right={<T size={14} sub onPress={() => router.push('/expense-history')}>See all</T>} />
        {recent.length === 0 ? (
          <Empty title="Nothing yet" hint="Add an expense or income entry to start tracking." />
        ) : (
          recent.map((r) =>
            r.kind === 'expense'
              ? <ExpenseItem key={`e${r.row.id}`} e={r.row} onDeleted={load} />
              : <IncomeItem key={`i${r.row.id}`} e={r.row} onDeleted={load} />
          )
        )}
      </ScrollView>
    </Screen>
  );
}
