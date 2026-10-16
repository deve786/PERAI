import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { budgetTotals } from '@/expense/budgets';
import { CATEGORY_COLORS, addCategory, deleteCategory, listCategories, setCategoryBudget, type Category } from '@/expense/db';
import { fmtMoney } from '@/expense/stats';
import { radius, useTheme } from '@/expense/theme';
import { Button, ConfirmDialog, Divider, Field, Header, IconDot, Row, Screen, Section, T } from '@/expense/ui';
import { showDialog } from '@/dialogStore';

const ICONS = [
  'cafe-outline', 'fitness-outline', 'airplane-outline', 'school-outline', 'paw-outline',
  'gift-outline', 'phone-portrait-outline', 'construct-outline', 'game-controller-outline', 'cart-outline',
];

export default function Categories() {
  const { c, symbol, budget } = useTheme();
  const router = useRouter();
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  /** Which row is having its budget edited, and what has been typed into it. */
  const [editing, setEditing] = useState<string | null>(null);
  const [budgetText, setBudgetText] = useState('');

  const load = useCallback(async () => setCats(await listCategories()), []);
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
    load();
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Header title="Categories" onClose={() => router.back()} />

        <Divider />
        {cats.map((k) => (
          <View key={k.id} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Row style={{ paddingVertical: 11, gap: 13 }}>
              <IconDot icon={k.icon} color={k.color} />
              <Pressable
                style={{ flex: 1 }}
                onPress={() => startEditing(k)}
                accessibilityLabel={`Set a monthly budget for ${k.name}`}
              >
                <T size={15} weight="600">{k.name}</T>
                <T size={12} sub style={{ marginTop: 2 }}>
                  {k.monthly_budget === null
                    ? 'No budget'
                    : `${fmtMoney(k.monthly_budget, symbol)} a month`}
                </T>
              </Pressable>
              <Pressable onPress={() => remove(k)} hitSlop={12} accessibilityLabel={`Delete ${k.name}`}>
                <Ionicons name="trash-outline" size={19} color={c.faint} />
              </Pressable>
            </Row>

            {editing === k.id && (
              <View style={{ paddingBottom: 12, gap: 10 }}>
                <Field
                  value={budgetText}
                  onChangeText={setBudgetText}
                  placeholder={`Monthly budget in ${symbol}`}
                  keyboardType="numeric"
                  autoFocus
                />
                <Row style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Save" onPress={() => saveBudget(k)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Clear" kind="ghost" onPress={() => clearBudget(k)} />
                  </View>
                </Row>
              </View>
            )}
          </View>
        ))}

        {allocation.allocated > 0 && (
          <T size={13} sub style={{ marginTop: 12 }}>
            {allocation.overAllocated
              ? `Category budgets come to ${fmtMoney(allocation.allocated, symbol)}, more than your ${fmtMoney(allocation.overall, symbol)} monthly budget.`
              : allocation.overall > 0
                ? `${fmtMoney(allocation.unallocated, symbol)} of your ${fmtMoney(allocation.overall, symbol)} budget is unallocated.`
                : `${fmtMoney(allocation.allocated, symbol)} budgeted across categories. No overall budget is set.`}
          </T>
        )}

        <Section title="Add a category" />
        <Field value={name} onChangeText={setName} placeholder="Name" maxLength={30} />

        <T size={13} sub style={{ marginBottom: 10 }}>Icon</T>
        <Row style={{ flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {ICONS.map((i) => (
            <Pressable
              key={i}
              onPress={() => setIcon(i)}
              accessibilityLabel={`Icon ${i}`}
              style={{ borderRadius: radius.md, borderWidth: 2, borderColor: icon === i ? c.text : 'transparent' }}
            >
              <IconDot icon={i} color={color} size={42} />
            </Pressable>
          ))}
        </Row>

        <T size={13} sub style={{ marginBottom: 10 }}>Colour</T>
        <Row style={{ flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          {CATEGORY_COLORS.map((col) => (
            <Pressable
              key={col}
              onPress={() => setColor(col)}
              accessibilityLabel={`Colour ${col}`}
              style={{
                width: 30, height: 30, borderRadius: 15, backgroundColor: col,
                borderWidth: 3, borderColor: color === col ? c.text : 'transparent',
              }}
            />
          ))}
        </Row>

        <Button title="Add category" onPress={add} disabled={!name.trim()} />
        <View style={{ height: 20 }} />
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
