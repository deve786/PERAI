import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { METHODS, addRecurring, deleteRecurring, listCategories, listRecurring, type Category, type Recurring } from '@/expense/db';
import { useTheme } from '@/expense/theme';
import { Button, Chip, ConfirmDialog, Divider, Empty, Field, Header, Money, Row, Screen, Section, T } from '@/expense/ui';

export default function RecurringScreen() {
  const { c } = useTheme();
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
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Header
          title="Recurring"
          subtitle="Added automatically each month when you open the app."
          onClose={() => router.back()}
        />

        {list.length === 0 ? (
          <Empty title="Nothing repeating yet" hint="Add rent, subscriptions, or any fixed monthly cost." />
        ) : (
          <>
            <Divider />
            {list.map((r) => (
              <Row key={r.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <View style={{ flex: 1 }}>
                  <T size={15} weight="600">{r.note || r.cat_name}</T>
                  <T size={12.5} sub style={{ marginTop: 2 }}>{r.cat_name} · day {r.day} · {r.method}</T>
                </View>
                <Money value={r.amount} size={15} weight="600" style={{ marginRight: 14 }} />
                <Pressable hitSlop={12} accessibilityLabel="Remove" onPress={() => setToRemove(r)}>
                  <Ionicons name="trash-outline" size={19} color={c.faint} />
                </Pressable>
              </Row>
            ))}
          </>
        )}

        <Section title="Add a recurring expense" />
        <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Field label="Title (optional)" value={note} onChangeText={setNote} placeholder="e.g. Rent, Netflix" />
        <Field label="Day of the month" value={day} onChangeText={setDay} keyboardType="number-pad" placeholder="1" />

        <T size={13} sub style={{ marginBottom: 9 }}>Category</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cats.map((k) => <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => setCatId(k.id)} />)}
        </View>

        <T size={13} sub style={{ marginTop: 14, marginBottom: 9 }}>Paid with</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {METHODS.map((m) => <Chip key={m} label={m} active={method === m} onPress={() => setMethod(m)} />)}
        </View>

        <Button title="Add recurring" onPress={add} disabled={!valid} style={{ marginTop: 18 }} />
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
