import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FONTS, useTheme } from '@/expense/theme';
import { ActionBar, Chip, Field, Label, Segmented, T } from '@/expense/ui';
import { todayStr, addDays, prettyDate, fromStr, toStr } from '@/expense/dates';
import {
  saveBorrowLend,
  deleteBorrowLend,
  type BorrowLendItem,
  type BorrowLendType,
  type BorrowLendStatus,
} from '@/expense/borrowLendDb';
import { listTaggedUsers, type TaggedUser } from '@/expense/db';

const TYPES: { key: BorrowLendType; label: string }[] = [
  { key: 'lent', label: 'I lent' },
  { key: 'request', label: 'Requested' },
  { key: 'borrowed', label: 'I borrowed' },
];

const DUE_OPTIONS = [
  { key: 'none', label: 'No date' },
  { key: 'date', label: 'Has a date' },
] as const;

interface Props {
  visible: boolean;
  item: BorrowLendItem | null;
  initialType?: BorrowLendType;
  onClose: () => void;
  onSaved: () => void;
}

export function BorrowLendModal({
  visible,
  item,
  initialType = 'lent',
  onClose,
  onSaved,
}: Props) {
  const { c } = useTheme();

  const [personName, setPersonName] = useState('');
  const [borrowType, setBorrowType] = useState<BorrowLendType>(initialType);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [hasDueDate, setHasDueDate] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<BorrowLendStatus>('active');
  const [knownUsers, setKnownUsers] = useState<TaggedUser[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listTaggedUsers().then(setKnownUsers).catch(() => {});
  }, [visible]);

  useEffect(() => {
    setShowDatePicker(false);
    setShowDueDatePicker(false);
    if (item) {
      setPersonName(item.person_name);
      setBorrowType(item.type);
      setAmount(String(item.amount));
      setDate(item.date);
      setDueDate(item.due_date);
      setHasDueDate(Boolean(item.due_date));
      setNotes(item.notes);
      setStatus(item.status);
    } else {
      setPersonName('');
      setBorrowType(initialType);
      setAmount('');
      setDate(todayStr());
      setDueDate(null);
      setHasDueDate(false);
      setNotes('');
      setStatus('active');
    }
  }, [item, initialType, visible]);

  const handleSave = async () => {
    const pName = personName.trim();
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (!pName || isNaN(numAmount) || numAmount <= 0) return;

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await saveBorrowLend({
        id: item?.id,
        person_name: pName,
        type: borrowType,
        amount: Math.round(numAmount * 100) / 100,
        date,
        due_date: hasDueDate ? dueDate : null,
        notes: notes.trim(),
        status: item ? status : 'active',
        settled_amount: item?.settled_amount ?? 0,
        settled_at: item?.settled_at ?? null,
      });

      onSaved();
      onClose();
    } catch (err) {
      console.warn('Failed to save borrow/lend entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await deleteBorrowLend(item.id);
      onSaved();
      onClose();
    } catch (err) {
      console.warn('Failed to delete borrow/lend entry:', err);
    }
  };

  const quickDue = (days: number) => {
    setHasDueDate(true);
    setDueDate(addDays(todayStr(), days));
  };

  const today = todayStr();
  const yesterday = addDays(today, -1);
  const canSave = !saving && !!personName.trim() && !!amount.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} onPress={(e) => e.stopPropagation()}>
          <ActionBar
            title={item ? 'Edit entry' : 'Record a loan'}
            onCancel={onClose}
            actions={[{ label: saving ? 'Saving…' : 'Save', primary: true, onPress: handleSave, disabled: !canSave }]}
          />

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Segmented options={TYPES} value={borrowType} onChange={setBorrowType} style={{ marginBottom: 20 }} />

            <Field
              label="Person"
              value={personName}
              onChangeText={setPersonName}
              placeholder="e.g. Rahul, Anas, Uncle"
              containerStyle={{ marginBottom: knownUsers.length > 0 ? 10 : 16 }}
            />
            {knownUsers.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={{ marginBottom: 10 }}
              >
                {knownUsers.slice(0, 6).map((u) => (
                  <Chip
                    key={u.id}
                    label={u.name}
                    active={personName.toLowerCase() === u.name.toLowerCase()}
                    onPress={() => setPersonName(u.name)}
                  />
                ))}
              </ScrollView>
            )}

            <Field
              label="Amount (₹)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              style={styles.money}
            />

            {/* When the money changed hands */}
            <View style={{ marginBottom: 12 }}>
              <Label>
                {borrowType === 'lent'
                  ? 'Date given'
                  : borrowType === 'borrowed'
                  ? 'Date borrowed'
                  : 'Date requested'}
              </Label>
              <View style={styles.chipRow}>
                <Chip
                  label="Today"
                  active={date === today}
                  onPress={() => {
                    setDate(todayStr());
                    setShowDatePicker(false);
                  }}
                />
                <Chip
                  label="Yesterday"
                  active={date === yesterday}
                  onPress={() => {
                    setDate(addDays(todayStr(), -1));
                    setShowDatePicker(false);
                  }}
                />
                <Chip
                  label={date !== today && date !== yesterday ? prettyDate(date) : 'Pick a date'}
                  icon="calendar-outline"
                  active={date !== today && date !== yesterday}
                  onPress={() => setShowDatePicker((prev) => !prev)}
                />
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={fromStr(date)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, d) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (d) setDate(toStr(d));
                  }}
                />
              )}
            </View>

            {/* Promised return date */}
            <View style={{ marginBottom: 12 }}>
              <Label>Promised return date</Label>
              <Segmented
                options={DUE_OPTIONS}
                value={hasDueDate ? 'date' : 'none'}
                onChange={(k) => {
                  if (k === 'none') {
                    setHasDueDate(false);
                    setDueDate(null);
                    setShowDueDatePicker(false);
                  } else if (!hasDueDate) {
                    quickDue(7);
                  }
                }}
                style={{ marginBottom: hasDueDate ? 10 : 8 }}
              />

              {hasDueDate && (
                <View style={styles.chipRow}>
                  <Chip label="+7 days" onPress={() => quickDue(7)} />
                  <Chip label="+14 days" onPress={() => quickDue(14)} />
                  <Chip label="+30 days" onPress={() => quickDue(30)} />
                  <Chip
                    label={dueDate ? prettyDate(dueDate) : 'Pick a date'}
                    icon="calendar-outline"
                    active={!!dueDate}
                    onPress={() => setShowDueDatePicker((prev) => !prev)}
                  />
                </View>
              )}

              {showDueDatePicker && hasDueDate && (
                <DateTimePicker
                  value={dueDate ? fromStr(dueDate) : fromStr(todayStr())}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_, d) => {
                    if (Platform.OS !== 'ios') setShowDueDatePicker(false);
                    if (d) setDueDate(toStr(d));
                  }}
                />
              )}
            </View>

            <Field
              label="Notes or reason"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. For college fee, hospital, emergency"
              multiline
              style={styles.notes}
            />

            {item ? (
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <T size={16} weight="700" style={{ color: c.danger }}>Delete entry</T>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    overflow: 'hidden',
    maxHeight: '90%',
  },
  scroll: {
    padding: 20,
    paddingBottom: 36,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  money: {
    fontFamily: FONTS.monoMedium,
    fontSize: 20,
  },
  notes: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  deleteBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
});
