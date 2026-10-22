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
import { FONTS, radius, useTheme } from '@/expense/theme';
import { ActionBar, Chip, Field, Label, Segmented, T } from '@/expense/ui';
import {
  adjustAccountBalance,
  saveAccount,
  deleteAccount,
  listAccounts,
  type AccountItem,
  type AccountType,
} from '@/expense/accountsDb';
import { stockGain } from '@/expense/accountsLogic';
import { METHODS } from '@/expense/db';
import { fmtMoney } from '@/expense/stats';

/** How money put into a stock was paid: the same choices as Add Expense, plus "Not paid" for a value that just grew. */
type PayMethod = (typeof METHODS)[number] | 'None';
const PAY_METHODS: { key: PayMethod; label: string }[] = [
  ...METHODS.map((m) => ({ key: m, label: m })),
  { key: 'None', label: 'Not paid' },
];

interface Props {
  visible: boolean;
  item: AccountItem | null;
  initialType?: AccountType;
  onClose: () => void;
  onSaved: () => void;
}

const ACCOUNT_TYPES: { key: AccountType; label: string }[] = [
  { key: 'bank', label: 'Bank' },
  { key: 'stock', label: 'Stocks' },
  { key: 'cash', label: 'Cash' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'other', label: 'Other' },
];

const PROFIT_KINDS = [
  { key: 'Profit', label: 'Profit' },
  { key: 'Loss', label: 'Loss' },
] as const;

export function AccountModal({
  visible,
  item,
  initialType = 'bank',
  onClose,
  onSaved,
}: Props) {
  const { c } = useTheme();

  const [name, setName] = useState('');
  const [accType, setAccType] = useState<AccountType>(initialType);
  const [balance, setBalance] = useState('');
  const [institution, setInstitution] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  // Null means "not chosen yet" — the defaults below apply until a tap.
  const [payChoice, setPayChoice] = useState<PayMethod | null>(null);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    listAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, [visible]);

  // Money put into a stock comes out of the account it was paid from — like
  // an expense. The top field is the money invested: on a new stock, all of
  // it is paid now; on an existing one only "Add money" is, so correcting a
  // number never takes money from anywhere. Profit is typed separately and
  // never touches a bank — it's on paper until sold.
  const isStock = accType === 'stock';
  const [topUp, setTopUp] = useState('');
  const [profitKind, setProfitKind] = useState<'Profit' | 'Loss'>('Profit');
  const [profitAmt, setProfitAmt] = useState('');
  const round = (n: number) => Math.round(n * 100) / 100;
  const num = (text: string) => {
    const n = parseFloat(text.replace(/,/g, ''));
    return isNaN(n) ? NaN : round(n);
  };
  const parsed = num(balance);
  const parsedTopUp = num(topUp);
  const added = !isStock
    ? 0
    : item
    ? parsedTopUp > 0
      ? parsedTopUp
      : 0
    : parsed > 0
    ? parsed
    : 0;
  const parsedProfit = Math.abs(num(profitAmt)) || 0;
  const profit = profitKind === 'Loss' ? -parsedProfit : parsedProfit;
  const investedTotal = isNaN(parsed) ? 0 : round(parsed + (item ? added : 0));
  const stockValue = round(investedTotal + profit);
  const profitPct = investedTotal > 0 ? Math.round((profit / investedTotal) * 1000) / 10 : null;

  const payMethod: PayMethod = payChoice ?? 'UPI';
  const paying = added > 0 && payMethod !== 'None';
  // Cash comes out of a cash account; UPI, Card and Bank out of a bank.
  const sourceType: AccountType = payMethod === 'Cash' ? 'cash' : 'bank';
  const sources = accounts.filter((a) => a.type === sourceType);
  const chosen =
    sources.find((a) => a.id === accountChoice) ?? (sources.length === 1 ? sources[0] : null);
  const fromAccount = paying ? chosen : null;
  // With accounts to pick from, one must be picked; with none, it saves
  // without taking money from anywhere (and says so).
  const needsAccount = paying && sources.length > 0 && !fromAccount;
  // Just the bank's name ("Canara"), like the expense form. Only when two
  // saved accounts are at the same bank is the account name added to tell
  // them apart.
  const bankLabel = (a: AccountItem) => {
    const bank = (a.institution || '').trim();
    if (!bank) return a.name;
    const twins = sources.filter((s) => (s.institution || '').trim().toLowerCase() === bank.toLowerCase());
    return twins.length > 1 ? `${bank} · ${a.name}` : bank;
  };

  const close = () => {
    setPayChoice(null);
    setAccountChoice(null);
    setTopUp('');
    setProfitKind('Profit');
    setProfitAmt('');
    onClose();
  };

  useEffect(() => {
    if (item) {
      setName(item.name);
      setAccType(item.type);
      setInstitution(item.institution || '');
      setNotes(item.notes || '');
      if (item.type === 'stock') {
        // The stock opens as it was saved: its invested amount, its profit,
        // and the payment method and bank it was paid from.
        const gain = stockGain(item);
        setBalance(String(gain.invested));
        setProfitKind(gain.profit < 0 ? 'Loss' : 'Profit');
        setProfitAmt(gain.profit ? String(Math.abs(gain.profit)) : '');
        const saved = PAY_METHODS.find((m) => m.key === item.pay_method);
        setPayChoice(saved ? saved.key : null);
        setAccountChoice(item.pay_account_id ?? null);
      } else {
        setBalance(String(item.balance));
      }
    } else {
      setName('');
      setAccType(initialType);
      setBalance('');
      setInstitution('');
      setNotes('');
    }
  }, [item, initialType, visible]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const numBalance = parseFloat(balance.replace(/,/g, ''));
    if (!trimmedName || isNaN(numBalance)) return;

    setSaving(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await saveAccount({
        id: item?.id,
        name: trimmedName,
        type: accType,
        // A stock's balance is its current value: invested + profit.
        balance: isStock ? stockValue : round(numBalance),
        currency: '₹',
        institution: institution.trim(),
        notes: notes.trim(),
        invested: isStock ? investedTotal : null,
        pay_method: isStock ? payMethod : '',
        // Remembered even when no money moves this time, so the stock
        // reopens showing the bank it's paid from.
        pay_account_id: isStock && payMethod !== 'None' ? chosen?.id ?? null : null,
      });
      // The stock went up by money from this account, so the account goes
      // down by the same — otherwise it's counted twice and the total climbs.
      if (fromAccount) await adjustAccountBalance(fromAccount.id, -added);
      onSaved();
      close();
    } catch (err) {
      console.warn('Failed to save account:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await deleteAccount(item.id);
      onSaved();
      close();
    } catch (err) {
      console.warn('Failed to delete account:', err);
    }
  };

  const canSave = !saving && !!name.trim() && !!balance.trim() && !needsAccount;
  const hint = (text: string, warn?: boolean) => (
    <T size={13} style={{ color: warn ? c.danger : c.sub, marginTop: -8, marginBottom: 16, lineHeight: 18 }}>{text}</T>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line }]} onPress={(e) => e.stopPropagation()}>
          <ActionBar
            title={item ? 'Edit account' : 'Add account'}
            onCancel={close}
            actions={[{ label: saving ? 'Saving…' : 'Save', primary: true, onPress: handleSave, disabled: !canSave }]}
          />

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Label>Type</Label>
            <Segmented options={ACCOUNT_TYPES} value={accType} onChange={setAccType} style={{ marginBottom: 20 }} />

            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder={
                accType === 'bank'
                  ? 'e.g. HDFC Salary, SBI Savings'
                  : accType === 'stock'
                  ? 'e.g. Zerodha Portfolio, Groww'
                  : accType === 'cash'
                  ? 'e.g. Wallet Cash, Home Safe'
                  : accType === 'crypto'
                  ? 'e.g. Binance, Hardware Wallet'
                  : 'e.g. Gold, Fixed Deposit'
              }
            />

            <Field
              label={!isStock ? 'Balance or value (₹)' : item ? 'Invested so far (₹)' : 'Amount invested (₹)'}
              value={balance}
              onChangeText={setBalance}
              placeholder="0"
              keyboardType="decimal-pad"
              style={styles.money}
            />
            {isStock && item
              ? hint('Editing this only corrects the number. Put in more? Use Add money below.')
              : null}

            {/* Putting more money into a stock you already have */}
            {isStock && item ? (
              <>
                <Field
                  label="Add money (₹)"
                  value={topUp}
                  onChangeText={setTopUp}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={styles.moneySmall}
                />
                {hint(
                  added > 0 && !isNaN(parsed)
                    ? `Invested will be ${fmtMoney(investedTotal, '₹')}`
                    : 'Bought more? Type the amount here — it is taken from the account you pick below.',
                )}
              </>
            ) : null}

            {/* Where the money for a stock came from */}
            {isStock ? (
              <View style={{ marginBottom: 20 }}>
                <Label>Paid with</Label>
                <View style={styles.chipRow}>
                  {PAY_METHODS.map((m) => (
                    <Chip key={m.key} label={m.label} active={payMethod === m.key} onPress={() => setPayChoice(m.key)} />
                  ))}
                </View>

                {payMethod !== 'None' ? (
                  sources.length > 0 ? (
                    <>
                      <Label style={{ marginTop: 8 }}>
                        {sourceType === 'cash' ? 'From which cash' : 'From which bank'}
                      </Label>
                      <View style={styles.chipRow}>
                        {sources.map((a) => (
                          <Chip
                            key={a.id}
                            label={bankLabel(a)}
                            icon={sourceType === 'cash' ? 'cash-outline' : 'business-outline'}
                            active={chosen?.id === a.id}
                            onPress={() => setAccountChoice(a.id)}
                          />
                        ))}
                      </View>
                      <T size={13} style={{ color: fromAccount && fromAccount.balance < added ? c.danger : c.sub, lineHeight: 18 }}>
                        {!chosen
                          ? `Pick the ${sourceType === 'cash' ? 'cash account' : 'bank'} this money came from.`
                          : added > 0
                          ? `${fmtMoney(added, '₹')} will be taken from ${bankLabel(chosen)}` +
                            (chosen.balance < added ? ` — it only has ${fmtMoney(chosen.balance, '₹')}` : '')
                          : item
                          ? `Type an amount in Add money to take it from ${bankLabel(chosen)}.`
                          : `The value you type will be taken from ${bankLabel(chosen)}.`}
                      </T>
                    </>
                  ) : (
                    <T size={13} sub style={{ lineHeight: 18 }}>
                      {sourceType === 'cash'
                        ? 'No cash account saved, so no balance will change. Add one in Net Worth to track it.'
                        : 'No bank account saved, so no balance will change. Add one in Net Worth to track it.'}
                    </T>
                  )
                ) : (
                  <T size={13} sub style={{ lineHeight: 18 }}>
                    {item
                      ? 'No balance changes — use this when you only update the value.'
                      : 'No balance changes — use this for a holding you already had.'}
                  </T>
                )}
              </View>
            ) : null}

            {/* Profit or loss on a stock — on paper, never moves a bank */}
            {isStock ? (
              <View style={{ marginBottom: 20 }}>
                <Label>Profit or loss (₹)</Label>
                <Segmented options={PROFIT_KINDS} value={profitKind} onChange={setProfitKind} style={{ marginBottom: 10 }} />
                <Field
                  value={profitAmt}
                  onChangeText={setProfitAmt}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={styles.moneySmall}
                  containerStyle={{ marginBottom: 10 }}
                />
                <View style={[styles.valueBox, { backgroundColor: c.card, borderColor: c.line }]}>
                  <T size={13} sub style={{ flex: 1 }}>Current value</T>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T size={16} weight="600" tabular>{fmtMoney(stockValue, '₹')}</T>
                    {profit !== 0 ? (
                      <T size={13} style={{ color: profit > 0 ? c.accent : c.danger }}>
                        {profit > 0 ? '+' : '−'}
                        {fmtMoney(Math.abs(profit), '₹')}
                        {profitPct !== null ? ` (${profit > 0 ? '+' : '−'}${Math.abs(profitPct)}%)` : ''}
                      </T>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            <Field
              label="Bank or broker (optional)"
              value={institution}
              onChangeText={setInstitution}
              placeholder="e.g. HDFC, Zerodha, Upstox"
            />

            <Field
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Emergency fund, long-term stocks"
            />

            {item ? (
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <T size={16} weight="700" style={{ color: c.danger }}>Delete account</T>
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
    maxHeight: '92%',
  },
  scroll: {
    padding: 20,
    paddingBottom: 36,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  money: {
    fontFamily: FONTS.monoMedium,
    fontSize: 22,
  },
  moneySmall: {
    fontFamily: FONTS.mono,
    fontSize: 17,
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
  },
  deleteBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
});
