import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
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
  listBorrowLend,
  settleBorrowLend,
  getBorrowLendSummary,
  type BorrowLendItem,
  type BorrowLendSummary,
  type BorrowLendType,
} from '@/expense/borrowLendDb';
import { BorrowLendModal } from '@/components/BorrowLendModal';
import { todayStr, prettyDate } from '@/expense/dates';
import { fmtMoney } from '@/expense/stats';
import { showDialog } from '@/dialogStore';

type FilterTab = 'all' | 'lent' | 'request' | 'borrowed' | 'settled';

export default function BorrowLendScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const [items, setItems] = useState<BorrowLendItem[]>([]);
  const [summary, setSummary] = useState<BorrowLendSummary>({
    totalLentActive: 0,
    totalBorrowedActive: 0,
    pendingRequestsCount: 0,
    pendingRequestsAmount: 0,
  });
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BorrowLendItem | null>(null);
  const [newType, setNewType] = useState<BorrowLendType>('lent');

  const today = todayStr();

  const loadData = useCallback(async () => {
    try {
      const [list, sumData] = await Promise.all([
        listBorrowLend(),
        getBorrowLendSummary(),
      ]);
      setItems(list);
      setSummary(sumData);
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
              await settleBorrowLend(item.id, { recordAsIncome: false });
              void loadData();
            })();
          },
        },
        {
          label: item.type === 'lent' ? 'Yes, record as income' : 'Yes, mark paid',
          onPress: () => {
            void (async () => {
              await settleBorrowLend(item.id, { recordAsIncome: item.type === 'lent' });
              void loadData();
            })();
          },
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

  // Filter items based on active tab
  const filteredItems = items.filter((it) => {
    if (activeTab === 'all') return it.status === 'active';
    if (activeTab === 'lent') return it.type === 'lent' && it.status === 'active';
    if (activeTab === 'request') return it.type === 'request' && it.status === 'active';
    if (activeTab === 'borrowed') return it.type === 'borrowed' && it.status === 'active';
    if (activeTab === 'settled') return it.status === 'settled';
    return true;
  });

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back-outline" size={22} color={colors.ink} />
        </Pressable>
        <Text style={[type.label, styles.screenTitle]}>BORROW & LEND</Text>
        <Pressable onPress={() => openNew('lent')} hitSlop={12} style={styles.addBtn}>
          <Ionicons name="add" size={20} color={colors.paper} />
          <Text style={[type.label, styles.addBtnText]}>NEW</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Summary Balance Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, styles.lentCard]}>
            <Text style={[type.stamp, styles.summaryLabel]}>OWED TO YOU</Text>
            <Text style={[type.figure, styles.lentFigure]}>
              {fmtMoney(summary.totalLentActive, '₹')}
            </Text>
            <Text style={[type.fine, styles.summarySub]}>Money you lent</Text>
          </View>

          <View style={[styles.summaryCard, styles.borrowedCard]}>
            <Text style={[type.stamp, styles.summaryLabel]}>YOU OWE</Text>
            <Text style={[type.figure, styles.borrowedFigure]}>
              {fmtMoney(summary.totalBorrowedActive, '₹')}
            </Text>
            <Text style={[type.fine, styles.summarySub]}>Money you borrowed</Text>
          </View>
        </View>

        {summary.pendingRequestsCount > 0 ? (
          <Pressable
            onPress={() => setActiveTab('request')}
            style={styles.requestBanner}
          >
            <Ionicons name="help-circle-outline" size={17} color={colors.moss} />
            <Text style={[type.body, styles.requestBannerText]}>
              {summary.pendingRequestsCount} pending borrow {summary.pendingRequestsCount === 1 ? 'request' : 'requests'} ({fmtMoney(summary.pendingRequestsAmount, '₹')})
            </Text>
            <Ionicons name="chevron-forward-outline" size={16} color={colors.mist} />
          </Pressable>
        ) : null}

        {/* Tab Filters */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab('all')}
            style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          >
            <Text style={[type.label, styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              ACTIVE
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('lent')}
            style={[styles.tab, activeTab === 'lent' && styles.tabActive]}
          >
            <Text style={[type.label, styles.tabText, activeTab === 'lent' && styles.tabTextActive]}>
              OWED TO ME
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('request')}
            style={[styles.tab, activeTab === 'request' && styles.tabActive]}
          >
            <Text style={[type.label, styles.tabText, activeTab === 'request' && styles.tabTextActive]}>
              REQUESTS
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('borrowed')}
            style={[styles.tab, activeTab === 'borrowed' && styles.tabActive]}
          >
            <Text style={[type.label, styles.tabText, activeTab === 'borrowed' && styles.tabTextActive]}>
              I OWE
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('settled')}
            style={[styles.tab, activeTab === 'settled' && styles.tabActive]}
          >
            <Text style={[type.label, styles.tabText, activeTab === 'settled' && styles.tabTextActive]}>
              SETTLED
            </Text>
          </Pressable>
        </View>

        {/* List of Entries */}
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={32} color={colors.mist} />
            <Text style={[type.body, styles.emptyText]}>
              {activeTab === 'settled'
                ? 'No settled entries yet.'
                : activeTab === 'request'
                  ? 'No pending borrow requests.'
                  : 'No active records in this category.'}
            </Text>
            <Pressable onPress={() => openNew('lent')} style={styles.emptyActionBtn}>
              <Text style={[type.label, styles.emptyActionText]}>+ RECORD LOAN OR BORROW</Text>
            </Pressable>
          </View>
        ) : (
          filteredItems.map((item) => {
            const isSettled = item.status === 'settled';
            const isLent = item.type === 'lent';
            const isRequest = item.type === 'request';

            // Calculate due status
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
              <Pressable
                key={item.id}
                onPress={() => openEdit(item)}
                style={({ pressed }) => [
                  styles.itemCard,
                  pressed && styles.itemCardPressed,
                  isSettled && styles.itemCardSettled,
                ]}
              >
                <View style={styles.itemMainRow}>
                  {/* Person Avatar */}
                  <View
                    style={[
                      styles.avatar,
                      isLent ? styles.avatarLent : isRequest ? styles.avatarRequest : styles.avatarBorrowed,
                    ]}
                  >
                    <Text style={styles.avatarText}>
                      {item.person_name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={styles.itemInfo}>
                    <View style={styles.nameRow}>
                      <Text style={[type.entry, styles.personName]} numberOfLines={1}>
                        {item.person_name}
                      </Text>
                      <View
                        style={[
                          styles.typeBadge,
                          isLent ? styles.badgeLent : isRequest ? styles.badgeRequest : styles.badgeBorrowed,
                        ]}
                      >
                        <Text
                          style={[
                            type.stamp,
                            isLent ? styles.badgeTextLent : isRequest ? styles.badgeTextRequest : styles.badgeTextBorrowed,
                          ]}
                        >
                          {isLent ? 'LENT' : isRequest ? 'REQUEST' : 'BORROWED'}
                        </Text>
                      </View>
                    </View>

                    {item.notes ? (
                      <Text style={[type.fine, styles.notesText]} numberOfLines={1}>
                        {item.notes}
                      </Text>
                    ) : null}

                    <Text
                      style={[
                        type.stamp,
                        styles.dueText,
                        isOverdue ? styles.overdueText : null,
                      ]}
                    >
                      {dueText}
                    </Text>
                  </View>

                  {/* Amount */}
                  <View style={styles.amountCol}>
                    <Text
                      style={[
                        type.figure,
                        styles.itemAmount,
                        isSettled && styles.settledAmount,
                        !isSettled && isLent && styles.lentAmount,
                        !isSettled && !isLent && styles.borrowedAmount,
                      ]}
                    >
                      {fmtMoney(item.amount, '₹')}
                    </Text>
                  </View>
                </View>

                {/* Quick Actions */}
                {!isSettled ? (
                  <View style={styles.cardActions}>
                    <Pressable
                      onPress={() => handleSettle(item)}
                      style={styles.settleBtn}
                      hitSlop={6}
                    >
                      <Ionicons name="checkmark-circle-outline" size={15} color={colors.moss} />
                      <Text style={[type.label, styles.settleBtnText]}>
                        {isLent ? 'MARK RETURNED' : isRequest ? 'FULFIL / LEND' : 'MARK PAID'}
                      </Text>
                    </Pressable>

                    {isLent ? (
                      <Pressable
                        onPress={() => void handleShareReminder(item)}
                        style={styles.remindBtn}
                        hitSlop={6}
                      >
                        <Ionicons name="paper-plane-outline" size={14} color={colors.graphite} />
                        <Text style={[type.label, styles.remindBtnText]}>REMIND</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
      <BorrowLendModal
        visible={modalVisible}
        item={selectedItem}
        initialType={newType}
        onClose={() => setModalVisible(false)}
        onSaved={loadData}
      />
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.paper,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.page,
      paddingTop: 54,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    backBtn: {
      padding: 6,
    },
    screenTitle: {
      color: colors.ink,
      fontWeight: '700',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.ink,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 14,
    },
    addBtnText: {
      color: colors.paper,
      fontSize: 11,
      fontWeight: '700',
    },
    content: {
      padding: SPACE.page,
      paddingBottom: 40,
      gap: 16,
    },
    summaryContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    summaryCard: {
      flex: 1,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      gap: 4,
    },
    lentCard: {
      backgroundColor: colors.surface,
      borderColor: colors.rule,
    },
    borrowedCard: {
      backgroundColor: colors.surface,
      borderColor: colors.rule,
    },
    summaryLabel: {
      color: colors.mist,
      fontSize: 10,
    },
    lentFigure: {
      color: colors.moss,
      fontSize: 22,
      fontWeight: '700',
    },
    borrowedFigure: {
      color: colors.alert,
      fontSize: 22,
      fontWeight: '700',
    },
    summarySub: {
      color: colors.graphite,
      fontSize: 11,
    },
    requestBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      borderRadius: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 8,
    },
    requestBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.ink,
      fontWeight: '500',
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    tab: {
      flex: 1,
      paddingVertical: 6,
      alignItems: 'center',
      borderRadius: 6,
    },
    tabActive: {
      backgroundColor: colors.ink,
    },
    tabText: {
      color: colors.mist,
      fontSize: 9.5,
    },
    tabTextActive: {
      color: colors.paper,
      fontWeight: '700',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 12,
    },
    emptyText: {
      color: colors.mist,
      textAlign: 'center',
    },
    emptyActionBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.rule,
      backgroundColor: colors.surface,
    },
    emptyActionText: {
      color: colors.graphite,
      fontSize: 11,
    },
    itemCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
      gap: 10,
    },
    itemCardPressed: {
      opacity: 0.8,
    },
    itemCardSettled: {
      opacity: 0.6,
    },
    itemMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLent: {
      backgroundColor: colors.rule,
    },
    avatarRequest: {
      backgroundColor: colors.rule,
    },
    avatarBorrowed: {
      backgroundColor: colors.rule,
    },
    avatarText: {
      fontFamily: FONTS.mono,
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
    },
    itemInfo: {
      flex: 1,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    personName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.ink,
    },
    typeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    badgeLent: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.moss,
    },
    badgeRequest: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.graphite,
    },
    badgeBorrowed: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.alert,
    },
    badgeTextLent: {
      color: colors.moss,
      fontSize: 9,
      fontWeight: '600',
    },
    badgeTextRequest: {
      color: colors.graphite,
      fontSize: 9,
      fontWeight: '600',
    },
    badgeTextBorrowed: {
      color: colors.alert,
      fontSize: 9,
      fontWeight: '600',
    },
    notesText: {
      color: colors.graphite,
      fontSize: 12,
    },
    dueText: {
      color: colors.mist,
      fontSize: 11,
      marginTop: 2,
    },
    overdueText: {
      color: colors.alert,
      fontWeight: '600',
    },
    amountCol: {
      alignItems: 'flex-end',
    },
    itemAmount: {
      fontSize: 17,
      fontWeight: '700',
    },
    lentAmount: {
      color: colors.moss,
    },
    borrowedAmount: {
      color: colors.alert,
    },
    settledAmount: {
      color: colors.mist,
      textDecorationLine: 'line-through',
    },
    cardActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    settleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    settleBtnText: {
      color: colors.moss,
      fontSize: 10.5,
      fontWeight: '600',
    },
    remindBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    remindBtnText: {
      color: colors.graphite,
      fontSize: 10.5,
      fontWeight: '600',
    },
  });
}
