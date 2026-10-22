import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  METHODS, deleteIncome, findOrCreateIncomeCategory, findOrCreateTaggedUser, getIncome,
  listIncomeCategories, listTaggedUsers, saveIncome, type Category, type TaggedUser,
} from '@/expense/db';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { PlacePicker } from '@/expense/PlacePicker';
import { fromStr, monthName, prettyDate, toStr, todayStr } from '@/expense/dates';
import { fmtMoney } from '@/expense/stats';
import { FONTS, numerals, radius, useTheme } from '@/expense/theme';
import {
  ActionBar, Button, Card, Chip, ConfirmDialog, Field, IconDot, Label, ListCard, ListRow, Row, Screen, Segmented, T,
} from '@/expense/ui';

type Mode = 'view' | 'edit';
const parseAmt = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;

const METHOD_OPTIONS = METHODS.map((m): { key: string; label: string } => ({ key: m, label: m }));
const METHOD_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Cash: 'cash-outline', UPI: 'phone-portrait-outline', Card: 'card-outline', Bank: 'business-outline',
};

/** "Today, 22 Oct" / "Yesterday, 21 Oct" / "20 Oct". */
function longDate(s: string) {
  const p = prettyDate(s);
  if (p !== 'Today' && p !== 'Yesterday') return p;
  const d = fromStr(s);
  return `${p}, ${d.getDate()} ${monthName(d.getMonth())}`;
}

export default function IncomeForm() {
  const { id, mode: modeParam } = useLocalSearchParams<{ id?: string; mode?: string }>();
  const editId = id || undefined;
  const router = useRouter();
  const { c, symbol } = useTheme();

  const [mode, setMode] = useState<Mode>(editId ? (modeParam === 'edit' ? 'edit' : 'view') : 'edit');
  const [cats, setCats] = useState<Category[]>([]);
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<string>('Bank');
  const [bankAccounts, setBankAccounts] = useState<AccountItem[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [userTag, setUserTag] = useState('');
  const [place, setPlace] = useState('');
  const [placeDraft, setPlaceDraft] = useState('');
  const [savedUsers, setSavedUsers] = useState<TaggedUser[]>([]);
  const [showNewUserInput, setShowNewUserInput] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Optional fields fold away; opened by default when editing an entry that already uses them.
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [cs, users, accounts] = await Promise.all([listIncomeCategories(), listTaggedUsers(), listAccounts({ type: 'bank' })]);
      setCats(cs);
      setSavedUsers(users);
      setBankAccounts(accounts);
      if (editId) {
        const e = await getIncome(editId);
        if (e) {
          setAmount(String(e.amount));
          setCatId(e.category_id);
          setDate(e.date);
          setNote(e.note);
          setNotes(e.notes);
          setMethod(e.method);
          setAccountId(e.account_id ?? null);
          if (e.user_tag) setUserTag(e.user_tag);
          if (e.place) setPlace(e.place);
          if (e.place || e.user_tag || e.notes) setMoreOpen(true);
        }
      } else if (cs.length) {
        setCatId(cs[0].id);
      }
    })();
  }, [editId]);

  const value = parseAmt(amount);
  const isOther = cats.find((k) => k.id === catId)?.name === 'Other';
  const valid = !isNaN(value) && value > 0 && catId !== null;
  const cat = cats.find((k) => k.id === catId);
  const otherCat = cats.find((k) => k.name === 'Other');
  const bankName = (bankId: string | null) => (bankId ? bankAccounts.find((a) => a.id === bankId)?.name ?? '' : '');

  async function onSave() {
    if (!valid || catId === null) return;
    const custom = isOther ? customCat.trim() : '';
    const finalCatId = custom ? await findOrCreateIncomeCategory(custom) : catId;
    const finalUserTag = (userTag || newUserName).trim();
    if (finalUserTag) {
      await findOrCreateTaggedUser(finalUserTag);
    }
    await saveIncome({
      id: editId, amount: round2(value), category_id: finalCatId, date,
      note: note.trim(), notes: notes.trim(), method,
      user_tag: finalUserTag,
      place: (place || placeDraft).trim(),
      // Only UPI income is tied to the bank it landed in — switching away
      // from UPI drops the link rather than leaving a stale one behind.
      account_id: method === 'UPI' ? accountId : null,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  async function confirmDelete() {
    if (!editId) return;
    setConfirmingDelete(false);
    await deleteIncome(editId);
    router.back();
  }

  if (mode === 'view') {
    const details: Detail[] = [
      { icon: 'calendar-outline', label: 'Date', value: longDate(date) },
      {
        icon: METHOD_ICONS[method] ?? 'wallet-outline',
        label: 'Received in',
        value: method === 'UPI' && bankName(accountId) ? `${method} · ${bankName(accountId)}` : method,
      },
    ];
    if (place.trim()) details.push({ icon: 'location-outline', label: 'Place', value: place });
    if (userTag.trim()) details.push({ icon: 'person-outline', label: 'Person', value: userTag });
    if (notes.trim()) details.push({ icon: 'document-text-outline', label: 'Notes', value: notes, block: true });

    return (
      <Screen edges={['top', 'bottom']}>
        <ActionBar
          title="Income"
          onClose={() => router.back()}
          actions={[{ label: 'Edit', onPress: () => setMode('edit') }]}
        />
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 16, paddingBottom: 24 }}>
          <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            {cat ? <IconDot icon={cat.icon} color={cat.color} size={56} /> : null}
            <T size={18} weight="600" style={{ textAlign: 'center' }}>{note || cat?.name || ''}</T>
            {note && cat ? (
              <View style={{ backgroundColor: c.well, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                <T size={13} sub>{cat.name}</T>
              </View>
            ) : null}
            <T size={44} weight="600" tabular style={{ marginTop: 6, letterSpacing: -1, color: c.good }}>
              +{fmtMoney(isNaN(value) ? 0 : value, symbol)}
            </T>
          </Card>

          <ListCard style={{ marginTop: 16 }}>
            {details.map((d, i) => <DetailRow key={d.label} {...d} last={i === details.length - 1} />)}
          </ListCard>

          <View style={{ flex: 1, minHeight: 24 }} />
          <Button title="Delete income" icon="trash-outline" kind="danger" onPress={() => setConfirmingDelete(true)} />
        </ScrollView>
        <ConfirmDialog
          visible={confirmingDelete}
          title="Delete this income entry?"
          message="It will be removed from your history."
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ActionBar
        title={editId ? 'Edit income' : 'New income'}
        onCancel={editId ? () => setMode('view') : () => router.back()}
        actions={[{ label: 'Save', onPress: onSave, primary: true, disabled: !valid }]}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <T size={14} sub>Amount received</T>
            <Row style={{ justifyContent: 'center', gap: 10, marginTop: 4, maxWidth: '100%' }}>
              <T size={28} tabular style={{ color: c.good }}>+{symbol}</T>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={c.faint}
                keyboardType="decimal-pad"
                autoFocus={!editId}
                accessibilityLabel="Amount received"
                style={[{
                  fontFamily: FONTS.monoMedium, fontSize: 48, color: c.good,
                  padding: 0, minWidth: 64, maxWidth: 260, textAlign: 'center', letterSpacing: -1.2,
                }, numerals]}
              />
            </Row>
          </Card>

          <Field
            label="Title"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. October salary"
            containerStyle={{ marginTop: 20, marginBottom: 0 }}
          />

          <Label style={{ marginTop: 20 }}>Category</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cats.map((k) => (
              <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => setCatId(k.id)} />
            ))}
            {otherCat && !isOther ? (
              <Pressable
                onPress={() => setCatId(otherCat.id)}
                accessibilityRole="button"
                accessibilityLabel="New category"
                style={({ pressed }) => ({
                  minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, marginBottom: 8,
                  borderWidth: 1, borderStyle: 'dashed', borderColor: c.border,
                  justifyContent: 'center', opacity: pressed ? 0.7 : 1,
                })}
              >
                <T size={14} weight="600" style={{ color: c.accent }}>+ New</T>
              </Pressable>
            ) : null}
          </View>

          {isOther && (
            <Field
              label="Name the new category (optional)"
              value={customCat}
              onChangeText={setCustomCat}
              placeholder="e.g. Dividend"
              maxLength={30}
              containerStyle={{ marginTop: 8, marginBottom: 0 }}
            />
          )}

          <Label style={{ marginTop: 20 }}>Received in</Label>
          <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} />
          {method === 'UPI' ? (
            <View style={{ marginTop: 12 }}>
              {bankAccounts.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                  <T size={14} sub style={{ marginRight: 10, marginBottom: 8 }}>Into</T>
                  {bankAccounts.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.institution ? `${a.name} · ${a.institution}` : a.name}
                      active={accountId === a.id}
                      onPress={() => setAccountId(accountId === a.id ? null : a.id)}
                    />
                  ))}
                </View>
              ) : (
                <Pressable onPress={() => router.push('/expense/net-worth')} hitSlop={8} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
                  <T size={14} weight="600" style={{ color: c.accent }}>Add a bank account to track balance</T>
                </Pressable>
              )}
            </View>
          ) : null}

          <ListCard style={{ marginTop: method === 'UPI' ? 8 : 16 }}>
            <ListRow icon="calendar-outline" iconColor={c.text} label={longDate(date)} onPress={() => setShowPicker((s) => !s)} />
            <ListRow
              icon={moreOpen ? 'remove' : 'add'}
              iconColor={c.text}
              label="More details"
              sub="Place, person, notes"
              onPress={() => setMoreOpen((o) => !o)}
              chevron={false}
              right={<Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />}
              last
            />
          </ListCard>
          {showPicker && (
            <DateTimePicker
              value={fromStr(date)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, d) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (d) setDate(toStr(d));
              }}
            />
          )}

          {moreOpen && (
            <View>
              <PlacePicker value={place} onChange={setPlace} onDraft={setPlaceDraft} />

              <Label style={{ marginTop: 20 }}>Person</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {savedUsers.map((u) => (
                  <Chip
                    key={u.id}
                    label={u.name}
                    icon="person-outline"
                    active={userTag.toLowerCase() === u.name.toLowerCase()}
                    onPress={() => setUserTag(userTag.toLowerCase() === u.name.toLowerCase() ? '' : u.name)}
                  />
                ))}
                {!showNewUserInput && (
                  <Chip label="Add person" icon="add" active={false} onPress={() => setShowNewUserInput(true)} />
                )}
              </View>

              {showNewUserInput && (
                <Row style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <Field
                    value={newUserName}
                    onChangeText={setNewUserName}
                    placeholder="Person name (e.g. Rahul, Mom)"
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                    autoFocus
                  />
                  <Button
                    title="Add"
                    kind="ghost"
                    disabled={!newUserName.trim()}
                    onPress={async () => {
                      const trimmed = newUserName.trim();
                      if (!trimmed) return;
                      await findOrCreateTaggedUser(trimmed);
                      setUserTag(trimmed);
                      if (!savedUsers.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
                        setSavedUsers((prev) => [...prev, { id: trimmed, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)));
                      }
                      setNewUserName('');
                      setShowNewUserInput(false);
                    }}
                  />
                  <Pressable
                    hitSlop={6}
                    onPress={() => { setShowNewUserInput(false); setNewUserName(''); }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel add person"
                    style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                  >
                    <Ionicons name="close" size={20} color={c.sub} />
                  </Pressable>
                </Row>
              )}

              <Field
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Any extra detail"
                multiline
                containerStyle={{ marginTop: 20, marginBottom: 0 }}
              />
            </View>
          )}

          {editId ? (
            <Button title="Delete income" icon="trash-outline" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 28 }} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this income entry?"
        message="It will be removed from your history."
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}

type Detail = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; block?: boolean };

/** A row in the details card: icon, label, value on the right (or below, for notes). */
function DetailRow({ icon, label, value, block, last }: Detail & { last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: block ? 'flex-start' : 'center', gap: 12, minHeight: 52, paddingVertical: 12,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      <Ionicons name={icon} size={20} color={c.sub} />
      {block ? (
        <View style={{ flex: 1 }}>
          <T size={15} sub>{label}</T>
          <T size={15} style={{ marginTop: 4, lineHeight: 21 }}>{value}</T>
        </View>
      ) : (
        <>
          <T size={15} sub>{label}</T>
          <T size={15} weight="500" style={{ flex: 1, textAlign: 'right' }}>{value}</T>
        </>
      )}
    </View>
  );
}
