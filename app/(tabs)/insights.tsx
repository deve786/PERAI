import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Chip } from '@/components/Chip';
import { Donut, DualBars, RankedCounts } from '@/components/InsightCharts';
import { Section } from '@/components/Section';
import { memoryInsights } from '@/insights';
import { useMemories } from '@/useMemories';
import { useTheme } from '@/ThemeContext';
import { SPACE, type Colors } from '@/theme';
import { Bars, RankedCategories } from '@/expense/charts';
import {
  listExpenses,
  listIncome,
  listRecurring,
  type ExpenseRow,
  type IncomeRow,
  type Recurring,
} from '@/expense/db';
import { getBorrowLendSummary, type BorrowLendSummary } from '@/expense/borrowLendDb';
import { addDays, daysBetween, monthName, monthRange, todayStr } from '@/expense/dates';
import { byCategory, fmtMoney, previousRange, sum, trend } from '@/expense/stats';
import { useTheme as useExpenseTheme } from '@/expense/theme';

const PERIODS = ['month', '90 days', 'year', 'all'] as const;
type Period = (typeof PERIODS)[number];

/** The span each period covers, ending today so no empty future days are charted. */
function rangeFor(period: Period, now: Date) {
  const today = todayStr();
  switch (period) {
    case 'month': {
      const { from } = monthRange(now.getFullYear(), now.getMonth());
      return { from, to: today, label: `${monthName(now.getMonth())} ${now.getFullYear()}` };
    }
    case '90 days':
      return { from: addDays(today, -89), to: today, label: 'Last 90 days' };
    case 'year':
      return { from: `${now.getFullYear()}-01-01`, to: today, label: String(now.getFullYear()) };
    case 'all':
      return { from: '2000-01-01', to: today, label: 'Everything recorded' };
  }
}

export default function Insights() {
  const { colors, type } = useTheme();
  const { symbol, budget } = useExpenseTheme();
  const { width } = useWindowDimensions();
  const styles = makeStyles(colors);

  const [period, setPeriod] = useState<Period>('month');
  const now = useMemo(() => new Date(), []);
  const { from, to, label } = useMemo(() => rangeFor(period, now), [period, now]);
  const { from: prevFrom, to: prevTo } = useMemo(() => previousRange(from, to), [from, to]);

  const { memories } = useMemories();

  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<ExpenseRow[]>([]);
  const [income, setIncome] = useState<IncomeRow[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loans, setLoans] = useState<BorrowLendSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, prevRows, incomeRows, recurringRows, loanSummary] = await Promise.all([
        listExpenses(from, to),
        listExpenses(prevFrom, prevTo),
        listIncome(from, to),
        listRecurring(),
        getBorrowLendSummary().catch(() => null),
      ]);
      setExpenses(rows);
      setPrevExpenses(prevRows);
      setIncome(incomeRows);
      setRecurring(recurringRows);
      setLoans(loanSummary);
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
  const chartWidth = width - SPACE.page * 2;

  const categories = useMemo(() => byCategory(expenses), [expenses]);
  const spendSeries = useMemo(() => trend(expenses, from, to), [expenses, from, to]);
  const incomeSeries = useMemo(() => trend(income, from, to), [income, from, to]);
  const biggest = useMemo(
    () => [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [expenses]
  );
  const methods = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of expenses) totals.set(row.method, (totals.get(row.method) ?? 0) + row.amount);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

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

  const typeRows = record.byType.map((row) => ({
    name: row.name.charAt(0).toUpperCase() + row.name.slice(1),
    count: row.count,
  }));

  const nothingYet = expenses.length === 0 && income.length === 0 && record.captured === 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View>
        <Text style={type.display}>Insights</Text>
        <Text style={[type.stamp, styles.subtitle]}>{label.toUpperCase()}</Text>
      </View>

      <View style={styles.chips}>
        {PERIODS.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={period === option}
            onPress={() => setPeriod(option)}
          />
        ))}
      </View>

      {nothingYet ? (
        <Text style={[type.body, styles.quiet]}>
          Nothing recorded in this period yet. Capture something or add an expense, and this
          fills in.
        </Text>
      ) : (
        <>
          {/* ============ OVERVIEW — both halves in four figures ============ */}
          <View style={styles.tiles}>
            <Tile colors={colors} label="CAPTURED" value={String(record.captured)} />
            <Tile colors={colors} label="SPENT" value={fmtMoney(spent, symbol)} />
            <Tile
              colors={colors}
              label="NET"
              value={fmtMoney(net, symbol)}
              tone={net < 0 ? colors.alert : colors.moss}
            />
            <Tile
              colors={colors}
              label="OVERDUE"
              value={String(record.overdue)}
              tone={record.overdue > 0 ? colors.alert : undefined}
            />
          </View>

          {/* ===================== MONEY ===================== */}
          {expenses.length > 0 || income.length > 0 ? (
            <>
              <Section label="MONEY" inset={false}>
                <View style={styles.headlineBlock}>
                  <Text style={[type.figure, styles.headline]}>{fmtMoney(spent, symbol)}</Text>
                  {spendDelta !== null ? (
                    <Text
                      style={[
                        type.fine,
                        { color: spendDelta > 0 ? colors.alert : colors.moss },
                      ]}
                    >
                      {spendDelta > 0 ? 'Up' : 'Down'} {Math.abs(Math.round(spendDelta))}% on the
                      previous {span} days ({fmtMoney(prevSpent, symbol)})
                    </Text>
                  ) : (
                    <Text style={[type.fine, styles.quiet]}>
                      Nothing spent in the previous period
                    </Text>
                  )}
                </View>

                <View style={styles.statRow}>
                  <Stat
                    colors={colors}
                    label="Daily avg"
                    value={fmtMoney(span > 0 ? spent / span : 0, symbol)}
                  />
                  <Stat colors={colors} label="Entries" value={String(expenses.length)} />
                  <Stat
                    colors={colors}
                    label="Avg entry"
                    value={fmtMoney(expenses.length ? spent / expenses.length : 0, symbol)}
                  />
                </View>
              </Section>

              {budgetUsed !== null && period === 'month' ? (
                <Section label="BUDGET" inset={false}>
                  <View style={styles.budgetHead}>
                    <Text style={type.body}>
                      {fmtMoney(spent, symbol)} of {fmtMoney(budget, symbol)}
                    </Text>
                    <Text
                      style={[
                        type.figure,
                        styles.budgetPct,
                        budgetUsed > 1 ? { color: colors.alert } : null,
                      ]}
                    >
                      {Math.round(budgetUsed * 100)}%
                    </Text>
                  </View>
                  <View style={styles.meterTrack}>
                    <View
                      style={[
                        styles.meterFill,
                        {
                          width: `${Math.min(budgetUsed, 1) * 100}%`,
                          backgroundColor: budgetUsed > 1 ? colors.alert : colors.moss,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[type.fine, styles.quiet]}>
                    {budgetUsed > 1
                      ? `${fmtMoney(spent - budget, symbol)} over budget.`
                      : `${fmtMoney(budget - spent, symbol)} left this month.`}
                  </Text>
                </Section>
              ) : null}

              {expenses.length > 0 ? (
                <Section
                  label={span <= 45 ? 'DAY BY DAY' : span <= 190 ? 'WEEK BY WEEK' : 'MONTH BY MONTH'}
                  inset={false}
                >
                  <Bars data={spendSeries} width={chartWidth} />
                </Section>
              ) : null}

              {income.length > 0 ? (
                <Section label="IN AND OUT" inset={false}>
                  <DualBars
                    data={inOutSeries}
                    width={chartWidth}
                    labels={['Income', 'Spending']}
                  />
                  <View style={styles.statRow}>
                    <Stat colors={colors} label="Income" value={fmtMoney(earned, symbol)} />
                    <Stat colors={colors} label="Spent" value={fmtMoney(spent, symbol)} />
                    <Stat
                      colors={colors}
                      label="Saved"
                      value={savingsRate !== null ? `${Math.round(savingsRate * 100)}%` : '—'}
                    />
                  </View>
                </Section>
              ) : null}

              {categories.length > 0 ? (
                <Section label="WHERE IT WENT" inset={false}>
                  <RankedCategories data={categories} total={spent} />
                </Section>
              ) : null}

              {biggest.length > 0 ? (
                <Section label="LARGEST" inset={false}>
                  {biggest.map((row) => (
                    <View key={row.id} style={styles.lineRow}>
                      <View style={styles.lineMain}>
                        <Text style={type.body} numberOfLines={1}>
                          {row.note || row.cat_name}
                        </Text>
                        <Text style={[type.stamp, styles.quiet]}>
                          {row.cat_name.toUpperCase()} · {row.date}
                        </Text>
                      </View>
                      <Text style={[type.figure, styles.lineFigure]}>
                        {fmtMoney(row.amount, symbol)}
                      </Text>
                    </View>
                  ))}
                </Section>
              ) : null}

              {methods.length > 0 ? (
                <Section label="HOW IT WAS PAID" inset={false}>
                  {methods.map(([method, total]) => (
                    <View key={method} style={styles.lineRow}>
                      <Text style={[type.body, styles.lineMain]}>{method}</Text>
                      <Text style={[type.figure, styles.lineFigure]}>
                        {fmtMoney(total, symbol)}
                      </Text>
                    </View>
                  ))}
                </Section>
              ) : null}
            </>
          ) : null}

          {recurring.length > 0 ? (
            <Section label="COMMITTED EVERY MONTH" inset={false}>
              <View style={styles.statRow}>
                <Stat colors={colors} label="Bills" value={String(recurring.length)} />
                <Stat colors={colors} label="Per month" value={fmtMoney(monthlyCommitment, symbol)} />
                <Stat
                  colors={colors}
                  label="Per year"
                  value={fmtMoney(monthlyCommitment * 12, symbol)}
                />
              </View>
            </Section>
          ) : null}

          {loans && (loans.totalLentActive > 0 || loans.totalBorrowedActive > 0) ? (
            <Section label="LENT AND BORROWED" inset={false}>
              <View style={styles.statRow}>
                <Stat colors={colors} label="Owed to you" value={fmtMoney(loans.totalLentActive, symbol)} />
                <Stat
                  colors={colors}
                  label="You owe"
                  value={fmtMoney(loans.totalBorrowedActive, symbol)}
                />
                <Stat
                  colors={colors}
                  label="Net"
                  value={fmtMoney(loans.totalLentActive - loans.totalBorrowedActive, symbol)}
                />
              </View>
            </Section>
          ) : null}

          {/* ===================== RECORD ===================== */}
          {record.captured > 0 ? (
            <>
              <Section label="YOUR RECORD" inset={false}>
                <View style={styles.donutRow}>
                  {record.completionRate !== null ? (
                    <Donut
                      fraction={record.completionRate}
                      figure={`${Math.round(record.completionRate * 100)}%`}
                      caption={`${record.done} of ${record.done + record.open} done`}
                    />
                  ) : null}
                  <View style={styles.donutStats}>
                    <Stat colors={colors} label="Captured" value={String(record.captured)} />
                    <Stat colors={colors} label="Still open" value={String(record.open)} />
                    <Stat
                      colors={colors}
                      label="Day streak"
                      value={record.streak > 0 ? `${record.streak}` : '—'}
                    />
                  </View>
                </View>
              </Section>

              <Section label="WHAT YOU CAPTURED" inset={false}>
                <Bars data={record.perDay} width={chartWidth} />
              </Section>

              {typeRows.length > 0 ? (
                <Section label="BY KIND" inset={false}>
                  <RankedCounts data={typeRows} />
                </Section>
              ) : null}

              {record.byCategory.length > 0 ? (
                <Section label="BY CATEGORY" inset={false}>
                  <RankedCounts data={record.byCategory} />
                </Section>
              ) : null}

              {record.topPeople.length > 0 ? (
                <Section label="WHO COMES UP MOST" inset={false}>
                  <RankedCounts data={record.topPeople} unit="times" />
                </Section>
              ) : null}

              {record.busiestWeekday ? (
                <Section label="WHEN YOU RECORD" inset={false}>
                  <View style={styles.lineRow}>
                    <Text style={[type.body, styles.lineMain]}>Busiest day</Text>
                    <Text style={[type.figure, styles.lineFigure]}>
                      {record.busiestWeekday.name}
                    </Text>
                  </View>
                </Section>
              ) : null}
            </>
          ) : null}

          {record.wishlistOpen > 0 || record.wishlistDone > 0 ? (
            <Section label="LISTS" inset={false}>
              <View style={styles.statRow}>
                <Stat colors={colors} label="Still to do" value={String(record.wishlistOpen)} />
                <Stat colors={colors} label="Ticked off" value={String(record.wishlistDone)} />
                <Stat
                  colors={colors}
                  label="Done"
                  value={
                    record.wishlistOpen + record.wishlistDone > 0
                      ? `${Math.round(
                          (record.wishlistDone / (record.wishlistOpen + record.wishlistDone)) * 100
                        )}%`
                      : '—'
                  }
                />
              </View>
            </Section>
          ) : null}

          {/* ===================== REVIEW ===================== */}
          <Section label="AGAINST THE PERIOD BEFORE" inset={false}>
            <Compare
              colors={colors}
              label="Spending"
              now={fmtMoney(spent, symbol)}
              before={fmtMoney(prevSpent, symbol)}
              delta={spendDelta}
              lowerIsBetter
            />
            <Compare
              colors={colors}
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
              colors={colors}
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
            />
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Tile({
  colors,
  label,
  value,
  tone,
}: {
  colors: Colors;
  label: string;
  value: string;
  tone?: string;
}) {
  const { type } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.tile}>
      <Text style={[type.stamp, styles.quiet]}>{label}</Text>
      <Text style={[type.figure, styles.tileValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function Stat({ colors, label, value }: { colors: Colors; label: string; value: string }) {
  const { type } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.stat}>
      <Text style={[type.stamp, styles.quiet]}>{label.toUpperCase()}</Text>
      <Text style={[type.figure, styles.statValue]}>{value}</Text>
    </View>
  );
}

/** One line of this-period against last, with the direction coloured. */
function Compare({
  colors,
  label,
  now,
  before,
  delta,
  lowerIsBetter = false,
}: {
  colors: Colors;
  label: string;
  now: string;
  before: string;
  delta: number | null;
  lowerIsBetter?: boolean;
}) {
  const { type } = useTheme();
  const styles = makeStyles(colors);
  const good = delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;

  return (
    <View style={styles.lineRow}>
      <View style={styles.lineMain}>
        <Text style={type.body}>{label}</Text>
        <Text style={[type.stamp, styles.quiet]}>WAS {before.toUpperCase()}</Text>
      </View>
      <View style={styles.compareRight}>
        <Text style={[type.figure, styles.lineFigure]}>{now}</Text>
        {delta !== null ? (
          <Text
            style={[
              type.stamp,
              { color: good ? colors.moss : colors.alert },
            ]}
          >
            {delta > 0 ? '+' : ''}
            {Math.round(delta)}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: {
      padding: SPACE.page,
      paddingTop: 52,
      paddingBottom: 48,
      gap: 22,
    },
    subtitle: { color: colors.mist, marginTop: 3 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    quiet: { color: colors.mist },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: {
      flexGrow: 1,
      flexBasis: '44%',
      gap: 3,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    tileValue: { fontSize: 21, color: colors.ink },
    headlineBlock: { gap: 3, paddingVertical: 4 },
    headline: { fontSize: 30, color: colors.ink },
    statRow: { flexDirection: 'row', gap: 16, paddingVertical: 10 },
    stat: { flex: 1, gap: 3 },
    statValue: { fontSize: 15, color: colors.ink },
    budgetHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingTop: 4,
      paddingBottom: 8,
    },
    budgetPct: { fontSize: 18, color: colors.ink },
    meterTrack: { height: 5, backgroundColor: colors.rule, overflow: 'hidden' },
    meterFill: { height: 5 },
    lineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    lineMain: { flex: 1, gap: 2 },
    lineFigure: { fontSize: 15, color: colors.ink },
    compareRight: { alignItems: 'flex-end', gap: 2 },
    donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingVertical: 8 },
    donutStats: { flex: 1, gap: 12 },
  });
}
