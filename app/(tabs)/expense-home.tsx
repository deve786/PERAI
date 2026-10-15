import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { listExpenses, listIncome, refreshRecurring, type ExpenseRow, type IncomeRow } from '@/expense/db';
import { monthName, monthRange, todayStr, addDays } from '@/expense/dates';
import { byCategory, fmtMoney, sum } from '@/expense/stats';
import { budgetTone, useTheme } from '@/expense/theme';
import { Button, Divider, Empty, Meter, Money, Row, Screen, Section, T } from '@/expense/ui';
import { ExpenseItem } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';
import { ExpenseSyncButton } from '@/components/ExpenseSyncButton';

type Recent = { kind: 'expense'; row: ExpenseRow } | { kind: 'income'; row: IncomeRow };

export default function Home() {
  const { c, symbol, budget } = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);

  // Derived from the date string rather than a Date object: primitives keep the
  // memoised range referentially stable, which the focus effect depends on.
  const today = todayStr();
  const year = Number(today.slice(0, 4));
  const month0 = Number(today.slice(5, 7)) - 1;
  const { from, to } = useMemo(() => monthRange(year, month0), [year, month0]);

  const [lastMonthTotal, setLastMonthTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    await refreshRecurring();
    const prevMonth0 = month0 === 0 ? 11 : month0 - 1;
    const prevYear = month0 === 0 ? year - 1 : year;
    const prevRange = monthRange(prevYear, prevMonth0);
    const [monthExpenses, monthIncome, allExpenses, allIncome, prevExpenses] = await Promise.all([
      listExpenses(from, to),
      listIncome(from, to),
      listExpenses(),
      listIncome(),
      listExpenses(prevRange.from, prevRange.to),
    ]);
    setRows(monthExpenses);
    setIncomeRows(monthIncome);
    setLastMonthTotal(sum(prevExpenses));
    const merged: Recent[] = [
      ...allExpenses.map((row): Recent => ({ kind: 'expense', row })),
      ...allIncome.map((row): Recent => ({ kind: 'income', row })),
    ].sort((a, b) => b.row.date.localeCompare(a.row.date));
    setRecent(merged.slice(0, 6));
  }, [from, to, month0, year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total = sum(rows);
  const incomeTotal = sum(incomeRows);
  const net = incomeTotal - total;
  const todayTotal = sum(rows.filter((r) => r.date === today));
  const weekTotal = sum(rows.filter((r) => r.date >= addDays(today, -6)));
  const top = byCategory(rows)[0];
  const pct = budget > 0 ? total / budget : 0;
  const tone = budgetTone(pct, c);
  const vsLastMonth = lastMonthTotal !== null && lastMonthTotal > 0
    ? Math.round(((total - lastMonthTotal) / lastMonthTotal) * 100)
    : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={14} sub>{monthName(month0)} {year}</T>
          <Row style={{ gap: 16, alignItems: 'center' }}>
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
          <T size={14} sub>spent this month</T>
          {vsLastMonth !== null && (
            <T size={13} weight="600" style={{ color: vsLastMonth > 0 ? c.danger : c.good, marginLeft: 8 }}>
              {vsLastMonth > 0 ? '↑' : vsLastMonth < 0 ? '↓' : ''} {Math.abs(vsLastMonth)}% vs last month
            </T>
          )}
        </Row>

        {budget > 0 && (
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

        <Button title="Add expense" icon="add" onPress={() => router.push('/expense/expense')} style={{ marginTop: 24 }} />
        <Pressable
          onPress={() => router.push('/expense/income')}
          hitSlop={8}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            marginTop: 14, opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="add-circle-outline" size={16} color={c.good} />
          <T size={13.5} weight="600" style={{ color: c.good }}>Add income</T>
        </Pressable>

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
