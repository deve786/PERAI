import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardLift } from '@/components/KeyboardLift';
import { FONTS, useTheme } from '@/expense/theme';
import { ActionBar, Chip, Field, Label, T } from '@/expense/ui';
import { addDays, fromStr, prettyDate, toStr, todayStr } from '@/expense/dates';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { saveAtmWithdrawal } from '@/expense/transfersDb';
import { withdrawalProblem } from '@/expense/transferLogic';
import { fmtMoney } from '@/expense/stats';

const QUICK = [500, 1000, 2000, 5000, 10000];

interface Props {
  visible: boolean;
  /** Bank to preselect, e.g. when opened from that bank's row. */
  initialBankId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Cash taken out of a bank at an ATM. The bank goes down and the cash wallet
 * goes up by the same amount — it is not spending, so no expense is made.
 */
export function AtmWithdrawModal({ visible, initialBankId, onClose, onSaved }: Props) {
  const { c } = useTheme();
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [amount, setAmount] = useState('');
  const [bankId, setBankId] = useState<string | null>(null);
  const [cashId, setCashId] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount('');
    setNote('');
    setDate(todayStr());
    setShowPicker(false);
    setCashId(null);
    listAccounts()
      .then((all) => {
        setAccounts(all);
        const banks = all.filter((a) => a.type === 'bank');
        const start = banks.find((b) => b.id === initialBankId) ?? (banks.length === 1 ? banks[0] : null);
        setBankId(start?.id ?? null);
      })
      .catch(() => setAccounts([]));
  }, [visible, initialBankId]);

  const banks = accounts.filter((a) => a.type === 'bank');
  const cashAccounts = accounts.filter((a) => a.type === 'cash');
  const bank = banks.find((b) => b.id === bankId) ?? null;
  const cash = cashAccounts.find((a) => a.id === cashId) ?? cashAccounts[0] ?? null;
  const bankLabel = (a: AccountItem) => (a.institution || '').trim() || a.name;
  const parsed = parseFloat(amount.replace(/,/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const warning = valid && bank ? withdrawalProblem({ amount: parsed, fromBalance: bank.balance }) : null;
  const today = todayStr();
  const yesterday = addDays(today, -1);

  const save = async () => {
    if (!bank || !valid || saving) return;
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await saveAtmWithdrawal({ fromAccountId: bank.id, toAccountId: cash?.id ?? null, amount: parsed, date, note });
      onSaved();
      onClose();
    } catch (err) {
      console.warn('Could not save the ATM withdrawal:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardLift style={styles.backdrop}>
        <Pressable style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} onPress={(e) => e.stopPropagation()}>
          <ActionBar
            title="ATM withdrawal"
            onCancel={onClose}
            actions={[{ label: saving ? 'Saving…' : 'Save', primary: true, onPress: save, disabled: !bank || !valid || saving }]}
          />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Field
              label="Amount taken out (₹)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              style={styles.money}
              containerStyle={{ marginBottom: 10 }}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
              {QUICK.map((q) => (
                <Chip key={q} label={fmtMoney(q, '₹')} active={valid && parsed === q} onPress={() => setAmount(String(q))} />
              ))}
            </ScrollView>

            <Label>From which bank</Label>
            {banks.length > 0 ? (
              <View style={styles.chipRow}>
                {banks.map((b) => (
                  <Chip
                    key={b.id}
                    label={`${bankLabel(b)} · ${fmtMoney(b.balance, '₹')}`}
                    active={bank?.id === b.id}
                    onPress={() => setBankId(b.id)}
                  />
                ))}
              </View>
            ) : (
              <T size={13} sub style={{ marginBottom: 12 }}>
                No bank account saved yet. Add one in Net worth first, then come back.
              </T>
            )}

            {cashAccounts.length > 1 ? (
              <>
                <Label style={{ marginTop: 14 }}>Into which cash wallet</Label>
                <View style={styles.chipRow}>
                  {cashAccounts.map((a) => (
                    <Chip key={a.id} label={a.name} active={cash?.id === a.id} onPress={() => setCashId(a.id)} />
                  ))}
                </View>
              </>
            ) : null}

            <T size={13} sub style={{ marginTop: 6, color: bank && valid ? c.accent : c.sub }}>
              {bank && valid
                ? `${fmtMoney(parsed, '₹')} leaves ${bankLabel(bank)} and goes into ${cash ? cash.name : 'a new “Cash in hand” wallet'}. It is not counted as spending.`
                : 'Your bank balance goes down and your cash goes up by the same amount.'}
            </T>
            {warning ? (
              <T size={13} style={{ marginTop: 4, color: c.warn }}>
                {warning} It will still be saved; check the balance if it looks wrong.
              </T>
            ) : null}

            <Label style={{ marginTop: 18 }}>Date</Label>
            <View style={styles.chipRow}>
              <Chip label="Today" active={date === today} onPress={() => { setDate(todayStr()); setShowPicker(false); }} />
              <Chip label="Yesterday" active={date === yesterday} onPress={() => { setDate(addDays(todayStr(), -1)); setShowPicker(false); }} />
              <Chip
                label={date !== today && date !== yesterday ? prettyDate(date) : 'Pick a date'}
                icon="calendar-outline"
                active={date !== today && date !== yesterday}
                onPress={() => setShowPicker((p) => !p)}
              />
            </View>
            {showPicker ? (
              <DateTimePicker
                value={fromStr(date)}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (d) setDate(toStr(d));
                }}
              />
            ) : null}

            <Field
              label="Note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Near the bus stand ATM"
              containerStyle={{ marginTop: 14 }}
            />
          </ScrollView>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, overflow: 'hidden', maxHeight: '90%' },
  scroll: { padding: 20, paddingBottom: 36 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  money: { fontFamily: FONTS.monoMedium, fontSize: 20 },
});
