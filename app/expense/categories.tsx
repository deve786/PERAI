import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { budgetTone, budgetTotals } from '@/expense/budgets';
import { CATEGORY_COLORS, addCategory, categorySpendBetween, deleteCategory, listCategories, setCategoryBudget, type Category } from '@/expense/db';
import { monthRange, todayStr } from '@/expense/dates';
import { fmtMoney } from '@/expense/stats';
import { radius, useTheme } from '@/expense/theme';
import { Button, Card, ConfirmDialog, Field, IconDot, Label, ListCard, Meter, PillButton, Row, Screen, T, TopBar } from '@/expense/ui';
import { showDialog } from '@/dialogStore';

const ICONS = [
  'cafe-outline', 'fitness-outline', 'airplane-outline', 'school-outline', 'paw-outline',
  'gift-outline', 'phone-portrait-outline', 'construct-outline', 'game-controller-outline', 'cart-outline',
];

export default function Categories() {
  const { c, symbol, budget } = useTheme();
  const router = useRouter();
  const [cats, setCats] = useState<Category[]>([]);
  const [spent, setSpent] = useState<Map<string, number>>(new Map());
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  /** Which row is open for editing, and the budget typed into it. */
  const [editing, setEditing] = useState<string | null>(null);
  const [budgetText, setBudgetText] = useState('');

  const load = useCallback(async () => {
    setCats(await listCategories());
    // This month's spending, for the "₹240 of ₹3,000" next to each budget.
    const today = todayStr();
    const { from, to } = monthRange(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1);
    setSpent(await categorySpendBetween(from, to).catch(() => new Map<string, number>()));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const allocation = useMemo(() => budgetTotals(cats, budget), [cats, budget]);

  function startEditing(k: Category) {
    setEditing(editing === k.id ? null : k.id);
    setBudgetText(k.monthly_budget === null ? '' : String(k.monthly_budget));
  }

  async function saveBudget(k: Category) {
    const typed = budgetText.trim();
    // Empty means no budget, which is not the same as a budget of nothing.
    if (typed === '') {
      await clearBudget(k);
      return;
    }
    const value = Number(typed);
    if (!Number.isFinite(value) || value < 0) {
      showDialog({
        title: 'That is not a budget',
        message: 'Enter an amount of zero or more, or leave it empty for none.',
      });
      return;
    }
    await setCategoryBudget(k.id, value);
    setEditing(null);
    load();
  }

  async function clearBudget(k: Category) {
    await setCategoryBudget(k.id, null);
    setEditing(null);
    setBudgetText('');
    load();
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    if (cats.some((k) => k.name.toLowerCase() === n.toLowerCase())) {
      showDialog({ title: 'That name is taken', message: 'Pick a different one.' });
      return;
    }
    await addCategory(n, icon, color);
    setName('');
    setAdding(false);
    load();
  }

  function remove(k: Category) {
    if (k.name === 'Other') {
      showDialog({
        title: 'Keep this one',
        message: '"Other" catches expenses from deleted categories.',
      });
      return;
    }
    setToDelete(k);
  }

  async function confirmRemove() {
    if (!toDelete) return;
    await deleteCategory(toDelete.id);
    setToDelete(null);
    setEditing(null);
    load();
  }

  const toneColor = (fraction: number) => {
    const t = budgetTone(fraction);
    return t === 'over' ? c.danger : t === 'warn' ? c.warn : c.accent;
  };

  return (
    <Screen>
      <TopBar
        title="Categories"
        onBack={() => router.back()}
        right={
          <PillButton
            label={adding ? 'Close' : '+ New'}
            tone={adding ? undefined : c.accent}
            onPress={() => setAdding((a) => !a)}
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {adding ? (
          <Card style={{ marginBottom: 14 }}>
            <T size={17} weight="700" style={{ marginBottom: 14 }}>New category</T>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Coffee" maxLength={30} autoFocus />

            <Label>Icon</Label>
            <Row style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {ICONS.map((i) => (
                <Pressable
                  key={i}
                  onPress={() => setIcon(i)}
                  accessibilityLabel={`Icon ${i}`}
                  style={{ borderRadius: radius.pill, borderWidth: 2, borderColor: icon === i ? c.text : 'transparent', padding: 1 }}
                >
                  <IconDot icon={i} color={color} size={40} />
                </Pressable>
              ))}
            </Row>

            <Label>Colour</Label>
            <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
              {CATEGORY_COLORS.map((col) => (
                <Pressable
                  key={col}
                  onPress={() => setColor(col)}
                  accessibilityLabel={`Colour ${col}`}
                  hitSlop={6}
                  style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: col,
                    borderWidth: 3, borderColor: color === col ? c.text : 'transparent',
                  }}
                />
              ))}
            </Row>

            <Button title="Add category" onPress={add} disabled={!name.trim()} />
          </Card>
        ) : null}

        <T size={14} sub style={{ lineHeight: 20, marginBottom: 12 }}>
          Tap one to set a monthly budget or delete it.
        </T>

        <ListCard>
          {cats.map((k, i) => {
            const open = editing === k.id;
            const last = i === cats.length - 1;
            const used = spent.get(k.id) ?? 0;
            const hasBudget = k.monthly_budget !== null && k.monthly_budget > 0;
            return (
              <View
                key={k.id}
                style={{ borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}
              >
                <Pressable
                  onPress={() => startEditing(k)}
                  accessibilityRole="button"
                  accessibilityLabel={`Set a monthly budget for ${k.name}`}
                  accessibilityState={{ expanded: open }}
                  style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <IconDot icon={k.icon} color={k.color} size={38} />
                  {hasBudget ? (
                    <View style={{ flex: 1, gap: 6 }}>
                      <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                        <T size={16} numberOfLines={1} style={{ flexShrink: 1 }}>{k.name}</T>
                        <T size={13} sub>
                          {fmtMoney(used, symbol)} of {fmtMoney(k.monthly_budget as number, symbol)}
                        </T>
                      </Row>
                      <Meter fraction={used / (k.monthly_budget as number)} tone={toneColor(used / (k.monthly_budget as number))} height={5} />
                    </View>
                  ) : (
                    <>
                      <T size={16} numberOfLines={1} style={{ flex: 1 }}>{k.name}</T>
                      <T size={13} sub>
                        {k.monthly_budget === null ? 'Set budget' : `${fmtMoney(k.monthly_budget, symbol)} a month`}
                      </T>
                    </>
                  )}
                  <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={c.faint} />
                </Pressable>

                {open && (
                  <View style={{ paddingBottom: 14 }}>
                    <Field
                      label="Monthly budget"
                      value={budgetText}
                      onChangeText={setBudgetText}
                      placeholder={`Amount in ${symbol}, or empty for none`}
                      keyboardType="numeric"
                      autoFocus
                      containerStyle={{ marginBottom: 10 }}
                    />
                    <Row style={{ gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Button title="Save" onPress={() => saveBudget(k)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="Clear" kind="ghost" onPress={() => clearBudget(k)} />
                      </View>
                    </Row>
                    <Pressable
                      onPress={() => remove(k)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${k.name}`}
                      hitSlop={6}
                      style={({ pressed }) => [styles.delete, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <T size={15} weight="700" style={{ color: c.danger }}>Delete category</T>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ListCard>

        {allocation.allocated > 0 && (
          <T size={13} sub style={{ marginTop: 12, lineHeight: 18 }}>
            {allocation.overAllocated
              ? `Category budgets come to ${fmtMoney(allocation.allocated, symbol)}, more than your ${fmtMoney(allocation.overall, symbol)} monthly budget.`
              : allocation.overall > 0
                ? `${fmtMoney(allocation.unallocated, symbol)} of your ${fmtMoney(allocation.overall, symbol)} budget is unallocated.`
                : `${fmtMoney(allocation.allocated, symbol)} budgeted across categories. No overall budget is set.`}
          </T>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={toDelete !== null}
        title={`Delete ${toDelete?.name}?`}
        message='Its expenses move to "Other".'
        onConfirm={confirmRemove}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 10 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
