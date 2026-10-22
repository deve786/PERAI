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
import { fmtMoney } from '@/expense/stats';

type PayMethod = 'UPI' | 'Net banking' | 'None';

/** How money put into a stock was paid. Anything but "None" comes out of a bank account. */
const PAY_METHODS: { key: PayMethod; label: string }[] = [
  { key: 'UPI', label: 'UPI' },
  { key: 'Net banking', label: 'Net banking' },
  { key: 'None', label: 'Not from a bank' },
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
  const [banks, setBanks] = useState<AccountItem[]>([]);
  // Null means "not chosen yet" — the defaults below apply until a tap.
  const [payChoice, setPayChoice] = useState<PayMethod | null>(null);
  const [bankChoice, setBankChoice] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    listAccounts({ type: 'bank' })
      .then(setBanks)
      .catch(() => setBanks([]));
  }, [visible]);

  // Money put into a stock comes out of a bank. A new stock: all of it. An
  // edit: only an increase — and that defaults to "not from a bank", so
  // updating the value to match the market never touches a bank by accident.
  const parsed = parseFloat(balance.replace(/,/g, ''));
  const added =
    accType === 'stock' && !isNaN(parsed)
      ? Math.round((parsed - (item ? item.balance : 0)) * 100) / 100
      : 0;
  const payMethod: PayMethod = payChoice ?? (item ? 'None' : 'UPI');
  const fromBankId = bankChoice ?? (banks.length === 1 ? banks[0].id : null);
  const paysFromBank = added > 0 && payMethod !== 'None';
  const fromBank = paysFromBank ? banks.find((b) => b.id === fromBankId) ?? null : null;
  const needsBank = paysFromBank && !fromBank;

  const close = () => {
    setPayChoice(null);
    setBankChoice(null);
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
        balance: Math.round(numBalance * 100) / 100,
        currency: '₹',
        institution: institution.trim(),
        notes: notes.trim(),
      });
      // The stock went up by money from this bank, so the bank goes down by
      // the same — otherwise it's counted twice and the total climbs.
      if (fromBank) await adjustAccountBalance(fromBank.id, -added);
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

            {/* Where the money for a stock came from */}
            {added > 0 ? (
              <View style={styles.field}>
                <Text style={type.label}>{item ? 'ADDED MONEY? PAID WITH' : 'PAID WITH'}</Text>
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

                {paysFromBank ? (
                  banks.length > 0 ? (
                    <>
                      <Text style={[type.label, styles.subLabel]}>FROM WHICH BANK</Text>
                      <View style={styles.chipRow}>
                        {banks.map((b) => (
                          <Pressable
                            key={b.id}
                            onPress={() => setBankChoice(b.id)}
                            style={[styles.chip, fromBankId === b.id && styles.chipActive]}
                          >
                            <Text style={[type.label, styles.chipText, fromBankId === b.id && styles.chipTextActive]}>
                              {b.institution ? `${b.name} · ${b.institution}` : b.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={[type.fine, fromBank && fromBank.balance < added ? styles.warn : styles.hint]}>
                        {fromBank
                          ? `${fmtMoney(added, '₹')} will be taken from ${fromBank.name}` +
                            (fromBank.balance < added ? ` — it only has ${fmtMoney(fromBank.balance, '₹')}` : '')
                          : 'Pick the bank this money came from.'}
                      </Text>
                    </>
                  ) : (
                    <Text style={[type.fine, styles.warn]}>
                      Add a bank account first, or choose “Not from a bank”.
                    </Text>
                  )
                ) : (
                  <Text style={[type.fine, styles.hint]}>
                    {item
                      ? 'No bank changes — use this when the value went up by itself.'
                      : 'No bank changes — use this for a holding you already had.'}
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
                disabled={saving || !name.trim() || !balance.trim() || needsBank}
                style={[
                  styles.saveBtn,
                  (!name.trim() || !balance.trim() || needsBank) && styles.saveBtnDisabled,
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
