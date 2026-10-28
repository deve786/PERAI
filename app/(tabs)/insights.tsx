import React, { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Donut, DualBars, RankedCounts } from '@/components/InsightCharts';
import { memoryInsights } from '@/insights';
import { useMemories } from '@/useMemories';
import { RankedCategories } from '@/expense/charts';
import { TrendBars } from '@/components/charts/TrendBars';
import { CalendarHeatmap } from '@/components/charts/CalendarHeatmap';
import { Waterfall } from '@/components/charts/Waterfall';
import { bucketName, bucketTick, monthlyTotals } from '@/charts/chartLogic';
import { useProvideAskContext } from '@/askContextStore';
import {
  listCategories,
  listExpenses,
  listIncome,
  listRecurring,
  type ExpenseRow,
  type IncomeRow,
  type Recurring,
} from '@/expense/db';
import { getBorrowLendSummary, type BorrowLendSummary } from '@/expense/borrowLendDb';
import {
  addDays,
  daysBetween,
  fromStr,
  monthName,
  monthRange,
  prettyDate,
  prettyRange,
  toStr,
  todayStr,
} from '@/expense/dates';
import { byCategory, fmtMoney, net as netOf, previousRange, sum, trend } from '@/expense/stats';
import { radius, useTheme } from '@/expense/theme';
import { Card, Chip, Empty, Meter, Row, Screen, Segmented, T, Title } from '@/expense/ui';

/** '90 days' and 'range' keep their old keys; only the chip labels changed. */
type Period = 'month' | '90 days' | 'year' | 'all' | 'range';

const PERIOD_CHIPS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: '90 days', label: '3 months' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All' },
  { key: 'range', label: 'Custom range' },
];

type Half = 'expense' | 'perai';

const HALVES: { key: Half; label: string }[] = [
  { key: 'expense', label: 'Money' },
  { key: 'perai', label: 'Notes' },
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Plain-language meaning of every figure on the money side. */
const MONEY_GLOSSARY: { term: string; meaning: string }[] = [
  { term: 'Spent', meaning: 'Everything recorded as an expense in this period.' },
  {
    term: 'Net',
    meaning:
      'Income in this period minus what you spent. A negative number means more went out than came in.',
  },
  { term: 'Income', meaning: 'Everything recorded on the Add income screen in this period.' },
  { term: 'Saved', meaning: 'The share of your income you did not spend.' },
  { term: 'Per day', meaning: 'What you spent divided by the number of days in the period.' },
  { term: 'Avg entry', meaning: 'What you spent divided by the number of expense entries.' },
  {
    term: 'Budget',
    meaning: 'Your monthly budget from Settings, against what you spent in that month.',
  },
  {
    term: 'Committed every month',
    meaning: 'Your recurring bills added up — what leaves every month before you decide anything.',
  },
  {
    term: 'Owed to you / You owe',
    meaning: 'Amounts from Borrow & Lend that have not been settled yet.',
  },
];

/** Plain-language meaning of every figure on the notes side. */
const RECORD_GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: 'Captured',
    meaning:
      'Entries you recorded in this period — notes, tasks, reminders, purchases, everything you said or typed.',
  },
  {
    term: 'Done / Still open',
    meaning:
      'Of the tasks, reminders and appointments you captured in this period, how many you have ticked off and how many are left.',
  },
  { term: 'Completed', meaning: 'The share of those that are done.' },
  {
    term: 'Overdue',
    meaning:
      'Tasks, reminders and appointments still open whose date has already passed. This counts everything you have, not just this period.',
  },
  {
    term: 'Day streak',
    meaning: 'How many days in a row, counting back from today, you recorded at least one thing.',
  },
  {
    term: 'Lists',
    meaning:
      'Things to play, watch or buy some day: how many are still waiting, and how many you have ticked off.',
  },
  {
    term: 'Who comes up most',
    meaning: 'The names that appear most often in the entries you captured.',
  },
];

/** The span a period covers. Ranges that include today stop at today, so no empty future days are charted. */
function rangeFor(
  period: Period,
  now: Date,
  year: number,
  month0: number,
  rangeFrom: string,
  rangeTo: string
) {
  const today = todayStr();
  switch (period) {
    case 'month': {
      const { from, to } = monthRange(year, month0);
      return { from, to: to > today ? today : to, label: `${FULL_MONTHS[month0]} ${year}` };
    }
    case '90 days':
      return { from: addDays(today, -89), to: today, label: 'Last 90 days' };
    case 'year':
      return { from: `${now.getFullYear()}-01-01`, to: today, label: String(now.getFullYear()) };
    case 'all':
      return { from: '2000-01-01', to: today, label: 'Everything recorded' };
    case 'range':
      return { from: rangeFrom, to: rangeTo, label: prettyRange(rangeFrom, rangeTo) };
  }
}

export default function Insights() {
  const { c, symbol, budget } = useTheme();
  const { width } = useWindowDimensions();

  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<Period>('month');
  const [half, setHalf] = useState<Half>('expense');
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [rangeFrom, setRangeFrom] = useState(addDays(todayStr(), -29));
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const { from, to, label } = useMemo(
    () => rangeFor(period, now, year, month0, rangeFrom, rangeTo),
    [period, now, year, month0, rangeFrom, rangeTo]
  );
  const { from: prevFrom, to: prevTo } = useMemo(() => previousRange(from, to), [from, to]);
  const isCurrentMonth = year === now.getFullYear() && month0 === now.getMonth();

  const { memories } = useMemories();

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<ExpenseRow[]>([]);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loans, setLoans] = useState<BorrowLendSummary | null>(null);
  const [catBudgets, setCatBudgets] = useState<Map<string, number>>(new Map());
  // Six months of expenses, for the sparkline beside each category.
  const [recentSix, setRecentSix] = useState<ExpenseRow[]>([]);

  const load = useCallback(async () => {
    try {
      const sixFrom = toStr(new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1));
      const [rows, prevRows, incomeRows, recurringRows, loanSummary, cats, sixRows] = await Promise.all([
        listExpenses(from, to),
        listExpenses(prevFrom, prevTo),
        listIncome(from, to),
        listRecurring(),
        getBorrowLendSummary().catch(() => null),
        listCategories().catch(() => []),
        listExpenses(sixFrom, todayStr()),
      ]);
      setRecentSix(sixRows);
      setExpenses(rows);
      setPrevExpenses(prevRows);
      setIncome(incomeRows);
      setRecurring(recurringRows);
      setLoans(loanSummary);
      // Budget markers on the category bars; categories without one have no mark.
      setCatBudgets(
        new Map(
          cats
            .filter((k) => k.monthly_budget !== null && k.monthly_budget > 0)
            .map((k) => [k.name, k.monthly_budget as number])
        )
      );
    } catch (err) {
      console.warn('Could not load insights:', err);
    }
  }, [from, to, prevFrom, prevTo]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const record = useMemo(() => memoryInsights(memories, from, to, now), [memories, from, to, now]);
  const prevRecord = useMemo(
    () => memoryInsights(memories, prevFrom, prevTo, now),
    [memories, prevFrom, prevTo, now]
  );

  const spent = sum(expenses);
  const prevSpent = sum(prevExpenses);
  const earned = sum(income);
  const net = earned - spent;
  const span = daysBetween(from, to);
  // Page padding 20 + card padding 16 + card border, each side.
  const chartWidth = width - 74;

  // A category whose spending was all refunded or paid back cost nothing, and a
  // "₹0 · 0%" row only takes room from the ones that did.
  const categories = useMemo(() => byCategory(expenses).filter((k) => k.total > 0), [expenses]);
  const spendSeries = useMemo(() => trend(expenses, from, to), [expenses, from, to]);
  const incomeSeries = useMemo(() => trend(income, from, to), [income, from, to]);
  // The span before, bucket for bucket, drawn behind this one's bars.
  const prevSpendSeries = useMemo(
    () => trend(prevExpenses, prevFrom, prevTo).map((bucket) => bucket.total),
    [prevExpenses, prevFrom, prevTo]
  );
  const spendPoints = useMemo(
    () => spendSeries.map((bucket) => ({ ...bucket, label: bucketTick(bucket), raw: bucket.label })),
    [spendSeries]
  );

  // Net spend and how many entries, per day, for the calendar.
  const spendByDay = useMemo(() => {
    const days = new Map<string, { value: number; count: number }>();
    for (const row of expenses) {
      const day = days.get(row.date) ?? { value: 0, count: 0 };
      day.value += netOf(row);
      day.count += 1;
      days.set(row.date, day);
    }
    return days;
  }, [expenses]);

  // Six monthly totals per category, oldest first, for the sparklines.
  const categoryTrends = useMemo(() => {
    const byName = new Map<string, { date: string; value: number }[]>();
    for (const row of recentSix) {
      const list = byName.get(row.cat_name) ?? [];
      list.push({ date: row.date, value: netOf(row) });
      byName.set(row.cat_name, list);
    }
    const today = todayStr();
    return new Map([...byName].map(([name, rows]) => [name, monthlyTotals(rows, today, 6)]));
  }, [recentSix]);

  // Ranked and written as what was really spent: an expense that was paid
  // back or refunded is not one of your largest, and was not paid by that
  // method in any sense that matters. Both used the billed amount before.
  const biggest = useMemo(
    () => [...expenses].sort((a, b) => netOf(b) - netOf(a)).filter((row) => netOf(row) > 0).slice(0, 5),
    [expenses]
  );
  const methods = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of expenses) totals.set(row.method, (totals.get(row.method) ?? 0) + netOf(row));
    return [...totals.entries()].filter(([, total]) => total > 0).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  // Notes captured per day, for their calendar.
  const capturedByDay = useMemo(() => {
    const days = new Map<string, { value: number; count: number }>();
    for (const memory of memories) {
      const day = toStr(new Date(memory.createdAt));
      if (day < from || day > to) continue;
      const entry = days.get(day) ?? { value: 0, count: 0 };
      entry.value += 1;
      entry.count += 1;
      days.set(day, entry);
    }
    return days;
  }, [memories, from, to]);
  const capturedPoints = useMemo(
    () => record.perDay.map((bucket) => ({ ...bucket, label: bucketTick(bucket), raw: bucket.label })),
    [record.perDay]
  );

  // The floating Ask button on this screen asks about the period on show.
  useProvideAskContext({ label: label, prefill: `In ${label}, ` });

  const inOutSeries = useMemo(
    () =>
      spendSeries.map((bucket, index) => ({
        label: bucket.label,
        a: incomeSeries[index]?.total ?? 0,
        b: bucket.total,
      })),
    [spendSeries, incomeSeries]
  );

  const monthlyCommitment = sum(recurring);
  const spendDelta = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;
  const savingsRate = earned > 0 ? net / earned : null;
  const budgetUsed = budget > 0 ? spent / budget : null;
  const compareTo =
    period === 'month' ? monthName(new Date(year, month0 - 1, 1).getMonth()) : 'previous period';
  const trendTitle = span <= 45 ? 'Day by day' : span <= 190 ? 'Week by week' : 'Month by month';

  const typeRows = record.byType.map((row) => ({
    name: row.name.charAt(0).toUpperCase() + row.name.slice(1),
    count: row.count,
  }));

  const noMoney = expenses.length === 0 && income.length === 0;
  const noRecord = record.captured === 0;

  function shiftMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>Insights</Title>

        {/* Two halves of one app, read one at a time — the money, or the notes. */}
        <Segmented options={HALVES} value={half} onChange={setHalf} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroller}
          contentContainerStyle={styles.chipRow}
        >
          {PERIOD_CHIPS.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              icon={option.key === 'range' ? 'calendar-outline' : undefined}
              active={period === option.key}
              onPress={() => setPeriod(option.key)}
            />
          ))}
        </ScrollView>

        {period === 'month' ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={styles.navButton}
            >
              <Ionicons name="chevron-back" size={20} color={c.sub} />
            </Pressable>
            <T size={16} weight="600">{label}</T>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={8}
              disabled={isCurrentMonth}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={[styles.navButton, { opacity: isCurrentMonth ? 0.35 : 1 }]}
            >
              <Ionicons name="chevron-forward" size={20} color={c.sub} />
            </Pressable>
          </Row>
        ) : period === 'range' ? (
          <View>
            <Row style={{ gap: 10 }}>
              {(['from', 'to'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setPicking(picking === k ? null : k)}
                  accessibilityRole="button"
                  style={{
                    flex: 1, backgroundColor: c.card, borderWidth: 1,
                    borderColor: picking === k ? c.text : c.border, borderRadius: radius.sm,
                    paddingHorizontal: 14, paddingVertical: 10,
                  }}
                >
                  <T size={13} sub>{k === 'from' ? 'From' : 'To'}</T>
                  <T size={15} weight="600" tabular style={{ marginTop: 2 }}>
                    {prettyDate(k === 'from' ? rangeFrom : rangeTo)}
                  </T>
                </Pressable>
              ))}
            </Row>
            {picking && (
              <DateTimePicker
                value={fromStr(picking === 'from' ? rangeFrom : rangeTo)}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, d) => {
                  const which = picking;
                  if (Platform.OS !== 'ios') setPicking(null);
                  if (!d || !which) return;
                  const s = toStr(d);
                  if (which === 'from') {
                    setRangeFrom(s);
                    if (s > rangeTo) setRangeTo(s);
                  } else {
                    setRangeTo(s);
                    if (s < rangeFrom) setRangeFrom(s);
                  }
                }}
              />
            )}
            <T size={13} sub style={{ marginTop: 8 }}>{label} · {span} days</T>
          </View>
        ) : (
          <T size={16} weight="600" style={{ textAlign: 'center', paddingVertical: 8 }}>{label}</T>
        )}

        {/* ======================== MONEY ======================== */}
        {half === 'expense' ? (
          noMoney ? (
            <Card>
              <Empty
                icon="stats-chart-outline"
                title="Nothing in this period"
                hint="No expenses or income recorded here yet. Pick another period or add an expense."
              />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 12 }}>
                <Row style={{ alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <T size={30} weight="600" tabular style={{ letterSpacing: -1 }}>
                    {fmtMoney(spent, symbol)}
                  </T>
                  {spendDelta !== null ? (
                    <T size={13} weight="600" style={{ color: spendDelta > 0 ? c.danger : c.good }}>
                      {spendDelta > 0 ? '↑' : '↓'} {Math.abs(Math.round(spendDelta))}% vs {compareTo}
                    </T>
                  ) : (
                    <T size={13} sub>Nothing spent the {period === 'month' ? 'month' : 'period'} before</T>
                  )}
                </Row>
                <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                  <Stat label="Income" value={`+${fmtMoney(earned, symbol)}`} tone={c.good} />
                  <Stat label="Net" value={`${net >= 0 ? '+' : ''}${fmtMoney(net, symbol)}`} tone={net < 0 ? c.danger : undefined} />
                  <Stat label="Per day" value={fmtMoney(span > 0 ? spent / span : 0, symbol)} />
                </Row>
                <View style={[styles.hairline, { backgroundColor: c.line }]} />
                <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                  <Stat label="Entries" value={String(expenses.length)} />
                  <Stat label="Avg entry" value={fmtMoney(expenses.length ? spent / expenses.length : 0, symbol)} />
                  <Stat label="Before" value={fmtMoney(prevSpent, symbol)} />
                </Row>
              </Card>

              {categories.length > 0 ? (
                <Block title="Where it went">
                  <RankedCategories data={categories} total={spent} budgets={catBudgets} trends={categoryTrends} />
                  <T size={12} sub>The line beside each is its last six months.</T>
                </Block>
              ) : null}

              {earned > 0 && categories.length > 0 ? (
                <Block title="Where the income went">
                  <Waterfall
                    income={earned}
                    categories={categories.map((k) => ({ name: k.name, total: k.total }))}
                    format={(v) => fmtMoney(Math.abs(v), symbol)}
                  />
                </Block>
              ) : null}

              {expenses.length > 0 ? (
                <Block title={trendTitle}>
                  <TrendBars
                    data={spendPoints}
                    previous={prevSpendSeries}
                    width={chartWidth}
                    format={(v) => fmtMoney(v, symbol)}
                    legend={[label, period === 'month' ? compareTo : 'Period before']}
                    describe={(point) => bucketName(spendSeries.find((s) => s.date === point.date) ?? point)}
                  />
                </Block>
              ) : null}

              {expenses.length > 0 && span <= 400 ? (
                <Block title="Every day">
                  <CalendarHeatmap
                    from={from}
                    to={to}
                    totals={spendByDay}
                    width={chartWidth}
                    format={(v) => fmtMoney(v, symbol)}
                    noun={{ one: "expense", many: "expenses" }}
                  />
                </Block>
              ) : null}

              {biggest.length > 0 ? (
                <Block title="Largest">
                  <View>
                    {biggest.map((row, i) => (
                      <Line
                        key={row.id}
                        title={row.note || row.cat_name}
                        sub={row.note ? `${row.cat_name} · ${prettyDate(row.date)}` : prettyDate(row.date)}
                        value={fmtMoney(netOf(row), symbol)}
                        last={i === biggest.length - 1}
                      />
                    ))}
                  </View>
                </Block>
              ) : null}

              {methods.length > 0 ? (
                <Block title="How it was paid">
                  <View>
                    {methods.map(([method, total], i) => (
                      <Line
                        key={method}
                        title={method}
                        value={fmtMoney(total, symbol)}
                        last={i === methods.length - 1}
                      />
                    ))}
                  </View>
                </Block>
              ) : null}

              {income.length > 0 ? (
                <Block title="In and out">
                  <DualBars data={inOutSeries} width={chartWidth} labels={['Income', 'Spending']} />
                  <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                    <Stat label="Income" value={fmtMoney(earned, symbol)} />
                    <Stat label="Spent" value={fmtMoney(spent, symbol)} />
                    <Stat
                      label="Saved"
                      value={savingsRate !== null ? `${Math.round(savingsRate * 100)}%` : '—'}
                    />
                  </Row>
                </Block>
              ) : null}

              {budgetUsed !== null && period === 'month' ? (
                <Block
                  title="Budget"
                  right={
                    <T size={15} weight="600" tabular style={budgetUsed > 1 ? { color: c.danger } : undefined}>
                      {Math.round(budgetUsed * 100)}%
                    </T>
                  }
                >
                  <T size={15}>
                    {fmtMoney(spent, symbol)} of {fmtMoney(budget, symbol)}
                  </T>
                  <Meter
                    fraction={Math.min(budgetUsed, 1)}
                    tone={budgetUsed > 1 ? c.danger : budgetUsed > 0.8 ? c.warn : c.accent}
                    height={8}
                  />
                  <T size={13} sub>
                    {budgetUsed > 1
                      ? `${fmtMoney(spent - budget, symbol)} over budget.`
                      : isCurrentMonth
                        ? `${fmtMoney(budget - spent, symbol)} left this month.`
                        : `${fmtMoney(budget - spent, symbol)} under budget.`}
                  </T>
                </Block>
              ) : null}

              {recurring.length > 0 ? (
                <Block title="Committed every month">
                  <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                    <Stat label="Bills" value={String(recurring.length)} />
                    <Stat label="Per month" value={fmtMoney(monthlyCommitment, symbol)} />
                    <Stat label="Per year" value={fmtMoney(monthlyCommitment * 12, symbol)} />
                  </Row>
                </Block>
              ) : null}

              {loans && (loans.totalLentActive > 0 || loans.totalBorrowedActive > 0) ? (
                <Block title="Lent and borrowed">
                  <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                    <Stat label="Owed to you" value={fmtMoney(loans.totalLentActive, symbol)} />
                    <Stat label="You owe" value={fmtMoney(loans.totalBorrowedActive, symbol)} />
                    <Stat
                      label="Net"
                      value={fmtMoney(loans.totalLentActive - loans.totalBorrowedActive, symbol)}
                    />
                  </Row>
                </Block>
              ) : null}

              <Glossary entries={MONEY_GLOSSARY} />
            </>
          )
        ) : null}

        {/* ========================= NOTES ========================= */}
        {half === 'perai' ? (
          noRecord ? (
            <Card>
              <Empty
                icon="mic-outline"
                title="Nothing captured in this period"
                hint="Record something on the Record tab and it shows up here."
              />
            </Card>
          ) : (
            <>
              <Card style={{ gap: 12 }}>
                <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                  <Stat label="Captured" value={String(record.captured)} big />
                  <Stat label="Done" value={String(record.done)} big />
                </Row>
                <View style={[styles.hairline, { backgroundColor: c.line }]} />
                <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                  <Stat label="Still open" value={String(record.open)} big />
                  <Stat
                    label="Overdue"
                    value={String(record.overdue)}
                    tone={record.overdue > 0 ? c.danger : undefined}
                    big
                  />
                </Row>
              </Card>

              <Block title="How you are doing">
                <Row style={{ gap: 20 }}>
                  {record.completionRate !== null ? (
                    <Donut
                      fraction={record.completionRate}
                      figure={`${Math.round(record.completionRate * 100)}%`}
                      caption={`${record.done} of ${record.done + record.open} done`}
                    />
                  ) : null}
                  <View style={{ flex: 1, gap: 12 }}>
                    <Stat label="Captured" value={String(record.captured)} />
                    <Stat label="Still open" value={String(record.open)} />
                    <Stat label="Day streak" value={record.streak > 0 ? `${record.streak}` : '—'} />
                  </View>
                </Row>
                <T size={13} sub style={{ lineHeight: 18 }}>
                  The ring is the share of tasks, reminders and appointments captured in this period
                  that you have since ticked off.
                </T>
              </Block>

              <Block title="What you captured">
                <TrendBars
                  data={capturedPoints}
                  previous={prevRecord.perDay.map((bucket) => bucket.total)}
                  width={chartWidth}
                  format={(v) => `${v} ${v === 1 ? 'entry' : 'entries'}`}
                  legend={[label, period === 'month' ? compareTo : 'Period before']}
                  describe={(point) => bucketName(record.perDay.find((b) => b.date === point.date) ?? point)}
                />
              </Block>

              {span <= 400 ? (
                <Block title="Every day">
                  <CalendarHeatmap
                    from={from}
                    to={to}
                    totals={capturedByDay}
                    width={chartWidth}
                    format={(v) => `${v} ${v === 1 ? 'entry' : 'entries'}`}
                    noun={{ one: "entry", many: "entries" }}
                  />
                </Block>
              ) : null}

              {typeRows.length > 0 ? (
                <Block title="By kind">
                  <RankedCounts data={typeRows} />
                </Block>
              ) : null}

              {record.byCategory.length > 0 ? (
                <Block title="By category">
                  <RankedCounts data={record.byCategory} />
                </Block>
              ) : null}

              {record.topPeople.length > 0 ? (
                <Block title="Who comes up most">
                  <RankedCounts data={record.topPeople} unit="times" />
                </Block>
              ) : null}

              {record.busiestWeekday ? (
                <Block title="When you record">
                  <Line title="Busiest day" value={record.busiestWeekday.name} last />
                </Block>
              ) : null}

              {record.wishlistOpen > 0 || record.wishlistDone > 0 ? (
                <Block title="Lists">
                  <Row style={{ alignItems: 'flex-start', gap: 8 }}>
                    <Stat label="Still to do" value={String(record.wishlistOpen)} />
                    <Stat label="Ticked off" value={String(record.wishlistDone)} />
                    <Stat
                      label="Done"
                      value={`${Math.round(
                        (record.wishlistDone / (record.wishlistOpen + record.wishlistDone)) * 100
                      )}%`}
                    />
                  </Row>
                </Block>
              ) : null}

              <Block title="Against the period before">
                <View>
                  <Compare
                    label="Captured"
                    now={`${record.captured}`}
                    before={`${prevRecord.captured}`}
                    delta={
                      prevRecord.captured > 0
                        ? ((record.captured - prevRecord.captured) / prevRecord.captured) * 100
                        : null
                    }
                  />
                  <Compare
                    label="Completed"
                    now={
                      record.completionRate !== null
                        ? `${Math.round(record.completionRate * 100)}%`
                        : '—'
                    }
                    before={
                      prevRecord.completionRate !== null
                        ? `${Math.round(prevRecord.completionRate * 100)}%`
                        : '—'
                    }
                    delta={
                      record.completionRate !== null && prevRecord.completionRate !== null
                        ? (record.completionRate - prevRecord.completionRate) * 100
                        : null
                    }
                    last
                  />
                </View>
              </Block>

              <Glossary entries={RECORD_GLOSSARY} />
            </>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** A white card with a 16 bold heading. */
function Block({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between', gap: 10 }}>
        <T size={16} weight="700" style={{ flex: 1 }}>{title}</T>
        {right}
      </Row>
      {children}
    </Card>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T size={13} sub>{label}</T>
      <T size={big ? 20 : 15} weight="600" tabular numberOfLines={1} style={tone ? { color: tone } : undefined}>
        {value}
      </T>
    </View>
  );
}

/** One row inside a card: text (+ meta line) left, figure right, hairline under all but the last. */
function Line({ title, sub, value, last }: { title: string; sub?: string; value: string; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Row
      style={{
        gap: 12, minHeight: 48, paddingVertical: 10,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15} numberOfLines={1}>{title}</T>
        {sub ? <T size={13} sub numberOfLines={1}>{sub}</T> : null}
      </View>
      <T size={15} weight="600" tabular>{value}</T>
    </Row>
  );
}

/** One line of this period against the last, with the direction coloured. */
function Compare({
  label,
  now,
  before,
  delta,
  lowerIsBetter = false,
  last,
}: {
  label: string;
  now: string;
  before: string;
  delta: number | null;
  lowerIsBetter?: boolean;
  last?: boolean;
}) {
  const { c } = useTheme();
  const good = delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;

  return (
    <Row
      style={{
        gap: 12, minHeight: 52, paddingVertical: 10,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T size={15}>{label}</T>
        <T size={13} sub>Was {before}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <T size={15} weight="600" tabular>{now}</T>
        {delta !== null ? (
          <T size={13} tabular style={{ color: good ? c.good : c.danger }}>
            {delta > 0 ? '+' : ''}
            {Math.round(delta)}%
          </T>
        ) : null}
      </View>
    </Row>
  );
}

/**
 * What every figure above actually counts. Folded away by default — it is
 * there to be read once, not to sit between you and the numbers.
 */
function Glossary({ entries }: { entries: { term: string; meaning: string }[] }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Card style={{ paddingVertical: 0 }}>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({
          minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="help-circle-outline" size={20} color={c.sub} />
        <T size={15} style={{ flex: 1 }}>{open ? 'Hide what these mean' : 'What do these mean?'}</T>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />
      </Pressable>
      {open ? (
        <View style={{ gap: 12, paddingBottom: 16 }}>
          {entries.map((entry) => (
            <View key={entry.term} style={{ gap: 2 }}>
              <T size={15} weight="600">{entry.term}</T>
              <T size={13} sub style={{ lineHeight: 18 }}>{entry.meaning}</T>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12, paddingBottom: 104, gap: 12 },
  chipScroller: { marginHorizontal: -20 },
  chipRow: { paddingHorizontal: 20, paddingTop: 4 },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  hairline: { height: StyleSheet.hairlineWidth },
});
