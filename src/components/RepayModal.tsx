import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardLift } from '@/components/KeyboardLift';
import { FONTS, useTheme } from '@/expense/theme';
import { ActionBar, Chip, Field, Label, Segmented, T } from '@/expense/ui';
import { settleBorrowLend, type BorrowLendItem } from '@/expense/borrowLendDb';
import type { AccountItem } from '@/expense/accountsDb';
import { outstandingOf, planRepayment } from '@/expense/loanLogic';
import { fmtMoney } from '@/expense/stats';
import { prettyDate } from '@/expense/dates';

interface Props {
  visible: boolean;
  item: BorrowLendItem | null;
  /** Bank and cash accounts the money can go into or come out of. */
  accounts: AccountItem[];
  onClose: () => void;
  onDone: () => void;
}

const REST = [
  { key: 'owed', label: 'Still owed' },
  { key: 'close', label: 'Close the loan' },
] as const;

/**
 * Marking a loan returned. What comes back need not be what went out — a bit
 * more with interest, a bit less as a part payment — so the amount is asked,
 * and that amount is what moves in the bank and in net worth.
 */
export function RepayModal({ visible, item, accounts, onClose, onDone }: Props) {
  const { c } = useTheme();
  const [amount, setAmount] = useState('');
  const [rest, setRest] = useState<'owed' | 'close'>('owed');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [record, setRecord] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !item) return;
    setAmount(String(outstandingOf(item.amount, item.settled_amount)));
    setRest('owed');
    setRecord(true);
    // Where the loan was paid from or received into is where it usually comes back to.
    const same = accounts.find((a) => a.id === item.account_id);
    setAccountId(same?.id ?? (accounts.length === 1 ? accounts[0].id : null));
  }, [visible, item, accounts]);

  if (!item) return null;
  const lent = item.type === 'lent';
  const outstanding = outstandingOf(item.amount, item.settled_amount);
  const parsed = parseFloat(amount.replace(/,/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const plan = valid ? planRepayment({ amount: item.amount, settled: item.settled_amount, returned: parsed, writeOffRest: rest === 'close' }) : null;
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const label = (a: AccountItem) => (a.institution || '').trim() || a.name;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await settleBorrowLend(item.id, {
        returnedAmount: parsed,
        writeOffRest: rest === 'close',
        recordAsIncome: record && lent,
        recordAsExpense: record && !lent,
        method: account && account.type !== 'cash' ? 'UPI' : account ? 'Cash' : 'UPI',
        accountId: record ? account?.id ?? null : null,
      });
      onDone();
      onClose();
    } catch (err) {
      console.warn('Could not record the repayment:', err);
    } finally {
      setSaving(false);
    }
  };

  // One line saying what will happen, so nothing is a surprise.
  const outcome = (() => {
    if (!plan) return '';
    const parts: string[] = [];
    if (record && account) {
      parts.push(`${fmtMoney(parsed, '₹')} will be ${lent ? 'added to' : 'taken from'} ${label(account)}.`);
    } else if (record) {
      parts.push(
        accounts.length > 0
          ? `No account picked, so no balance changes${lent ? ' and your net worth drops by what was lent' : ''}. Pick one above.`
          : 'It will be recorded without an account.'
      );
    } else {
      parts.push('No money will be added to or taken from your accounts.');
    }
    if (plan.extra > 0) parts.push(`That is ${fmtMoney(plan.extra, '₹')} more than ${lent ? 'you lent' : 'you borrowed'}.`);
    if (plan.closed && plan.shortfall > 0) parts.push(`${fmtMoney(plan.shortfall, '₹')} is let go.`);
    if (!plan.closed) parts.push(`${fmtMoney(plan.remaining, '₹')} is still ${lent ? 'to come' : 'owed'}.`);
    return parts.join(' ');
  })();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardLift style={styles.backdrop}>
        <Pressable style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} onPress={(e) => e.stopPropagation()}>
          <ActionBar
            title={lent ? 'Money returned' : 'Paid back'}
            onCancel={onClose}
            actions={[{ label: saving ? 'Saving…' : 'Save', primary: true, onPress: save, disabled: !valid || saving }]}
          />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <T size={15} sub style={{ marginBottom: 14 }}>
              {item.person_name} · {fmtMoney(item.amount, '₹')} {lent ? 'lent' : 'borrowed'} {prettyDate(item.date)}
              {outstanding !== item.amount ? ` · ${fmtMoney(outstanding, '₹')} left` : ''}
            </T>

            <Field
              label={lent ? 'Amount you got back (₹)' : 'Amount you paid back (₹)'}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              style={styles.money}
              containerStyle={{ marginBottom: 6 }}
            />
            <T size={13} sub style={{ marginBottom: 14 }}>
              It can be more or less than {fmtMoney(outstanding, '₹')}. This is the amount that moves in your account and net worth.
            </T>

            {plan && !plan.closed ? (
              <View style={{ marginBottom: 14 }}>
                <Label>The rest, {fmtMoney(plan.remaining, '₹')}</Label>
                <Segmented options={REST} value={rest} onChange={setRest} />
              </View>
            ) : null}
            {plan && plan.closed && plan.shortfall > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Label>The rest, {fmtMoney(plan.shortfall, '₹')}</Label>
                <Segmented options={REST} value={rest} onChange={setRest} />
              </View>
            ) : null}

            <Label>{lent ? 'Where it landed' : 'Where you paid it from'}</Label>
            <View style={styles.chipRow}>
              {accounts.map((a) => (
                <Chip
                  key={a.id}
                  label={`${label(a)}${a.id === item.account_id ? ' · the loan' : ''}`}
                  active={accountId === a.id}
                  onPress={() => setAccountId(accountId === a.id ? null : a.id)}
                />
              ))}
              {accounts.length === 0 ? <T size={13} sub>No bank or cash account saved. Add one in Net worth.</T> : null}
            </View>

            <Pressable
              onPress={() => setRecord((r) => !r)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !record }}
              style={({ pressed }) => [styles.checkRow, { opacity: pressed ? 0.6 : 1 }]}
            >
              <View style={[styles.box, { borderColor: !record ? c.accent : c.border, backgroundColor: !record ? c.accent : 'transparent' }]}>
                {!record ? <T size={13} weight="700" style={{ color: c.inkText }}>✓</T> : null}
              </View>
              <T size={15}>Just mark it settled, don't record the money</T>
            </Pressable>

            {outcome ? <T size={13} style={{ marginTop: 8, color: c.accent }}>{outcome}</T> : null}
          </ScrollView>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, overflow: 'hidden', maxHeight: '92%' },
  scroll: { padding: 20, paddingBottom: 36 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  money: { fontFamily: FONTS.monoMedium, fontSize: 20 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
