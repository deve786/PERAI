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
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import {
  adjustAccountBalance,
  saveAccount,
  deleteAccount,
  listAccounts,
  type AccountItem,
  type AccountType,
} from '@/expense/accountsDb';
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

const ACCOUNT_TYPES: { type: AccountType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'bank', label: 'Bank', icon: 'business-outline' },
  { type: 'stock', label: 'Stocks', icon: 'trending-up-outline' },
  { type: 'cash', label: 'Cash', icon: 'cash-outline' },
  { type: 'crypto', label: 'Crypto', icon: 'logo-bitcoin' },
  { type: 'other', label: 'Other', icon: 'cube-outline' },
];

export function AccountModal({
  visible,
  item,
  initialType = 'bank',
  onClose,
  onSaved,
}: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

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
  // an expense. A new stock: its whole value. An existing one: only what's
  // typed into "Add money", so updating the value to match the market never
  // takes money from anywhere.
  const isStock = accType === 'stock';
  const [topUp, setTopUp] = useState('');
  const parsed = parseFloat(balance.replace(/,/g, ''));
  const parsedTopUp = parseFloat(topUp.replace(/,/g, ''));
  const round = (n: number) => Math.round(n * 100) / 100;
  const added = !isStock
    ? 0
    : item
    ? !isNaN(parsedTopUp) && parsedTopUp > 0
      ? round(parsedTopUp)
      : 0
    : !isNaN(parsed) && parsed > 0
    ? round(parsed)
    : 0;
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
    onClose();
  };

  useEffect(() => {
    if (item) {
      setName(item.name);
      setAccType(item.type);
      setBalance(String(item.balance));
      setInstitution(item.institution || '');
      setNotes(item.notes || '');
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
        // "Add money" on an existing stock goes on top of its value.
        balance: round(numBalance + (item && isStock ? added : 0)),
        currency: '₹',
        institution: institution.trim(),
        notes: notes.trim(),
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={[type.stamp, styles.headerTitle]}>
              {item ? 'EDIT ASSET / ACCOUNT' : 'ADD ASSET / ACCOUNT'}
            </Text>
            <Pressable onPress={close} hitSlop={10}>
              <Ionicons name="close" size={20} color={colors.graphite} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Account Type Selector */}
            <View style={styles.typeRow}>
              {ACCOUNT_TYPES.map((t) => {
                const isActive = accType === t.type;
                return (
                  <Pressable
                    key={t.type}
                    onPress={() => setAccType(t.type)}
                    style={[styles.typeTab, isActive && styles.typeTabActive]}
                  >
                    <Ionicons
                      name={t.icon}
                      size={14}
                      color={isActive ? colors.paper : colors.graphite}
                    />
                    <Text
                      style={[
                        type.label,
                        styles.typeTabText,
                        isActive && styles.typeTabTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Account Name */}
            <View style={styles.field}>
              <Text style={type.label}>ACCOUNT / ASSET NAME</Text>
              <TextInput
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
                placeholderTextColor={colors.mist}
                style={styles.input}
              />
            </View>

            {/* Current Balance */}
            <View style={styles.field}>
              <Text style={type.label}>CURRENT BALANCE / VALUE (₹)</Text>
              <TextInput
                value={balance}
                onChangeText={setBalance}
                placeholder="0"
                placeholderTextColor={colors.mist}
                keyboardType="decimal-pad"
                style={[styles.input, styles.balanceInput]}
              />
            </View>

            {/* Putting more money into a stock you already have */}
            {isStock && item ? (
              <View style={styles.field}>
                <Text style={type.label}>ADD MONEY (₹)</Text>
                <TextInput
                  value={topUp}
                  onChangeText={setTopUp}
                  placeholder="0"
                  placeholderTextColor={colors.mist}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
                <Text style={[type.fine, styles.hint]}>
                  {added > 0 && !isNaN(parsed)
                    ? `New value will be ${fmtMoney(round(parsed + added), '₹')}`
                    : 'Bought more? Type the amount here — it is taken from the account you pick below.'}
                </Text>
              </View>
            ) : null}

            {/* Where the money for a stock came from */}
            {isStock ? (
              <View style={styles.field}>
                <Text style={type.label}>PAID WITH</Text>
                <View style={styles.chipRow}>
                  {PAY_METHODS.map((m) => (
                    <Pressable
                      key={m.key}
                      onPress={() => setPayChoice(m.key)}
                      style={[styles.chip, payMethod === m.key && styles.chipActive]}
                    >
                      <Text style={[type.label, styles.chipText, payMethod === m.key && styles.chipTextActive]}>
                        {m.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {payMethod !== 'None' ? (
                  sources.length > 0 ? (
                    <>
                      <Text style={[type.label, styles.subLabel]}>
                        {sourceType === 'cash' ? 'FROM WHICH CASH' : 'FROM WHICH BANK'}
                      </Text>
                      <View style={styles.chipRow}>
                        {sources.map((a) => (
                          <Pressable
                            key={a.id}
                            onPress={() => setAccountChoice(a.id)}
                            style={[styles.chip, chosen?.id === a.id && styles.chipActive]}
                          >
                            <Text style={[type.label, styles.chipText, chosen?.id === a.id && styles.chipTextActive]}>
                              {bankLabel(a)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[type.fine, fromAccount && fromAccount.balance < added ? styles.warn : styles.hint]}>
                        {!chosen
                          ? `Pick the ${sourceType === 'cash' ? 'cash account' : 'bank'} this money came from.`
                          : added > 0
                          ? `${fmtMoney(added, '₹')} will be taken from ${bankLabel(chosen)}` +
                            (chosen.balance < added ? ` — it only has ${fmtMoney(chosen.balance, '₹')}` : '')
                          : item
                          ? `Type an amount in Add money to take it from ${bankLabel(chosen)}.`
                          : `The value you type will be taken from ${bankLabel(chosen)}.`}
                      </Text>
                    </>
                  ) : (
                    <Text style={[type.fine, styles.hint]}>
                      {sourceType === 'cash'
                        ? 'No cash account saved, so no balance will change. Add one in Net Worth to track it.'
                        : 'No bank account saved, so no balance will change. Add one in Net Worth to track it.'}
                    </Text>
                  )
                ) : (
                  <Text style={[type.fine, styles.hint]}>
                    {item
                      ? 'No balance changes — use this when you only update the value.'
                      : 'No balance changes — use this for a holding you already had.'}
                  </Text>
                )}
              </View>
            ) : null}

            {/* Institution / Broker (Optional) */}
            <View style={styles.field}>
              <Text style={type.label}>INSTITUTION / BROKER (OPTIONAL)</Text>
              <TextInput
                value={institution}
                onChangeText={setInstitution}
                placeholder="e.g. HDFC, Zerodha, Upstox"
                placeholderTextColor={colors.mist}
                style={styles.input}
              />
            </View>

            {/* Notes */}
            <View style={styles.field}>
              <Text style={type.label}>NOTES (OPTIONAL)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Emergency fund, long-term stocks"
                placeholderTextColor={colors.mist}
                style={styles.input}
              />
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              {item ? (
                <Pressable onPress={handleDelete} style={styles.deleteBtn}>
                  <Text style={[type.label, styles.deleteBtnText]}>DELETE</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleSave}
                disabled={saving || !name.trim() || !balance.trim() || needsAccount}
                style={[
                  styles.saveBtn,
                  (!name.trim() || !balance.trim() || needsAccount) && styles.saveBtnDisabled,
                ]}
              >
                <Text style={[type.label, styles.saveBtnText]}>
                  {saving ? 'SAVING…' : 'SAVE ACCOUNT'}
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
      maxHeight: '90%',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerTitle: {
      color: colors.ink,
      fontWeight: '700',
      letterSpacing: 0.8,
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
      marginBottom: 6,
    },
    typeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 8,
      borderRadius: 6,
    },
    typeTabActive: {
      backgroundColor: colors.ink,
    },
    typeTabText: {
      color: colors.graphite,
      fontSize: 10,
    },
    typeTabTextActive: {
      color: colors.paper,
      fontWeight: '600',
    },
    field: {
      gap: 6,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
    },
    chipActive: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    chipText: {
      color: colors.graphite,
      fontSize: 10,
    },
    chipTextActive: {
      color: colors.paper,
      fontWeight: '600',
    },
    subLabel: {
      marginTop: 6,
    },
    hint: {
      color: colors.graphite,
    },
    warn: {
      color: colors.alert,
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
    balanceInput: {
      fontFamily: FONTS.mono,
      fontSize: 22,
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
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
