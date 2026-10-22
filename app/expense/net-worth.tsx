import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  listAccounts,
  getNetWorthSummary,
  type AccountItem,
  type AccountType,
  type NetWorthSummary,
} from '@/expense/accountsDb';
import { stockGain } from '@/expense/accountsLogic';
import { CATEGORY_COLORS } from '@/expense/db';
import { AccountModal } from '@/components/AccountModal';
import { fmtMoney } from '@/expense/stats';
import { radius, useTheme } from '@/expense/theme';
import { ListCard, PillButton, Row, Screen, Segmented, T, TopBar } from '@/expense/ui';

type PresetMode = 'liquid' | 'withStocks' | 'withLend' | 'netWorth' | 'custom';

const PRESETS: { key: PresetMode; label: string }[] = [
  { key: 'liquid', label: 'Liquid' },
  { key: 'withStocks', label: '+ Stocks' },
  { key: 'withLend', label: '+ Lent' },
  { key: 'netWorth', label: 'All' },
];

export default function NetWorthScreen() {
  const { c } = useTheme();
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

  // Which parts count towards the total.
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

  const presetLabel = () => {
    switch (activePreset) {
      case 'liquid':
        return 'In hand · bank and cash';
      case 'withStocks':
        return 'Total with stocks';
      case 'withLend':
        return 'Total with money lent';
      case 'netWorth':
        return 'Total net worth';
      default:
        return 'Custom total';
    }
  };

  const bankAccounts = accounts.filter((a) => a.type === 'bank');
  const stockAccounts = accounts.filter((a) => a.type === 'stock');
  const cashAccounts = accounts.filter((a) => a.type === 'cash');
  const otherAccounts = accounts.filter((a) => a.type === 'crypto' || a.type === 'other');
  const otherTotal = summary.cryptoTotal + summary.otherTotal;

  // One colour per part, shared by the bar and the chips. The palette's amber
  // and the category colours read on both paper and the dark surface.
  const parts: { key: string; label: string; value: number; color: string; on: boolean; toggle: () => void; show: boolean }[] = [
    { key: 'bank', label: 'Bank', value: summary.bankTotal, color: c.accent, on: includeBank, toggle: () => setIncludeBank((p) => !p), show: true },
    { key: 'cash', label: 'Cash', value: summary.cashTotal, color: c.warn, on: includeCash, toggle: () => setIncludeCash((p) => !p), show: true },
    { key: 'stock', label: 'Stocks', value: summary.stockTotal, color: CATEGORY_COLORS[1], on: includeStock, toggle: () => setIncludeStock((p) => !p), show: true },
    { key: 'other', label: 'Other', value: otherTotal, color: CATEGORY_COLORS[3], on: includeCryptoOther, toggle: () => setIncludeCryptoOther((p) => !p), show: summary.cryptoTotal > 0 || summary.otherTotal > 0 },
    { key: 'lent', label: 'Lent', value: summary.totalLent, color: CATEGORY_COLORS[7], on: includeLend, toggle: () => setIncludeLend((p) => !p), show: true },
  ];
  const barParts = parts.filter((p) => p.show && p.on && p.value > 0);
  const barSum = barParts.reduce((s, p) => s + p.value, 0);

  const addRow = (label: string, t: AccountType) => (
    <Pressable
      onPress={() => openNew(t)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.addRow, { opacity: pressed ? 0.6 : 1 }]}
    >
      <T size={14} weight="700" style={{ color: c.accent }}>{label}</T>
    </Pressable>
  );

  const accountRow = (acc: AccountItem, title: string, sub: string, icon: keyof typeof Ionicons.glyphMap, extra?: React.ReactNode) => (
    <Pressable
      key={acc.id}
      onPress={() => openEdit(acc)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { borderBottomColor: c.line, opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.tile, { backgroundColor: c.accentSoft }]}>
        <Ionicons name={icon} size={18} color={c.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T size={16} weight="700" numberOfLines={1}>{title}</T>
        {sub ? <T size={13} sub numberOfLines={1}>{sub}</T> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T size={15} weight="600" tabular>{fmtMoney(acc.balance, '₹')}</T>
        {extra}
      </View>
    </Pressable>
  );

  const sectionHead = (title: string, total: number) => (
    <Row style={styles.sectionHead}>
      <T size={16} weight="700">{title}</T>
      <T size={14} sub tabular>{fmtMoney(total, '₹')}</T>
    </Row>
  );

  const addTile = (title: string, label: string, t: AccountType) => (
    <Pressable
      key={t}
      onPress={() => openNew(t)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.addTile, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
    >
      <T size={13} sub>{title}</T>
      <T size={15} weight="700" style={{ color: c.accent }}>{label}</T>
    </Pressable>
  );

  return (
    <Screen>
      <TopBar
        title="Net worth"
        onBack={() => router.back()}
        right={<PillButton label="+ Add" tone={c.accent} onPress={() => openNew('bank')} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Total and what goes into it */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line, padding: 16, gap: 12 }]}>
          <View style={{ gap: 2 }}>
            <T size={13} sub>{presetLabel()}</T>
            <T size={36} weight="600" tabular style={{ letterSpacing: -1.2 }}>{fmtMoney(computedTotal, '₹')}</T>
          </View>

          <View style={[styles.bar, { backgroundColor: c.well }]}>
            {barParts.map((p) => (
              <View key={p.key} style={{ flex: p.value / barSum, backgroundColor: p.color }} />
            ))}
          </View>

          <View style={styles.chipWrap}>
            {parts.filter((p) => p.show).map((p) => (
              <Pressable
                key={p.key}
                onPress={() => {
                  setActivePreset('custom');
                  p.toggle();
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: p.on }}
                accessibilityLabel={`${p.label} ${fmtMoney(p.value, '₹')}`}
                style={({ pressed }) => [
                  styles.partChip,
                  {
                    borderColor: p.on ? c.accent : c.border,
                    backgroundColor: p.on ? c.accentSoft : c.card,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    p.on ? { backgroundColor: p.color } : { borderWidth: 1.5, borderColor: c.faint },
                  ]}
                />
                <T size={13} sub={!p.on}>{p.label} {fmtMoney(p.value, '₹')}</T>
              </Pressable>
            ))}
            {summary.totalBorrowed > 0 ? (
              <Pressable
                onPress={() => {
                  setActivePreset('custom');
                  setDeductBorrowed((prev) => !prev);
                }}
                accessibilityRole="switch"
                accessibilityState={{ checked: deductBorrowed }}
                accessibilityLabel={`Less owed ${fmtMoney(summary.totalBorrowed, '₹')}`}
                style={({ pressed }) => [
                  styles.partChip,
                  {
                    borderColor: deductBorrowed ? c.danger : c.border,
                    backgroundColor: c.card,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    deductBorrowed ? { backgroundColor: c.danger } : { borderWidth: 1.5, borderColor: c.faint },
                  ]}
                />
                <T size={13} style={{ color: deductBorrowed ? c.danger : c.sub }}>
                  Less owed −{fmtMoney(summary.totalBorrowed, '₹')}
                </T>
              </Pressable>
            ) : null}
          </View>

          <T size={12} sub>Tap a part to leave it out of the total.</T>

          <Segmented<PresetMode>
            options={PRESETS}
            value={activePreset}
            onChange={selectPreset}
          />
        </View>

        {/* Bank accounts */}
        <View>
          {sectionHead('Bank accounts', summary.bankTotal)}
          <ListCard>
            {bankAccounts.map((acc) => {
              const bank = (acc.institution || '').trim();
              return accountRow(acc, bank || acc.name, bank ? acc.name : '', 'business-outline');
            })}
            {addRow(bankAccounts.length > 0 ? '+ Add bank' : '+ Add your first bank account', 'bank')}
          </ListCard>
        </View>

        {/* Stocks */}
        {stockAccounts.length > 0 ? (
          <View>
            {sectionHead('Stocks', summary.stockTotal)}
            <ListCard>
              {stockAccounts.map((acc) => {
                const gain = stockGain(acc);
                const payer = acc.pay_account_id ? accounts.find((a) => a.id === acc.pay_account_id) : undefined;
                const paidWith = payer
                  ? `${acc.pay_method} · ${payer.institution || payer.name}`
                  : acc.pay_method && acc.pay_method !== 'None'
                  ? acc.pay_method
                  : '';
                const sub = [acc.institution, paidWith].filter(Boolean).join(' · ');
                const extra = gain.profit !== 0 ? (
                  <T size={13} style={{ color: gain.profit > 0 ? c.accent : c.danger }}>
                    {gain.profit > 0 ? '+' : '−'}
                    {fmtMoney(Math.abs(gain.profit), '₹')}
                    {gain.percent !== null ? ` (${gain.profit > 0 ? '+' : '−'}${Math.abs(gain.percent)}%)` : ''}
                  </T>
                ) : null;
                return accountRow(acc, acc.name, sub, 'trending-up-outline', extra);
              })}
              {addRow('+ Add stock', 'stock')}
            </ListCard>
          </View>
        ) : null}

        {/* Cash */}
        {cashAccounts.length > 0 ? (
          <View>
            {sectionHead('Cash', summary.cashTotal)}
            <ListCard>
              {cashAccounts.map((acc) => accountRow(acc, acc.name, '', 'cash-outline'))}
              {addRow('+ Add cash', 'cash')}
            </ListCard>
          </View>
        ) : null}

        {/* Crypto and other assets */}
        {otherAccounts.length > 0 ? (
          <View>
            {sectionHead('Other assets', otherTotal)}
            <ListCard>
              {otherAccounts.map((acc) =>
                accountRow(acc, acc.name, acc.institution || '', acc.type === 'crypto' ? 'logo-bitcoin' : 'cube-outline'),
              )}
              {addRow('+ Add other', 'other')}
            </ListCard>
          </View>
        ) : null}

        {/* Nothing saved yet for stocks or cash: a quiet way to start */}
        {stockAccounts.length === 0 || cashAccounts.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {cashAccounts.length === 0 ? addTile('Cash', '+ Add cash', 'cash') : null}
            {stockAccounts.length === 0 ? addTile('Stocks', '+ Add a stock', 'stock') : null}
          </View>
        ) : null}

        {/* Lent and borrowed, kept on the Borrow & lend screen */}
        <Pressable
          onPress={() => router.push('/expense/borrow-lend')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, styles.lendRow, { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="people-outline" size={20} color={c.sub} />
          <View style={{ flex: 1 }}>
            <T size={15} weight="700">Lent & borrowed</T>
            <T size={13} sub>
              Owed to you {fmtMoney(summary.totalLent, '₹')} · You owe {fmtMoney(summary.totalBorrowed, '₹')}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.faint} />
        </Pressable>
      </ScrollView>

      <AccountModal
        visible={modalVisible}
        item={selectedAccount}
        initialType={initialType}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16 },
  card: { borderRadius: radius.lg, borderWidth: 1 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  partChip: {
    minHeight: 34, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sectionHead: { justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addRow: { minHeight: 46, justifyContent: 'center' },
  addTile: {
    flex: 1, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: 12, gap: 4, minHeight: 66,
  },
  lendRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
