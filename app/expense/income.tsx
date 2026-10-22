import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
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
import { fromStr, prettyDate, toStr, todayStr } from '@/expense/dates';
import { numerals, radius, useTheme } from '@/expense/theme';
import { Button, Chip, ConfirmDialog, Divider, Field, Header, IconDot, Row, Screen, T } from '@/expense/ui';

type Mode = 'view' | 'edit';
const parseAmt = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;

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
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 32 }}>
          <Header
            title="Income"
            onClose={() => router.back()}
            right={
              <Pressable onPress={() => setMode('edit')} hitSlop={14} accessibilityLabel="Edit" style={{ marginRight: 14 }}>
                <Ionicons name="pencil-outline" size={21} color={c.sub} />
              </Pressable>
            }
          />

          <Row style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
            {cat && <IconDot icon={cat.icon} color={cat.color} size={44} />}
            <View style={{ flex: 1 }}>
              <T size={15} weight="600">{note || cat?.name || ''}</T>
              {note ? <T size={13} sub style={{ marginTop: 2 }}>{cat?.name}</T> : null}
            </View>
          </Row>
          <T size={40} weight="700" tabular style={{ marginTop: 18, letterSpacing: -1, color: c.good }}>+{symbol}{value}</T>

          <Divider style={{ marginTop: 20, marginBottom: 14 }} />

          <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={13.5} sub>Date</T>
            <T size={13.5}>{prettyDate(date)}</T>
          </Row>
          {place.trim().length > 0 && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub>Place</T>
              <Row style={{ gap: 6, alignItems: 'center' }}>
                <Ionicons name="location-outline" size={16} color={c.sub} />
                <T size={13.5} weight="600">{place}</T>
              </Row>
            </Row>
          )}
          {userTag.trim().length > 0 && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub>For user</T>
              <Row style={{ gap: 6, alignItems: 'center' }}>
                <Ionicons name="person-circle-outline" size={16} color={c.sub} />
                <T size={13.5} weight="600">{userTag}</T>
              </Row>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={13.5} sub>Received via</T>
            <T size={13.5}>
              {method}
              {method === 'UPI' && accountId
                ? ` · ${bankAccounts.find((a) => a.id === accountId)?.name ?? ''}`
                : ''}
            </T>
          </Row>
          {notes.trim().length > 0 && (
            <View style={{ marginTop: 14 }}>
              <T size={13} sub style={{ marginBottom: 4 }}>Notes</T>
              <T size={14.5} style={{ lineHeight: 20 }}>{notes}</T>
            </View>
          )}

          <Button title="Edit income" icon="pencil-outline" kind="ghost" onPress={() => setMode('edit')} style={{ marginTop: 24 }} />
          <Button title="Delete income" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 10 }} />
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Header
            title={editId ? 'Edit income' : 'New income'}
            onClose={editId ? () => setMode('view') : () => router.back()}
          />

          <Row style={{ alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 22 }}>
            <T size={34} weight="600" style={{ color: c.good }}>{symbol}</T>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={c.faint}
              keyboardType="decimal-pad"
              autoFocus={!editId}
              style={[{
                flex: 1, fontSize: 44, fontWeight: '700', color: c.text,
                padding: 0, letterSpacing: -1.2,
              }, numerals]}
            />
          </Row>

          <Field
            label="Title (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. October salary"
          />

          <T size={13} sub style={{ marginBottom: 9 }}>Category</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cats.map((k) => (
              <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => setCatId(k.id)} />
            ))}
          </View>

          {isOther && (
            <Field
              label="Name the new category (optional)"
              value={customCat}
              onChangeText={setCustomCat}
              placeholder="e.g. Dividend"
              maxLength={30}
              containerStyle={{ marginTop: 12 }}
            />
          )}

          <PlacePicker value={place} onChange={setPlace} onDraft={setPlaceDraft} />

          <T size={13} sub style={{ marginTop: 16, marginBottom: 9 }}>For user / Tag person (optional)</T>
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
              <Chip
                label="+ Add person"
                active={false}
                onPress={() => setShowNewUserInput(true)}
              />
            )}
          </View>

          {showNewUserInput && (
            <Row style={{ gap: 8, marginTop: 4, marginBottom: 8, alignItems: 'center' }}>
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
                hitSlop={10}
                onPress={() => { setShowNewUserInput(false); setNewUserName(''); }}
                accessibilityLabel="Cancel add person"
              >
                <Ionicons name="close-circle" size={22} color={c.faint} />
              </Pressable>
            </Row>
          )}

          <T size={13} sub style={{ marginTop: 16, marginBottom: 9 }}>Date</T>
          <Pressable
            onPress={() => setShowPicker((s) => !s)}
            style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 14, marginBottom: 16 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={15}>{prettyDate(date)}</T>
              <Ionicons name="calendar-outline" size={18} color={c.sub} />
            </Row>
          </Pressable>
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

          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any extra detail" />

          <T size={13} sub style={{ marginBottom: 9 }}>Received via</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {METHODS.map((m) => (
              <Chip key={m} label={m} active={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>

          {method === 'UPI' ? (
            <View style={{ marginTop: 14 }}>
              <T size={13} sub style={{ marginBottom: 9 }}>Into which bank</T>
              {bankAccounts.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
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
                <Pressable onPress={() => router.push('/expense/net-worth')}>
                  <T size={13} style={{ color: c.accent }}>Add a bank account to track balance ›</T>
                </Pressable>
              )}
            </View>
          ) : null}

          <Button title={editId ? 'Save changes' : 'Add income'} onPress={onSave} disabled={!valid} style={{ marginTop: 22, backgroundColor: valid ? c.good : undefined }} />
          {editId ? <Button title="Delete income" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 10 }} /> : null}
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
