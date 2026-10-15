import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import { todayStr, addDays, prettyDate, fromStr, toStr } from '@/expense/dates';
import {
  saveBorrowLend,
  deleteBorrowLend,
  type BorrowLendItem,
  type BorrowLendType,
  type BorrowLendStatus,
} from '@/expense/borrowLendDb';
import { listTaggedUsers, type TaggedUser } from '@/expense/db';

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
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons
                name={
                  borrowType === 'lent'
                    ? 'arrow-up-circle-outline'
                    : borrowType === 'borrowed'
                      ? 'arrow-down-circle-outline'
                      : 'help-circle-outline'
                }
                size={20}
                color={borrowType === 'lent' ? colors.moss : colors.alert}
              />
              <Text style={[type.label, styles.headerTitle]}>
                {item ? 'EDIT ENTRY' : 'NEW BORROW / LEND'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-outline" size={22} color={colors.mist} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Type Selector Tabs */}
            <View style={styles.typeRow}>
              <Pressable
                onPress={() => setBorrowType('lent')}
                style={[styles.typeTab, borrowType === 'lent' && styles.typeTabLent]}
              >
                <Text
                  style={[
                    type.label,
                    styles.typeTabText,
                    borrowType === 'lent' && styles.typeTabTextActive,
                  ]}
                >
                  I LENT
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setBorrowType('request')}
                style={[styles.typeTab, borrowType === 'request' && styles.typeTabRequest]}
              >
                <Text
                  style={[
                    type.label,
                    styles.typeTabText,
                    borrowType === 'request' && styles.typeTabTextActive,
                  ]}
                >
                  REQUESTED
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setBorrowType('borrowed')}
                style={[styles.typeTab, borrowType === 'borrowed' && styles.typeTabBorrowed]}
              >
                <Text
                  style={[
                    type.label,
                    styles.typeTabText,
                    borrowType === 'borrowed' && styles.typeTabTextActive,
                  ]}
                >
                  I BORROWED
                </Text>
              </Pressable>
            </View>

            {/* Person Name */}
            <View style={styles.field}>
              <Text style={type.label}>PERSON NAME</Text>
              <TextInput
                value={personName}
                onChangeText={setPersonName}
                placeholder="e.g. Rahul, Anas, Uncle"
                placeholderTextColor={colors.mist}
                style={styles.input}
              />
              {knownUsers.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {knownUsers.slice(0, 6).map((u) => (
                    <Pressable
                      key={u.id}
                      onPress={() => setPersonName(u.name)}
                      style={[styles.chip, personName.toLowerCase() === u.name.toLowerCase() && styles.chipActive]}
                    >
                      <Text style={[type.fine, styles.chipText]}>{u.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Amount */}
            <View style={styles.field}>
              <Text style={type.label}>AMOUNT (₹)</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={colors.mist}
                keyboardType="decimal-pad"
                style={[styles.input, styles.amountInput]}
              />
            </View>

            {/* Date Given / Lent / Borrowed / Requested */}
            <View style={styles.field}>
              <Text style={type.label}>
                {borrowType === 'lent'
                  ? 'DATE GIVEN / LENT'
                  : borrowType === 'borrowed'
                  ? 'DATE RECEIVED / BORROWED'
                  : 'DATE REQUESTED'}
              </Text>
              <View style={styles.dateSelectorRow}>
                <Pressable
                  onPress={() => {
                    setDate(todayStr());
                    setShowDatePicker(false);
                  }}
                  style={[
                    styles.dateChip,
                    date === todayStr() && styles.dateChipActive,
                  ]}
                >
                  <Text
                    style={[
                      type.fine,
                      date === todayStr() ? styles.dateChipTextActive : styles.dateChipText,
                    ]}
                  >
                    Today
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setDate(addDays(todayStr(), -1));
                    setShowDatePicker(false);
                  }}
                  style={[
                    styles.dateChip,
                    date === addDays(todayStr(), -1) && styles.dateChipActive,
                  ]}
                >
                  <Text
                    style={[
                      type.fine,
                      date === addDays(todayStr(), -1)
                        ? styles.dateChipTextActive
                        : styles.dateChipText,
                    ]}
                  >
                    Yesterday
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowDatePicker((prev) => !prev)}
                  style={[
                    styles.datePickerBtn,
                    date !== todayStr() && date !== addDays(todayStr(), -1) && styles.datePickerBtnActive,
                  ]}
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.moss} />
                  <Text style={[type.fine, styles.datePickerBtnText]}>
                    {prettyDate(date)}
                  </Text>
                </Pressable>
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

            {/* Due Date Options */}
            <View style={styles.field}>
              <View style={styles.dueToggleRow}>
                <Text style={type.label}>PROMISED RETURN DATE</Text>
                <Pressable
                  onPress={() => {
                    if (hasDueDate) {
                      setHasDueDate(false);
                      setDueDate(null);
                      setShowDueDatePicker(false);
                    } else {
                      quickDue(7);
                    }
                  }}
                  hitSlop={6}
                >
                  <Text style={[type.label, { color: hasDueDate ? colors.moss : colors.mist }]}>
                    {hasDueDate ? 'HAS DATE' : 'NO DATE'}
                  </Text>
                </Pressable>
              </View>

              {hasDueDate && (
                <View style={styles.quickDueRow}>
                  <Pressable onPress={() => quickDue(7)} style={styles.quickDueBtn}>
                    <Text style={[type.label, styles.quickDueText]}>+7D</Text>
                  </Pressable>
                  <Pressable onPress={() => quickDue(14)} style={styles.quickDueBtn}>
                    <Text style={[type.label, styles.quickDueText]}>+14D</Text>
                  </Pressable>
                  <Pressable onPress={() => quickDue(30)} style={styles.quickDueBtn}>
                    <Text style={[type.label, styles.quickDueText]}>+30D</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowDueDatePicker((prev) => !prev)}
                    style={styles.dueDateBtn}
                  >
                    <Ionicons name="calendar-outline" size={14} color={colors.moss} />
                    <Text style={[type.fine, styles.dueDateBtnText]}>
                      {dueDate ? prettyDate(dueDate) : 'Pick Date'}
                    </Text>
                  </Pressable>
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

            {/* Notes / Reason */}
            <View style={styles.field}>
              <Text style={type.label}>NOTES / REASON</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. For college fee, hospital, emergency"
                placeholderTextColor={colors.mist}
                style={[styles.input, styles.notesInput]}
                multiline
              />
            </View>

            <View style={styles.actionRow}>
              {item ? (
                <Pressable onPress={handleDelete} style={styles.deleteBtn}>
                  <Text style={[type.label, styles.deleteBtnText]}>DELETE</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleSave}
                disabled={saving || !personName.trim() || !amount.trim()}
                style={[
                  styles.saveBtn,
                  (!personName.trim() || !amount.trim()) && styles.saveBtnDisabled,
                ]}
              >
                <Text style={[type.label, styles.saveBtnText]}>
                  {saving ? 'SAVING…' : 'SAVE ENTRY'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.paper,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: colors.rule,
      padding: 20,
      maxHeight: '88%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      color: colors.ink,
      fontWeight: '700',
    },
    scroll: {
      gap: 16,
    },
    typeRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.rule,
      marginBottom: 16,
    },
    typeTab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
    },
    typeTabLent: {
      backgroundColor: colors.moss,
    },
    typeTabRequest: {
      backgroundColor: colors.ink,
    },
    typeTabBorrowed: {
      backgroundColor: colors.alert,
    },
    typeTabText: {
      color: colors.mist,
      fontSize: 11,
      fontWeight: '600',
    },
    typeTabTextActive: {
      color: colors.paper,
    },
    field: {
      gap: 6,
      marginBottom: 16,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.ink,
      fontFamily: FONTS.sans,
    },
    amountInput: {
      fontFamily: FONTS.mono,
      fontSize: 20,
      fontWeight: '600',
    },
    notesInput: {
      minHeight: 50,
      textAlignVertical: 'top',
    },
    chipsScroll: {
      marginTop: 4,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      marginRight: 6,
    },
    chipActive: {
      borderColor: colors.moss,
      backgroundColor: colors.rule,
    },
    chipText: {
      color: colors.graphite,
    },
    dateSelectorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    dateChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    dateChipActive: {
      borderColor: colors.moss,
      backgroundColor: colors.surface,
    },
    dateChipText: {
      color: colors.graphite,
    },
    dateChipTextActive: {
      color: colors.moss,
      fontWeight: '600',
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    datePickerBtnActive: {
      borderColor: colors.moss,
    },
    datePickerBtnText: {
      color: colors.ink,
      fontWeight: '500',
    },
    dueToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    quickDueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
    },
    quickDueBtn: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    quickDueText: {
      color: colors.graphite,
      fontSize: 10,
    },
    dueDateBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    dueDateBtnText: {
      color: colors.ink,
      fontWeight: '500',
      fontSize: 12,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 10,
      marginBottom: 20,
    },
    deleteBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.alert,
    },
    deleteBtnText: {
      color: colors.alert,
      fontWeight: '600',
    },
    saveBtn: {
      flex: 2,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 8,
      backgroundColor: colors.ink,
    },
    saveBtnDisabled: {
      opacity: 0.5,
    },
    saveBtnText: {
      color: colors.paper,
      fontWeight: '700',
    },
  });
}
