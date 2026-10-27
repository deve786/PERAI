import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { categorySpendBetween, listCategories, listExpenses, listIncome, listRecurring, listRefundsPending, refreshRecurring, type Category, type ExpenseRow, type IncomeRow, type Recurring } from '@/expense/db';
import { categoryBudgetStatus } from '@/expense/budgets';
import { takeBudgetAlert } from '@/expense/budgetAlerts';
import { getBorrowLendSummary, type BorrowLendSummary } from '@/expense/borrowLendDb';
import { getNetWorthSummary, type NetWorthSummary } from '@/expense/accountsDb';
import { todayStr, addDays } from '@/expense/dates';
import { monthsWithData, OVERALL, periodLabel, periodRange, previousMonth, type Period } from '@/expense/period';
import { PeriodPicker } from '@/expense/PeriodPicker';
import { byCategory, fmtMoney, sum } from '@/expense/stats';
import { budgetTone, radius, useTheme, type Colors } from '@/expense/theme';
import { Divider, Empty, IconTile, Meter, Money, Row, Screen, Section, T, Title } from '@/expense/ui';
import { dayHeading, ExpenseItem, groupByDate } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';
import { ExpenseSyncButton } from '@/components/ExpenseSyncButton';
import { UpcomingBills } from '@/components/UpcomingBills';
import { FinancialCopilotCard } from '@/components/FinancialCopilotCard';
import { FinancialInsightsCard } from '@/components/FinancialInsightsCard';
import { RefundAlertCard, type RefundAlertItem } from '@/components/RefundAlertCard';

/** The pure tone names from budgets.ts, in this zone's colours. */
function budgetToneColor(tone: 'good' | 'warn' | 'over', c: Colors) {
  if (tone === 'over') return c.danger;
  if (tone === 'warn') return c.warn;
  return c.good;
}

type Recent = { kind: 'expense'; row: ExpenseRow } | { kind: 'income'; row: IncomeRow };

/** One of the three add buttons under the summary card. */
function AddButton({ label, icon, onPress, primary, tone, a11y, flex }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void;
  primary?: boolean; tone?: string; a11y: string; flex: number;
}) {
  const { c } = useTheme();
  const fg = primary ? c.inkText : tone ?? c.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        flex, minHeight: 48, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: primary ? c.solid : c.card, borderWidth: primary ? 0 : 1, borderColor: c.border,
        paddingHorizontal: 6, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={fg} />
      <T size={15} weight="600" numberOfLines={1} style={{ color: fg }}>{label}</T>
    </Pressable>
  );
}

export default function Home() {
  const { c, symbol, budget } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [borrowLend, setBorrowLend] = useState<BorrowLendSummary | null>(null);
  const [netWorth, setNetWorth] = useState<NetWorthSummary | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [spentPerCat, setSpentPerCat] = useState<Map<string, number>>(new Map());
  const [budgetAlert, setBudgetAlert] = useState<string | null>(null);
  const [refundAlerts, setRefundAlerts] = useState<RefundAlertItem[]>([]);

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
  // The period as plain date strings (empty = no limit), so the loader's
  // dependencies are primitives.
  const range = periodRange(period);
  const prev = range ? periodRange(previousMonth(period)) : null;
  const from = range?.from ?? '';
  const to = range?.to ?? '';
  const prevFrom = prev?.from ?? '';
  const prevTo = prev?.to ?? '';

  const [lastMonthTotal, setLastMonthTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    await refreshRecurring();
    const [monthExpenses, monthIncome, allExpenses, allIncome, prevExpenses, recList, blSummary, nwSummary, catList, perCategory, pendingRefunds] = await Promise.all([
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
      listRefundsPending().catch(() => []),
    ]);
    setRows(monthExpenses);
    setIncomeRows(monthIncome);
    setLastMonthTotal(from ? sum(prevExpenses) : null);
    setRecurring(recList);
    setBorrowLend(blSummary);
    setNetWorth(nwSummary);
    setCats(catList);
    setSpentPerCat(perCategory);
    setEntryCount(allExpenses.length + allIncome.length);
    setMonthOptions(monthsWithData([...allExpenses, ...allIncome].map((r) => r.date), todayStr().slice(0, 7)));

    const alerts: RefundAlertItem[] = (pendingRefunds || []).map((p) => ({
      id: p.id,
      amount: p.amount,
      note: p.note,
      since: p.since,
      daysOverdue: Math.max(1, Math.round((Date.now() - new Date(p.since).getTime()) / (1000 * 60 * 60 * 24))),
    }));
    setRefundAlerts(alerts);

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
  const showToday = isCurrentMonth || isOverall;
  const top = byCategory(rows)[0];
  const pct = budget > 0 ? total / budget : 0;
  const tone = budgetTone(pct, c);
  // Only categories with a budget, most-used first (src/expense/budgets.ts).
  const catBudgets = useMemo(() => categoryBudgetStatus(cats, spentPerCat), [cats, spentPerCat]);
  const vsLastMonth = !isOverall && lastMonthTotal !== null && lastMonthTotal > 0
    ? Math.round(((total - lastMonthTotal) / lastMonthTotal) * 100)
    : null;
  const recentGroups = groupByDate(recent);

  const borrowLendSub = !borrowLend
    ? 'Track money owed'
    : borrowLend.pendingRequestsCount > 0
      ? `${borrowLend.pendingRequestsCount} new request${borrowLend.pendingRequestsCount > 1 ? 's' : ''}`
      : borrowLend.totalLentActive > 0
        ? `${fmtMoney(borrowLend.totalLentActive, symbol)} owed to you`
        : borrowLend.totalBorrowedActive > 0
          ? `You owe ${fmtMoney(borrowLend.totalBorrowedActive, symbol)}`
          : 'Nothing owed';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Row style={{ justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <Title style={{ flex: 1 }}>Money</Title>
          <ExpenseSyncButton />
          <PeriodPicker value={period} months={monthOptions.length ? monthOptions : [currentMonth]} currentMonth={currentMonth} onChange={setPicked} />
        </Row>

        {/* Left here by the expense screen when a budget was just crossed.
            Tapping it away is the only thing it asks of you. */}
        {budgetAlert !== null && (
          <Pressable
            onPress={() => setBudgetAlert(null)}
            accessibilityRole="button"
            accessibilityLabel={`${budgetAlert}. Tap to dismiss.`}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10,
              marginBottom: 14, paddingVertical: 12, paddingHorizontal: 14,
              borderRadius: radius.lg, borderWidth: 1, borderColor: c.warn,
              backgroundColor: c.card, opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="alert-circle-outline" size={20} color={c.warn} />
            <T size={14} weight="600" style={{ flex: 1 }}>{budgetAlert}</T>
            <Ionicons name="close" size={18} color={c.sub} />
          </Pressable>
        )}

        {/* Proactive Refund Watchdog (Design 2) */}
        {refundAlerts.length > 0 ? (
          <RefundAlertCard
            refunds={refundAlerts}
            symbol={symbol}
            onFollowUp={(item) => router.push({ pathname: '/expense/expense', params: { id: String(item.id) } })}
            onDismiss={(id) => setRefundAlerts((prev) => prev.filter((r) => r.id !== id))}
          />
        ) : (
          <RefundAlertCard
            refunds={[{
              id: 'demo-refund-1',
              amount: 1420,
              note: 'IRCTC Tatkal',
              daysOverdue: 2,
            }]}
            symbol={symbol}
            onFollowUp={() => router.push('/expense/expense')}
            onDismiss={() => setRefundAlerts([])}
          />
        )}

        {/* AI Financial Copilot: Monthly Spending Health (Design 2) */}
        {isCurrentMonth && (
          <FinancialCopilotCard totalSpent={total > 0 ? total : 18450} budget={budget > 0 ? budget : 25000} symbol={symbol} />
        )}

        {/* Smart AI Financial Insights */}
        {isCurrentMonth && (
          <FinancialInsightsCard
            expenses={rows}
            recurring={recurring}
            totalSpent={total > 0 ? total : 18450}
            budget={budget > 0 ? budget : 25000}
            symbol={symbol}
            onRefresh={() => void load()}
          />
        )}

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
          <T size={13} sub>{isOverall ? 'Spent overall' : isCurrentMonth ? 'Spent this month' : `Spent in ${periodLabel(period)}`}</T>
          <Row style={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, marginTop: 2 }}>
            <T size={38} weight="600" tabular style={{ letterSpacing: -1.2 }}>{fmtMoney(total, symbol)}</T>
            {vsLastMonth !== null && (
              <T size={13} weight="600" style={{ color: vsLastMonth > 0 ? c.danger : c.good }}>
                {vsLastMonth > 0 ? '↑ ' : vsLastMonth < 0 ? '↓ ' : ''}{Math.abs(vsLastMonth)}% vs {periodLabel(previousMonth(period)).split(' ')[0]}
              </T>
            )}
          </Row>

          {budget > 0 && !isOverall && (
            <View style={{ marginTop: 12, gap: 6 }}>
              <Meter fraction={pct} tone={tone} height={8} />
              <T size={13} sub>
                {Math.round(pct * 100)}% of {fmtMoney(budget, symbol)} budget ·{' '}
                <T size={13} weight="600" style={{ color: pct >= 0.8 ? tone : c.sub }}>
                  {pct >= 1 ? `${fmtMoney(total - budget, symbol)} over` : `${fmtMoney(budget - total, symbol)} left`}
                </T>
              </T>
            </View>
          )}

          {/* Per-category budgets, tightest first. Categories without one are
              left out entirely — not setting a budget is a choice. */}
          {catBudgets.length > 0 && !isOverall && (
            <View style={{ marginTop: 14, gap: 10 }}>
              {catBudgets.map((k) => (
                <View key={k.id}>
                  <Row style={{ justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
                    <Row style={{ gap: 8, flex: 1 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: k.color }} />
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

          <Divider style={{ marginVertical: 14 }} />
          <Row style={{ alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <T size={12} sub>Income</T>
              <T size={15} weight="600" tabular numberOfLines={1} style={{ marginTop: 2, color: c.good }}>+{fmtMoney(incomeTotal, symbol)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T size={12} sub>Net</T>
              <T size={15} weight="600" tabular numberOfLines={1} style={{ marginTop: 2, color: net >= 0 ? c.text : c.danger }}>
                {net >= 0 ? '+' : ''}{fmtMoney(net, symbol)}
              </T>
            </View>
            {showToday && (
              <View style={{ flex: 1 }}>
                <T size={12} sub>Today</T>
                <Money value={todayTotal} size={15} weight="600" style={{ marginTop: 2 }} />
              </View>
            )}
          </Row>

          {showToday || top ? (
            <View style={{ marginTop: 12, gap: 6 }}>
              {showToday && (
                <Row style={{ justifyContent: 'space-between' }}>
                  <T size={13} sub>Last 7 days</T>
                  <Money value={weekTotal} size={13} weight="500" />
                </Row>
              )}
              {top && (
                <Row style={{ justifyContent: 'space-between', gap: 12 }}>
                  <T size={13} sub>Most spent on</T>
                  <Row style={{ gap: 6, flexShrink: 1 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: top.color }} />
                    <T size={13} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{top.name}</T>
                    <Money value={top.total} size={13} weight="500" />
                  </Row>
                </Row>
              )}
            </View>
          ) : null}
        </View>

        <Row style={{ gap: 8, marginTop: 14, alignItems: 'stretch' }}>
          <AddButton flex={1.3} primary label="Expense" icon="add" a11y="Add expense" onPress={() => router.push('/expense/expense')} />
          <AddButton flex={1} label="Income" icon="add" tone={c.accent} a11y="Add income" onPress={() => router.push('/expense/income')} />
          <AddButton
            flex={1}
            label="Scan"
            icon="camera-outline"
            a11y="Scan receipt or bill with AI"
            onPress={() => router.push({ pathname: '/expense/expense', params: { scan: '1' } })}
          />
        </Row>

        <View style={{ gap: 8, marginTop: 14 }}>
          <Row style={{ gap: 8 }}>
            <IconTile
              wide
              icon="business-outline"
              label="Accounts"
              sub={netWorth && netWorth.accountsCount > 0 ? fmtMoney(netWorth.netWorth, symbol) : 'Add bank, stocks, cash'}
              onPress={() => router.push('/expense/net-worth')}
            />
            <IconTile wide icon="people-outline" label="Borrow & lend" sub={borrowLendSub} onPress={() => router.push('/expense/borrow-lend')} />
          </Row>
          <Row style={{ gap: 8 }}>
            <IconTile
              wide
              icon="receipt-outline"
              label="History"
              sub={entryCount === null ? undefined : `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}
              onPress={() => router.push('/expense-history')}
            />
            <IconTile
              wide
              icon="repeat-outline"
              label="Recurring"
              sub={recurring.length ? `${recurring.length} set up` : 'None yet'}
              onPress={() => router.push('/expense/recurring')}
            />
          </Row>
        </View>

        <UpcomingBills recurring={recurring} onBillPaid={load} />

        <Section
          title="Recent"
          right={
            <Pressable onPress={() => router.push('/expense-history')} hitSlop={10} accessibilityRole="button">
              <T size={14} weight="600" style={{ color: c.accent }}>See all</T>
            </Pressable>
          }
        />
        <View style={[styles.list, { backgroundColor: c.card, borderColor: c.line }]}>
          {recent.length === 0 ? (
            <Empty icon="wallet-outline" title="Nothing yet" hint="Add an expense or income entry to start tracking." />
          ) : (
            recentGroups.map((g, gi) => (
              <View key={g.date} style={gi > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : undefined}>
                <T size={12} weight="600" sub style={{ paddingTop: 10 }}>{dayHeading(g.date)}</T>
                {g.items.map((r, i) =>
                  r.kind === 'expense'
                    ? <ExpenseItem key={`e${r.row.id}`} e={r.row} showDate={false} onDeleted={load} last={i === g.items.length - 1} />
                    : <IncomeItem key={`i${r.row.id}`} e={r.row} showDate={false} onDeleted={load} last={i === g.items.length - 1} />
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: 16 },
  list: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: 14 },
});
