import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { METHODS, addRecurring, deleteRecurring, listCategories, listRecurring, type Category, type Recurring } from '@/expense/db';
import { FONTS, radius, useTheme } from '@/expense/theme';
import { Button, Card, Chip, ConfirmDialog, Field, Label, ListCard, Money, Row, Screen, Segmented, T, TopBar } from '@/expense/ui';

const METHOD_OPTIONS = METHODS.map((m) => ({ key: m as string, label: m }));

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export default function RecurringScreen() {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const [list, setList] = useState<Recurring[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState('1');
  const [catId, setCatId] = useState<string | null>(null);
  const [method, setMethod] = useState<string>('UPI');
  const [toRemove, setToRemove] = useState<Recurring | null>(null);

  const load = useCallback(async () => setList(await listRecurring()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    listCategories().then((cs) => { setCats(cs); if (cs.length) setCatId(cs[0].id); });
  }, []);

  const amt = parseFloat(amount);
  const d = parseInt(day, 10);
  const valid = !isNaN(amt) && amt > 0 && !isNaN(d) && d >= 1 && d <= 31 && catId !== null;

  const stepDay = (by: number) => {
    const current = isNaN(d) ? 1 : d;
    setDay(String(Math.min(31, Math.max(1, current + by))));
  };

  async function add() {
    if (!valid || catId === null) return;
    await addRecurring({ amount: amt, category_id: catId, note: note.trim(), method, day: d });
    setAmount(''); setNote(''); setDay('1');
    load();
  }

  async function confirmRemove() {
    if (!toRemove) return;
    await deleteRecurring(toRemove.id);
    setToRemove(null);
    load();
  }

  return (
    <Screen>
      <TopBar title="Recurring bills" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {list.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: c.well }]}>
              <Ionicons name="repeat-outline" size={20} color={c.sub} />
            </View>
            <View style={{ flex: 1 }}>
              <T size={15} weight="700">Nothing repeating yet</T>
              <T size={13} sub style={{ lineHeight: 18 }}>
                Rent, subscriptions, EMIs — added for you every month when you open the app.
              </T>
            </View>
          </View>
        ) : (
          <View>
            <ListCard>
              {list.map((r, i) => (
                <Row
                  key={r.id}
                  style={{
                    minHeight: 60, paddingVertical: 10, gap: 12,
                    borderBottomWidth: i === list.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <T size={16} weight="700" numberOfLines={1}>{r.note || r.cat_name}</T>
                    <T size={13} sub style={{ marginTop: 1 }}>{r.cat_name} · day {r.day} · {r.method}</T>
                  </View>
                  <Money value={r.amount} size={15} weight="600" />
                  <Pressable
                    hitSlop={12}
                    accessibilityLabel="Remove"
                    accessibilityRole="button"
                    onPress={() => setToRemove(r)}
                    style={({ pressed }) => [styles.remove, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="trash-outline" size={19} color={c.faint} />
                  </Pressable>
                </Row>
              ))}
            </ListCard>
            <T size={13} sub style={{ marginTop: 8 }}>Added automatically each month when you open the app.</T>
          </View>
        )}

        <Card style={{ gap: 0 }}>
          <T size={17} weight="700" style={{ marginBottom: 14 }}>Add a recurring bill</T>

          <Row style={{ gap: 10, alignItems: 'flex-start' }}>
            <Field
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={`${symbol}0`}
              containerStyle={{ width: 120 }}
              style={styles.money}
            />
            <Field
              label="Title"
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Rent, Netflix"
              containerStyle={{ flex: 1 }}
            />
          </Row>

          <Row style={{ gap: 12, marginBottom: 18 }}>
            <View style={{ flex: 1 }}>
              <T size={14} weight="600">Day of the month</T>
              <T size={13} sub>
                {!isNaN(d) && d >= 1 && d <= 31 ? `Added on the ${ordinal(d)} each month` : 'Pick a day from 1 to 31'}
              </T>
            </View>
            <Row style={[styles.stepper, { borderColor: c.border }]}>
              <Pressable
                onPress={() => stepDay(-1)}
                accessibilityRole="button"
                accessibilityLabel="Earlier day"
                disabled={!isNaN(d) && d <= 1}
                style={({ pressed }) => [styles.stepBtn, { opacity: !isNaN(d) && d <= 1 ? 0.35 : pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="remove" size={20} color={c.text} />
              </Pressable>
              <T size={17} weight="600" tabular style={{ width: 36, textAlign: 'center' }}>{isNaN(d) ? '–' : d}</T>
              <Pressable
                onPress={() => stepDay(1)}
                accessibilityRole="button"
                accessibilityLabel="Later day"
                disabled={!isNaN(d) && d >= 31}
                style={({ pressed }) => [styles.stepBtn, { opacity: !isNaN(d) && d >= 31 ? 0.35 : pressed ? 0.6 : 1 }]}
              >
                <Ionicons name="add" size={20} color={c.text} />
              </Pressable>
            </Row>
          </Row>

          <Label>Category</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
            {cats.map((k) => <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => setCatId(k.id)} />)}
          </View>

          <Label>Paid with</Label>
          <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} />

          <Button title="Add recurring bill" onPress={add} disabled={!valid} style={{ marginTop: 18 }} />
        </Card>
      </ScrollView>
      <ConfirmDialog
        visible={toRemove !== null}
        title="Stop repeating this?"
        message="Entries already added stay in your history."
        confirmLabel="Stop"
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 14 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed',
  },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  remove: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  money: { fontFamily: FONTS.mono, fontSize: 17 },
  stepper: { borderWidth: 1, borderRadius: radius.sm, overflow: 'hidden' },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
