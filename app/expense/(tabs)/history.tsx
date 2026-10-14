import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { listCategories, listExpenses, listIncome, listIncomeCategories, type Category, type ExpenseRow, type IncomeRow } from '@/expense/db';
import { sum } from '@/expense/stats';
import { useTheme } from '@/expense/theme';
import { Chip, Divider, Empty, Field, Row, Screen, T, Title } from '@/expense/ui';
import { ExpenseItem } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';

type Kind = 'all' | 'expense' | 'income';
type Entry = { kind: 'expense'; row: ExpenseRow } | { kind: 'income'; row: IncomeRow };

export default function History() {
  const { c, symbol } = useTheme();
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([]);
  const [expenseCats, setExpenseCats] = useState<Category[]>([]);
  const [incomeCats, setIncomeCats] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [catName, setCatName] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('all');

  const load = useCallback(async () => {
    const [ex, inc, exCats, incCats] = await Promise.all([
      listExpenses(), listIncome(), listCategories(), listIncomeCategories(),
    ]);
    setExpenseRows(ex);
    setIncomeRows(inc);
    setExpenseCats(exCats);
    setIncomeCats(incCats);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visibleCats = kind === 'income' ? incomeCats : kind === 'expense' ? expenseCats : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const entries: Entry[] = [
      ...(kind === 'income' ? [] : expenseRows.map((row): Entry => ({ kind: 'expense', row }))),
      ...(kind === 'expense' ? [] : incomeRows.map((row): Entry => ({ kind: 'income', row }))),
    ];
    return entries
      .filter(({ row }) => {
        if (catName && row.cat_name !== catName) return false;
        if (!needle) return true;
        return (
          row.note.toLowerCase().includes(needle) ||
          row.notes.toLowerCase().includes(needle) ||
          row.cat_name.toLowerCase().includes(needle) ||
          ((row as ExpenseRow).user_tag?.toLowerCase().includes(needle) ?? false) ||
          row.method.toLowerCase().includes(needle) ||
          String(row.amount).includes(needle) ||
          row.date.includes(needle)
        );
      })
      .sort((a, b) => b.row.date.localeCompare(a.row.date));
  }, [expenseRows, incomeRows, q, catName, kind]);

  const expenseTotal = sum(filtered.filter((e) => e.kind === 'expense').map((e) => e.row));
  const incomeTotal = sum(filtered.filter((e) => e.kind === 'income').map((e) => e.row));

  return (
    <Screen>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Title style={{ marginBottom: 14 }}>History</Title>
        <Field value={q} onChangeText={setQ} placeholder="Search titles, categories, amounts" />
      </View>

      <Row style={{ paddingHorizontal: 20, marginBottom: 2 }}>
        {(['all', 'expense', 'income'] as Kind[]).map((k) => (
          <Chip
            key={k}
            label={k === 'all' ? 'All' : k === 'expense' ? 'Expenses' : 'Income'}
            active={kind === k}
            onPress={() => { setKind(k); setCatName(null); }}
          />
        ))}
      </Row>

      {visibleCats.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          style={{ flexGrow: 0 }}
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

      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 }}>
        <T size={13} sub tabular>{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</T>
        <Row style={{ gap: 10 }}>
          {kind !== 'income' && <T size={13} weight="600" tabular>{expenseTotal > 0 ? `-${symbol}${expenseTotal.toLocaleString('en-IN')}` : ''}</T>}
          {kind !== 'expense' && incomeTotal > 0 && (
            <T size={13} weight="600" tabular style={{ color: c.good }}>+{symbol}{incomeTotal.toLocaleString('en-IN')}</T>
          )}
        </Row>
      </Row>
      <Divider style={{ marginHorizontal: 20 }} />

      <FlatList
        data={filtered}
        keyExtractor={(e) => `${e.kind}${e.row.id}`}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        renderItem={({ item }) =>
          item.kind === 'expense'
            ? <ExpenseItem e={item.row} onDeleted={load} />
            : <IncomeItem e={item.row} onDeleted={load} />
        }
        ListEmptyComponent={
          <Empty
            title={expenseRows.length || incomeRows.length ? 'Nothing matches' : 'Nothing yet'}
            hint={expenseRows.length || incomeRows.length ? 'Try a different search or category.' : 'Add your first entry from Home.'}
          />
        }
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}
