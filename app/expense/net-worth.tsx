import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import {
  listAccounts,
  getNetWorthSummary,
  type AccountItem,
  type AccountType,
  type NetWorthSummary,
} from '@/expense/accountsDb';
import { AccountModal } from '@/components/AccountModal';
import { fmtMoney } from '@/expense/stats';

type PresetMode = 'liquid' | 'withStocks' | 'withLend' | 'netWorth' | 'custom';

export default function NetWorthScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [summary, setSummary] = useState<NetWorthSummary>({
    bankTotal: 0,
    stockTotal: 0,
    cashTotal: 0,
    cryptoTotal: 0,
    otherTotal: 0,
    liquidTotal: 0,
    totalWithStocks: 0,
    totalWithLend: 0,
    totalAssets: 0,
    totalLent: 0,
    totalBorrowed: 0,
    netWorth: 0,
    accountsCount: 0,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null);
  const [initialType, setInitialType] = useState<AccountType>('bank');

  // Interactive "with / without" toggles
  const [includeBank, setIncludeBank] = useState(true);
  const [includeCash, setIncludeCash] = useState(true);
  const [includeStock, setIncludeStock] = useState(true);
  const [includeLend, setIncludeLend] = useState(true);
  const [includeCryptoOther, setIncludeCryptoOther] = useState(true);
  const [deductBorrowed, setDeductBorrowed] = useState(true);

  const [activePreset, setActivePreset] = useState<PresetMode>('netWorth');

  const loadData = useCallback(async () => {
    try {
      const [accs, sumData] = await Promise.all([
        listAccounts(),
        getNetWorthSummary(),
      ]);
      setAccounts(accs);
      setSummary(sumData);
    } catch (err) {
      console.warn('Could not load accounts / net worth data:', err);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle preset mode selection
  const selectPreset = (mode: PresetMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActivePreset(mode);
    switch (mode) {
      case 'liquid':
        setIncludeBank(true);
        setIncludeCash(true);
        setIncludeStock(false);
        setIncludeLend(false);
        setIncludeCryptoOther(false);
        setDeductBorrowed(false);
        break;
      case 'withStocks':
        setIncludeBank(true);
        setIncludeCash(true);
        setIncludeStock(true);
        setIncludeLend(false);
        setIncludeCryptoOther(false);
        setDeductBorrowed(false);
        break;
      case 'withLend':
        setIncludeBank(true);
        setIncludeCash(true);
        setIncludeStock(true);
        setIncludeLend(true);
        setIncludeCryptoOther(false);
        setDeductBorrowed(false);
        break;
      case 'netWorth':
        setIncludeBank(true);
        setIncludeCash(true);
        setIncludeStock(true);
        setIncludeLend(true);
        setIncludeCryptoOther(true);
        setDeductBorrowed(true);
        break;
    }
  };

  // Dynamically computed total amount based on active checkboxes
  const computedTotal = useMemo(() => {
    let tot = 0;
    if (includeBank) tot += summary.bankTotal;
    if (includeCash) tot += summary.cashTotal;
    if (includeStock) tot += summary.stockTotal;
    if (includeLend) tot += summary.totalLent;
    if (includeCryptoOther) tot += summary.cryptoTotal + summary.otherTotal;
    if (deductBorrowed) tot -= summary.totalBorrowed;
    return Math.round(tot * 100) / 100;
  }, [
    summary,
    includeBank,
    includeCash,
    includeStock,
    includeLend,
    includeCryptoOther,
    deductBorrowed,
  ]);

  const openNew = (t: AccountType = 'bank') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedAccount(null);
    setInitialType(t);
    setModalVisible(true);
  };

  const openEdit = (acc: AccountItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedAccount(acc);
    setModalVisible(true);
  };

  const getPresetLabel = () => {
    switch (activePreset) {
      case 'liquid':
        return 'LIQUID IN-HAND (BANK + CASH)';
      case 'withStocks':
        return 'TOTAL WITH STOCKS & INVESTMENTS';
      case 'withLend':
        return 'TOTAL WITH MONEY LENT';
      case 'netWorth':
        return 'TOTAL NET WORTH';
      default:
        return 'CUSTOM TOTAL SELECTION';
    }
  };

  // Group accounts by category
  const bankAccounts = accounts.filter((a) => a.type === 'bank');
  const stockAccounts = accounts.filter((a) => a.type === 'stock');
  const cashAccounts = accounts.filter((a) => a.type === 'cash');
  const otherAccounts = accounts.filter((a) => a.type === 'crypto' || a.type === 'other');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={[type.stamp, styles.headerTitle]}>NET WORTH & WEALTH</Text>
        <Pressable onPress={() => openNew('bank')} hitSlop={10} style={styles.headerAddBtn}>
          <Ionicons name="add" size={18} color={colors.moss} />
          <Text style={[type.label, styles.headerAddText]}>ADD</Text>
        </Pressable>
      </View>

      {/* Hero Display Card */}
      <View style={styles.heroCard}>
        <Text style={[type.stamp, styles.heroLabel]}>{getPresetLabel()}</Text>
        <Text style={[type.display, styles.heroAmount]}>
          {fmtMoney(computedTotal, '₹')}
        </Text>

        {/* Preset Filters Row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
          <Pressable
            onPress={() => selectPreset('liquid')}
            style={[styles.presetChip, activePreset === 'liquid' && styles.presetChipActive]}
          >
            <Text
              style={[
                type.fine,
                styles.presetChipText,
                activePreset === 'liquid' && styles.presetChipTextActive,
              ]}
            >
              Liquid (Bank+Cash)
            </Text>
          </Pressable>

          <Pressable
            onPress={() => selectPreset('withStocks')}
            style={[styles.presetChip, activePreset === 'withStocks' && styles.presetChipActive]}
          >
            <Text
              style={[
                type.fine,
                styles.presetChipText,
                activePreset === 'withStocks' && styles.presetChipTextActive,
              ]}
            >
              + Stocks
            </Text>
          </Pressable>

          <Pressable
            onPress={() => selectPreset('withLend')}
            style={[styles.presetChip, activePreset === 'withLend' && styles.presetChipActive]}
          >
            <Text
              style={[
                type.fine,
                styles.presetChipText,
                activePreset === 'withLend' && styles.presetChipTextActive,
              ]}
            >
              + Money Lent
            </Text>
          </Pressable>

          <Pressable
            onPress={() => selectPreset('netWorth')}
            style={[styles.presetChip, activePreset === 'netWorth' && styles.presetChipActive]}
          >
            <Text
              style={[
                type.fine,
                styles.presetChipText,
                activePreset === 'netWorth' && styles.presetChipTextActive,
              ]}
            >
              Net Worth (All)
            </Text>
          </Pressable>
        </ScrollView>

        {/* With & Without Interactive Checkboxes */}
        <View style={styles.checkboxContainer}>
          <Text style={[type.stamp, styles.checkboxTitle]}>
            CUSTOMIZE TOTAL BREAKDOWN (TAP TO INCLUDE / EXCLUDE):
          </Text>

          <View style={styles.checkboxGrid}>
            {/* Bank Accounts */}
            <Pressable
              onPress={() => {
                setActivePreset('custom');
                setIncludeBank((prev) => !prev);
              }}
              style={[styles.checkboxItem, includeBank && styles.checkboxItemActive]}
            >
              <Ionicons
                name={includeBank ? 'checkbox' : 'square-outline'}
                size={16}
                color={includeBank ? colors.moss : colors.mist}
              />
              <Text style={[type.fine, styles.checkboxLabel]}>
                Bank: {fmtMoney(summary.bankTotal, '₹')}
              </Text>
            </Pressable>

            {/* Stocks */}
            <Pressable
              onPress={() => {
                setActivePreset('custom');
                setIncludeStock((prev) => !prev);
              }}
              style={[styles.checkboxItem, includeStock && styles.checkboxItemActive]}
            >
              <Ionicons
                name={includeStock ? 'checkbox' : 'square-outline'}
                size={16}
                color={includeStock ? colors.moss : colors.mist}
              />
              <Text style={[type.fine, styles.checkboxLabel]}>
                Stocks: {fmtMoney(summary.stockTotal, '₹')}
              </Text>
            </Pressable>

            {/* Cash */}
            <Pressable
              onPress={() => {
                setActivePreset('custom');
                setIncludeCash((prev) => !prev);
              }}
              style={[styles.checkboxItem, includeCash && styles.checkboxItemActive]}
            >
              <Ionicons
                name={includeCash ? 'checkbox' : 'square-outline'}
                size={16}
                color={includeCash ? colors.moss : colors.mist}
              />
              <Text style={[type.fine, styles.checkboxLabel]}>
                Cash: {fmtMoney(summary.cashTotal, '₹')}
              </Text>
            </Pressable>

            {/* Money Lent (Receivables) */}
            <Pressable
              onPress={() => {
                setActivePreset('custom');
                setIncludeLend((prev) => !prev);
              }}
              style={[styles.checkboxItem, includeLend && styles.checkboxItemActive]}
            >
              <Ionicons
                name={includeLend ? 'checkbox' : 'square-outline'}
                size={16}
                color={includeLend ? colors.moss : colors.mist}
              />
              <Text style={[type.fine, styles.checkboxLabel]}>
                Lent: {fmtMoney(summary.totalLent, '₹')}
              </Text>
            </Pressable>

            {/* Crypto & Other */}
            {(summary.cryptoTotal > 0 || summary.otherTotal > 0) && (
              <Pressable
                onPress={() => {
                  setActivePreset('custom');
                  setIncludeCryptoOther((prev) => !prev);
                }}
                style={[styles.checkboxItem, includeCryptoOther && styles.checkboxItemActive]}
              >
                <Ionicons
                  name={includeCryptoOther ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={includeCryptoOther ? colors.moss : colors.mist}
                />
                <Text style={[type.fine, styles.checkboxLabel]}>
                  Other: {fmtMoney(summary.cryptoTotal + summary.otherTotal, '₹')}
                </Text>
              </Pressable>
            )}

            {/* Deduct Borrowed */}
            {summary.totalBorrowed > 0 && (
              <Pressable
                onPress={() => {
                  setActivePreset('custom');
                  setDeductBorrowed((prev) => !prev);
                }}
                style={[styles.checkboxItem, deductBorrowed && styles.checkboxItemAlert]}
              >
                <Ionicons
                  name={deductBorrowed ? 'checkbox' : 'square-outline'}
                  size={16}
                  color={deductBorrowed ? colors.alert : colors.mist}
                />
                <Text style={[type.fine, { color: colors.alert }]}>
                  Less Owed: -{fmtMoney(summary.totalBorrowed, '₹')}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ======================================================== */}
      {/* 1. BANK ACCOUNTS SECTION */}
      {/* ======================================================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="business-outline" size={16} color={colors.moss} />
            <Text style={[type.label, styles.sectionTitle]}>
              BANK ACCOUNTS · {fmtMoney(summary.bankTotal, '₹')}
            </Text>
          </View>
          <Pressable onPress={() => openNew('bank')} hitSlop={6} style={styles.addMiniBtn}>
            <Ionicons name="add" size={13} color={colors.moss} />
            <Text style={[type.fine, { color: colors.moss, fontWeight: '600' }]}>ADD BANK</Text>
          </Pressable>
        </View>

        {bankAccounts.length > 0 ? (
          bankAccounts.map((acc) => (
            <Pressable key={acc.id} onPress={() => openEdit(acc)} style={styles.accountRow}>
              <View style={styles.accountMain}>
                <Text style={[type.body, styles.accountName]}>{acc.name}</Text>
                {acc.institution ? (
                  <Text style={[type.fine, styles.accountSub]}>{acc.institution}</Text>
                ) : null}
              </View>
              <Text style={[type.figure, styles.accountBalance]}>
                {fmtMoney(acc.balance, '₹')}
              </Text>
            </Pressable>
          ))
        ) : (
          <Pressable onPress={() => openNew('bank')} style={styles.emptyAddBox}>
            <Ionicons name="add-circle-outline" size={16} color={colors.mist} />
            <Text style={[type.fine, { color: colors.graphite }]}>
              Add your first bank account balance
            </Text>
          </Pressable>
        )}
      </View>

      {/* ======================================================== */}
      {/* 2. STOCKS & INVESTMENTS SECTION */}
      {/* ======================================================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="trending-up-outline" size={16} color={colors.moss} />
            <Text style={[type.label, styles.sectionTitle]}>
              STOCKS & INVESTMENTS · {fmtMoney(summary.stockTotal, '₹')}
            </Text>
          </View>
          <Pressable onPress={() => openNew('stock')} hitSlop={6} style={styles.addMiniBtn}>
            <Ionicons name="add" size={13} color={colors.moss} />
            <Text style={[type.fine, { color: colors.moss, fontWeight: '600' }]}>ADD STOCK</Text>
          </Pressable>
        </View>

        {stockAccounts.length > 0 ? (
          stockAccounts.map((acc) => (
            <Pressable key={acc.id} onPress={() => openEdit(acc)} style={styles.accountRow}>
              <View style={styles.accountMain}>
                <Text style={[type.body, styles.accountName]}>{acc.name}</Text>
                {acc.institution ? (
                  <Text style={[type.fine, styles.accountSub]}>{acc.institution}</Text>
                ) : null}
              </View>
              <Text style={[type.figure, styles.accountBalance]}>
                {fmtMoney(acc.balance, '₹')}
              </Text>
            </Pressable>
          ))
        ) : (
          <Pressable onPress={() => openNew('stock')} style={styles.emptyAddBox}>
            <Ionicons name="add-circle-outline" size={16} color={colors.mist} />
            <Text style={[type.fine, { color: colors.graphite }]}>
              Add your stock portfolio or mutual funds value
            </Text>
          </Pressable>
        )}
      </View>

      {/* ======================================================== */}
      {/* 3. CASH IN HAND SECTION */}
      {/* ======================================================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="cash-outline" size={16} color={colors.moss} />
            <Text style={[type.label, styles.sectionTitle]}>
              CASH IN HAND · {fmtMoney(summary.cashTotal, '₹')}
            </Text>
          </View>
          <Pressable onPress={() => openNew('cash')} hitSlop={6} style={styles.addMiniBtn}>
            <Ionicons name="add" size={13} color={colors.moss} />
            <Text style={[type.fine, { color: colors.moss, fontWeight: '600' }]}>ADD CASH</Text>
          </Pressable>
        </View>

        {cashAccounts.length > 0 ? (
          cashAccounts.map((acc) => (
            <Pressable key={acc.id} onPress={() => openEdit(acc)} style={styles.accountRow}>
              <View style={styles.accountMain}>
                <Text style={[type.body, styles.accountName]}>{acc.name}</Text>
              </View>
              <Text style={[type.figure, styles.accountBalance]}>
                {fmtMoney(acc.balance, '₹')}
              </Text>
            </Pressable>
          ))
        ) : (
          <Pressable onPress={() => openNew('cash')} style={styles.emptyAddBox}>
            <Ionicons name="add-circle-outline" size={16} color={colors.mist} />
            <Text style={[type.fine, { color: colors.graphite }]}>
              Track physical wallet cash or home safe cash
            </Text>
          </Pressable>
        )}
      </View>

      {/* ======================================================== */}
      {/* 4. MONEY LENT & BORROWED (FROM BORROW & LEND) */}
      {/* ======================================================== */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="people-outline" size={16} color={colors.moss} />
            <Text style={[type.label, styles.sectionTitle]}>
              MONEY LENT & BORROWED
            </Text>
          </View>
          <Pressable onPress={() => router.push('/expense/borrow-lend')} hitSlop={6} style={styles.addMiniBtn}>
            <Text style={[type.fine, { color: colors.moss, fontWeight: '600' }]}>MANAGE</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.moss} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/expense/borrow-lend')}
          style={styles.accountRow}
        >
          <View style={styles.accountMain}>
            <Text style={[type.body, styles.accountName]}>Owed to You (Lent)</Text>
            <Text style={[type.fine, styles.accountSub]}>Receivable asset</Text>
          </View>
          <Text style={[type.figure, { color: colors.moss }]}>
            +{fmtMoney(summary.totalLent, '₹')}
          </Text>
        </Pressable>

        {summary.totalBorrowed > 0 ? (
          <Pressable
            onPress={() => router.push('/expense/borrow-lend')}
            style={styles.accountRow}
          >
            <View style={styles.accountMain}>
              <Text style={[type.body, styles.accountName]}>You Owe (Borrowed)</Text>
              <Text style={[type.fine, styles.accountSub]}>Liability</Text>
            </View>
            <Text style={[type.figure, { color: colors.alert }]}>
              -{fmtMoney(summary.totalBorrowed, '₹')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* ======================================================== */}
      {/* 5. CRYPTO & OTHER ASSETS */}
      {/* ======================================================== */}
      {otherAccounts.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cube-outline" size={16} color={colors.moss} />
              <Text style={[type.label, styles.sectionTitle]}>
                OTHER ASSETS · {fmtMoney(summary.cryptoTotal + summary.otherTotal, '₹')}
              </Text>
            </View>
            <Pressable onPress={() => openNew('other')} hitSlop={6} style={styles.addMiniBtn}>
              <Ionicons name="add" size={13} color={colors.moss} />
              <Text style={[type.fine, { color: colors.moss, fontWeight: '600' }]}>ADD</Text>
            </Pressable>
          </View>

          {otherAccounts.map((acc) => (
            <Pressable key={acc.id} onPress={() => openEdit(acc)} style={styles.accountRow}>
              <View style={styles.accountMain}>
                <Text style={[type.body, styles.accountName]}>{acc.name}</Text>
                {acc.institution ? (
                  <Text style={[type.fine, styles.accountSub]}>{acc.institution}</Text>
                ) : null}
              </View>
              <Text style={[type.figure, styles.accountBalance]}>
                {fmtMoney(acc.balance, '₹')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Account Add/Edit Modal */}
      <AccountModal
        visible={modalVisible}
        item={selectedAccount}
        initialType={initialType}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
      />
    </ScrollView>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.paper },
    content: {
      padding: SPACE.page,
      paddingTop: 52,
      paddingBottom: 48,
      gap: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      padding: 4,
    },
    headerTitle: {
      color: colors.ink,
      letterSpacing: 0.8,
      fontWeight: '700',
    },
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    headerAddText: {
      color: colors.moss,
      fontWeight: '600',
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 16,
      gap: 12,
    },
    heroLabel: {
      color: colors.mist,
      letterSpacing: 0.8,
    },
    heroAmount: {
      letterSpacing: -1.2,
      color: colors.ink,
      fontSize: 38,
      fontWeight: '700',
    },
    presetScroll: {
      flexDirection: 'row',
      marginTop: 4,
    },
    presetChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.rule,
      marginRight: 8,
    },
    presetChipActive: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    presetChipText: {
      color: colors.graphite,
    },
    presetChipTextActive: {
      color: colors.paper,
      fontWeight: '600',
    },
    checkboxContainer: {
      marginTop: 6,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
      gap: 8,
    },
    checkboxTitle: {
      color: colors.mist,
      fontSize: 9,
    },
    checkboxGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    checkboxItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 6,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    checkboxItemActive: {
      borderColor: colors.moss,
    },
    checkboxItemAlert: {
      borderColor: colors.alert,
    },
    checkboxLabel: {
      color: colors.ink,
    },
    section: {
      gap: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    sectionTitle: {
      color: colors.moss,
      letterSpacing: 0.8,
      fontSize: 11,
    },
    addMiniBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    accountMain: {
      gap: 2,
    },
    accountName: {
      color: colors.ink,
      fontWeight: '600',
    },
    accountSub: {
      color: colors.graphite,
    },
    accountBalance: {
      color: colors.ink,
      fontWeight: '600',
    },
    emptyAddBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.rule,
      borderStyle: 'dashed',
    },
  });
}
