import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/expense/theme';
import { Card, Chip, Empty, ListCard, ListRow, PillButton, Screen, Segmented, T, TopBar } from '@/expense/ui';
import {
  listBorrowLend,
  settleBorrowLend,
  getBorrowLendSummary,
  type BorrowLendItem,
  type BorrowLendSummary,
  type BorrowLendType,
} from '@/expense/borrowLendDb';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { BorrowLendModal } from '@/components/BorrowLendModal';
import { todayStr, prettyDate } from '@/expense/dates';
import { fmtMoney } from '@/expense/stats';
import { showDialog } from '@/dialogStore';

type StatusTab = 'active' | 'requests' | 'settled';
type Who = 'all' | 'lent' | 'borrowed';

const VIEWS: { key: StatusTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'requests', label: 'Requests' },
  { key: 'settled', label: 'Settled' },
];

const WHO: { key: Who; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lent', label: 'Owed to me' },
  { key: 'borrowed', label: 'I owe' },
];

export default function BorrowLendScreen() {
  const { c } = useTheme();
  const router = useRouter();

  const [items, setItems] = useState<BorrowLendItem[]>([]);
  const [summary, setSummary] = useState<BorrowLendSummary>({
    totalLentActive: 0,
    totalBorrowedActive: 0,
    pendingRequestsCount: 0,
    pendingRequestsAmount: 0,
  });
  const [view, setView] = useState<StatusTab>('active');
  const [who, setWho] = useState<Who>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BorrowLendItem | null>(null);
  const [newType, setNewType] = useState<BorrowLendType>('lent');
  const [bankAccounts, setBankAccounts] = useState<AccountItem[]>([]);

  const today = todayStr();

  const loadData = useCallback(async () => {
    try {
      const [list, sumData, accounts] = await Promise.all([
        listBorrowLend(),
        getBorrowLendSummary(),
        listAccounts({ type: 'bank' }),
      ]);
      setItems(list);
      setSummary(sumData);
      setBankAccounts(accounts);
    } catch (err) {
      console.warn('Could not load borrow/lend data:', err);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openNew = (defaultType: BorrowLendType = 'lent') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedItem(null);
    setNewType(defaultType);
    setModalVisible(true);
  };

  const openEdit = (item: BorrowLendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedItem(item);
    setModalVisible(true);
  };

  /** Records the settlement as income (lent) or an expense (borrowed), optionally tied to a bank account. */
  const settleWithAccount = (item: BorrowLendItem, accountId: string | null) => {
    void (async () => {
      await settleBorrowLend(item.id, {
        recordAsIncome: item.type === 'lent',
        recordAsExpense: item.type === 'borrowed',
        method: accountId ? 'UPI' : 'Cash',
        accountId,
      });
      void loadData();
    })();
  };

  /** Asks which bank the money landed in (lent) or left from (borrowed) — skipped when there's no bank account to pick. */
  const pickBankThenSettle = (item: BorrowLendItem) => {
    if (bankAccounts.length === 0) {
      settleWithAccount(item, null);
      return;
    }
    showDialog({
      title: item.type === 'lent' ? 'Which bank did it land in?' : 'Which bank did you pay it from?',
      actions: [
        { label: 'Cancel', cancel: true },
        { label: 'Not through a bank', onPress: () => settleWithAccount(item, null) },
        ...bankAccounts.map((a) => ({
          label: a.institution ? `${a.name} · ${a.institution}` : a.name,
          onPress: () => settleWithAccount(item, a.id),
        })),
      ],
    });
  };

  const handleSettle = (item: BorrowLendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const verb = item.type === 'lent' ? 'returned to you' : 'paid back';

    showDialog({
      title: 'Mark as settled?',
      message: `Confirm that ₹${item.amount} was ${verb} by ${item.person_name}?`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Just mark settled',
          onPress: () => {
            void (async () => {
              await settleBorrowLend(item.id, { recordAsIncome: false, recordAsExpense: false });
              void loadData();
            })();
          },
        },
        {
          label: item.type === 'lent' ? 'Yes, record as income' : 'Yes, mark paid',
          onPress: () => pickBankThenSettle(item),
        },
      ],
    });
  };

  const handleShareReminder = async (item: BorrowLendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const dateText = item.due_date ? `due on ${prettyDate(item.due_date)}` : `from ${prettyDate(item.date)}`;
    const message = `Hey ${item.person_name}, hope you're doing well! Just a gentle reminder regarding the ₹${item.amount} (${dateText}). Please let me know when you can transfer it. Thanks!`;

    try {
      await Share.share({ message });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  // Status tabs, then who-owes-whom chips. Every earlier view is still here:
  // Active + All, Owed to me, I owe; Requests; Settled.
  const filteredItems = items.filter((it) => {
    if (view === 'requests') return it.type === 'request' && it.status === 'active';
    if (it.type === 'request') return false;
    const statusOk = view === 'settled' ? it.status === 'settled' : it.status === 'active';
    if (!statusOk) return false;
    if (who === 'all') return true;
    return it.type === who;
  });

  const empty =
    view === 'settled'
      ? { title: 'Nothing settled yet', hint: 'Loans you mark as returned or paid show up here.' }
      : view === 'requests'
      ? { title: 'No pending requests', hint: 'When someone asks to borrow money, note it here.' }
      : who === 'all'
      ? { title: 'No open loans', hint: 'When you lend or borrow money, note it here and see who still owes what.' }
      : { title: 'Nothing here', hint: who === 'lent' ? 'No one owes you money right now.' : 'You don’t owe anyone right now.' };

  return (
    <Screen>
      <TopBar
        title="Borrow & lend"
        onBack={() => router.back()}
        right={<PillButton label="+ New" primary onPress={() => openNew('lent')} />}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}>
            <T size={13} sub>They owe you</T>
            <T size={24} weight="600" tabular style={{ color: c.accent }} numberOfLines={1}>
              {fmtMoney(summary.totalLentActive, '₹')}
            </T>
            <T size={12} sub>Money you lent</T>
          </Card>
          <Card style={styles.summaryCard}>
            <T size={13} sub>You owe</T>
            <T size={24} weight="600" tabular style={{ color: c.danger }} numberOfLines={1}>
              {fmtMoney(summary.totalBorrowedActive, '₹')}
            </T>
            <T size={12} sub>Money you borrowed</T>
          </Card>
        </View>

        {summary.pendingRequestsCount > 0 ? (
          <ListCard>
            <ListRow
              icon="help-circle-outline"
              iconColor={c.accent}
              label={`${summary.pendingRequestsCount} pending borrow ${summary.pendingRequestsCount === 1 ? 'request' : 'requests'}`}
              value={fmtMoney(summary.pendingRequestsAmount, '₹')}
              onPress={() => setView('requests')}
              last
            />
          </ListCard>
        ) : null}

        <View>
          <Segmented options={VIEWS} value={view} onChange={setView} />
          {view !== 'requests' ? (
            <View style={styles.chips}>
              {WHO.map((w) => (
                <Chip key={w.key} label={w.label} active={who === w.key} onPress={() => setWho(w.key)} />
              ))}
            </View>
          ) : null}
        </View>

        {filteredItems.length === 0 ? (
          <Empty
            icon="people-outline"
            title={empty.title}
            hint={empty.hint}
            action={{ label: 'Record a loan', onPress: () => openNew('lent') }}
          />
        ) : (
          <ListCard>
            {filteredItems.map((item, i) => {
              const isSettled = item.status === 'settled';
              const isLent = item.type === 'lent';
              const isRequest = item.type === 'request';
              const tone = isSettled ? c.faint : isLent ? c.accent : isRequest ? c.sub : c.danger;

              let dueText = '';
              let isOverdue = false;
              const givenVerb = isLent ? 'Gave' : isRequest ? 'Asked' : 'Took';
              const dateGivenStr = `${givenVerb} ${prettyDate(item.date)}`;

              if (item.due_date && !isSettled) {
                if (item.due_date < today) {
                  isOverdue = true;
                  dueText = `${dateGivenStr} · Overdue (due ${prettyDate(item.due_date)})`;
                } else if (item.due_date === today) {
                  dueText = `${dateGivenStr} · Due today!`;
                } else {
                  dueText = `${dateGivenStr} · Due ${prettyDate(item.due_date)}`;
                }
              } else if (isSettled && item.settled_at) {
                dueText = `${dateGivenStr} · Settled ${prettyDate(item.settled_at.slice(0, 10))}`;
              } else {
                dueText = dateGivenStr;
              }

              return (
                <View
                  key={item.id}
                  style={[
                    styles.item,
                    { borderBottomColor: c.line, borderBottomWidth: i === filteredItems.length - 1 ? 0 : StyleSheet.hairlineWidth },
                  ]}
                >
                  <Pressable
                    onPress={() => openEdit(item)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.6 : isSettled ? 0.7 : 1 }]}
                  >
                    <View style={[styles.avatar, { backgroundColor: c.well }]}>
                      <T size={13} weight="600" tabular>{item.person_name.slice(0, 2).toUpperCase()}</T>
                    </View>

                    <View style={{ flex: 1, gap: 1 }}>
                      <T size={16} weight="700" numberOfLines={1}>{item.person_name}</T>
                      <T size={13} style={{ color: tone }}>
                        {isLent ? 'Lent' : isRequest ? 'Request' : 'Borrowed'}
                        {item.notes ? <T size={13} sub>{` · ${item.notes}`}</T> : null}
                      </T>
                      <T size={13} style={{ color: isOverdue ? c.danger : c.sub }} weight={isOverdue ? '600' : '400'}>
                        {dueText}
                      </T>
                    </View>

                    <T
                      size={16}
                      weight="600"
                      tabular
                      style={[{ color: tone }, isSettled && { textDecorationLine: 'line-through' }]}
                    >
                      {fmtMoney(item.amount, '₹')}
                    </T>
                  </Pressable>

                  {!isSettled ? (
                    <View style={styles.actions}>
                      {isLent ? (
                        <PillButton
                          label="Remind"
                          icon="paper-plane-outline"
                          onPress={() => void handleShareReminder(item)}
                        />
                      ) : null}
                      <PillButton
                        label={isLent ? 'Mark returned' : isRequest ? 'Fulfil / lend' : 'Mark paid'}
                        icon="checkmark-circle-outline"
                        tone={c.accent}
                        onPress={() => handleSettle(item)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ListCard>
        )}
      </ScrollView>

      <BorrowLendModal
        visible={modalVisible}
        item={selectedItem}
        initialType={newType}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 14, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginBottom: -8 },
  item: { paddingVertical: 12, gap: 10 },
  itemMain: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
