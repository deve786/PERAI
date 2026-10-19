import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { listCategories, listExpenses, type ExpenseRow } from '@/expense/db';
import { addDays, daysBetween, fromStr, monthName, monthRange, prettyRange, toStr, todayStr } from '@/expense/dates';
import { byCategory, fmtMoney, previousRange, sum, trend } from '@/expense/stats';
import { radius, useTheme } from '@/expense/theme';
import { Chip, Divider, Empty, Money, Row, Screen, Section, T, Title } from '@/expense/ui';
import { Bars, RankedCategories } from '@/expense/charts';

type Mode = 'month' | 'range';

export default function Analytics() {
  const { c, symbol } = useTheme();
  const { width } = useWindowDimensions();

  const now = new Date();
  const [mode, setMode] = useState<Mode>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [rangeFrom, setRangeFrom] = useState(addDays(todayStr(), -29));
  const [rangeTo, setRangeTo] = useState(todayStr());
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const { from, to } = mode === 'month' ? monthRange(year, month0) : { from: rangeFrom, to: rangeTo };
  const prev = previousRange(from, to);

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [prevRows, setPrevRows] = useState<ExpenseRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setRows(await listExpenses(from, to));
        setPrevRows(await listExpenses(prev.from, prev.to));
      })();
    }, [from, to, prev.from, prev.to])
  );

  const total = sum(rows);
  const prevTotal = sum(prevRows);
  const span = daysBetween(from, to);
  const cats = useMemo(() => byCategory(rows), [rows]);
  const [catBudgets, setCatBudgets] = useState<Map<string, number>>(new Map());

  // Budget markers on the bars; categories without one simply have no mark.
  useEffect(() => {
    let alive = true;
    listCategories()
      .then((list) => {
        if (!alive) return;
        setCatBudgets(
          new Map(
            list
              .filter((k) => k.monthly_budget !== null && k.monthly_budget > 0)
              .map((k) => [k.name, k.monthly_budget as number])
          )
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const series = useMemo(() => trend(rows, from, to), [rows, from, to]);
  const biggest = useMemo(() => [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5), [rows]);
  const methods = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.method, (m.get(r.method) ?? 0) + r.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const diff = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
  const isCurrentMonth = mode === 'month' && year === now.getFullYear() && month0 === now.getMonth();
  const effectiveDays = isCurrentMonth ? now.getDate() : span;

  function shiftMonth(delta: number) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }}>
        <Title style={{ marginBottom: 14 }}>Analytics</Title>

        <Row>
          <Chip label="By month" active={mode === 'month'} onPress={() => setMode('month')} />
          <Chip label="Custom range" active={mode === 'range'} onPress={() => setMode('range')} />
        </Row>

        {mode === 'month' ? (
          <Row style={{ justifyContent: 'space-between', marginTop: 6, marginBottom: 4 }}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={14} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={22} color={c.text} />
            </Pressable>
            <T size={17} weight="600">{monthName(month0)} {year}</T>
            <Pressable
              onPress={() => shiftMonth(1)}
              hitSlop={14}
              disabled={isCurrentMonth}
              accessibilityLabel="Next month"
              style={{ opacity: isCurrentMonth ? 0.25 : 1 }}
            >
              <Ionicons name="chevron-forward" size={22} color={c.text} />
            </Pressable>
          </Row>
        ) : (
          <View style={{ marginTop: 4 }}>
            <Row style={{ gap: 10 }}>
              {(['from', 'to'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setPicking(picking === k ? null : k)}
                  style={{
                    flex: 1, backgroundColor: c.card, borderWidth: 1,
                    borderColor: picking === k ? c.text : c.line, borderRadius: radius.md, padding: 12,
                  }}
                >
                  <T size={12} sub>{k === 'from' ? 'From' : 'To'}</T>
                  <T weight="600" tabular style={{ marginTop: 2 }}>{k === 'from' ? rangeFrom : rangeTo}</T>
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
            <T size={13} sub style={{ marginTop: 10 }}>{prettyRange(rangeFrom, rangeTo)} · {span} days</T>
          </View>
        )}

        <T size={40} weight="700" tabular style={{ marginTop: 20, letterSpacing: -1.3 }}>
          {fmtMoney(total, symbol)}
        </T>
        {diff !== null ? (
          <T size={14} tabular style={{ color: diff > 0 ? c.danger : c.good, marginTop: 2 }}>
            {diff > 0 ? 'Up' : 'Down'} {Math.abs(Math.round(diff))}% from {fmtMoney(prevTotal, symbol)} last period
          </T>
        ) : (
          <T size={14} sub style={{ marginTop: 2 }}>Nothing spent in the previous period</T>
        )}

        <Row style={{ marginTop: 20, alignItems: 'stretch' }}>
          {[
            { label: 'Daily avg', value: fmtMoney(effectiveDays > 0 ? total / effectiveDays : 0, symbol) },
            { label: 'Entries', value: String(rows.length) },
            { label: 'Avg entry', value: fmtMoney(rows.length ? total / rows.length : 0, symbol) },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={{ width: 1, backgroundColor: c.line, marginHorizontal: 14 }} />}
              <View style={{ flex: 1 }}>
                <T size={12.5} sub>{s.label}</T>
                <T size={17} weight="700" tabular style={{ marginTop: 3 }}>{s.value}</T>
              </View>
            </React.Fragment>
          ))}
        </Row>

        {rows.length === 0 ? (
          <Empty title="Nothing in this period" hint="Pick another month or add an expense." />
        ) : (
          <>
            <Section title="Where it went" />
            <Divider />
            <RankedCategories data={cats} total={total} budgets={catBudgets} />

            <Section title={span <= 45 ? 'Day by day' : span <= 190 ? 'Week by week' : 'Month by month'} />
            <Bars data={series} width={width - 40} />

            <Section title="Largest expenses" />
            <Divider />
            {biggest.map((e) => (
              <Row key={e.id} style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <View style={{ flex: 1 }}>
                  <T size={15} weight="600" numberOfLines={1}>{e.note || e.cat_name}</T>
                  <T size={12.5} sub style={{ marginTop: 2 }}>{e.note ? `${e.cat_name} · ${e.date}` : e.date}</T>
                </View>
                <Money value={e.amount} size={15} weight="600" />
              </Row>
            ))}

            <Section title="How it was paid" />
            <Divider />
            {methods.map(([m, v]) => (
              <Row key={m} style={{ justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <T size={15}>{m}</T>
                <Money value={v} size={15} weight="600" />
              </Row>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
