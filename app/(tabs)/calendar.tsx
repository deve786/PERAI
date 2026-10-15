import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DailyBriefing } from '@/components/DailyBriefing';
import { DateScrubber } from '@/components/DateScrubber';
import { MemoryRow } from '@/components/MemoryRow';
import { Section } from '@/components/Section';
import { SnoozeModal } from '@/components/SnoozeModal';
import { completeMemory } from '@/complete';
import { planDay } from '@/today';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { useMemories } from '@/useMemories';
import {
  listExpenses,
  listIncome,
  getSetting,
  type ExpenseRow,
  type IncomeRow,
} from '@/expense/db';
import {
  listBorrowLend,
  type BorrowLendItem,
} from '@/expense/borrowLendDb';
import { prettyDate, todayStr as getTodayStr } from '@/expense/dates';
import { fmtMoney, sum } from '@/expense/stats';
import { ExpenseItem } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';

export default function CalendarScreen() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const router = useRouter();

  const todayStr = useMemo(() => getTodayStr(), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [snoozingMemory, setSnoozingMemory] = useState<Memory | null>(null);

  // PERAI memories data
  const { memories, loading: memoriesLoading } = useMemories();
  const plan = useMemo(() => planDay(memories), [memories]);

  // Expense & Financial data for the selected date
  const [dayExpenses, setDayExpenses] = useState<ExpenseRow[]>([]);
  const [dayIncome, setDayIncome] = useState<IncomeRow[]>([]);
  const [dayLoans, setDayLoans] = useState<BorrowLendItem[]>([]);
  const [allExpenseDates, setAllExpenseDates] = useState<string[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('₹');

  // Load financial data for selectedDate and all dates for dots
  const loadFinancialData = useCallback(async () => {
    try {
      const [exps, incs, loans, allExps, sym] = await Promise.all([
        listExpenses(selectedDate, selectedDate),
        listIncome(selectedDate, selectedDate),
        listBorrowLend({ status: 'active' }),
        listExpenses(),
        getSetting('currency_symbol', '₹'),
      ]);

      setDayExpenses(exps);
      setDayIncome(incs);
      setDayLoans(
        loans.filter(
          (l) => l.date === selectedDate || (l.due_date && l.due_date === selectedDate)
        )
      );
      setAllExpenseDates(allExps.map((e) => e.date));
      setCurrencySymbol(sym || '₹');
    } catch (err) {
      console.warn('Could not load calendar financial data:', err);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      void loadFinancialData();
    }, [loadFinancialData])
  );

  // Combined set of dates that have activity (memories, expenses, loans) for dots
  const activityDates = useMemo(() => {
    const dates = new Set<string>();
    for (const m of memories) {
      if (m.status === 'active' && m.eventDate) {
        dates.add(m.eventDate.slice(0, 10));
      }
    }
    for (const d of allExpenseDates) {
      dates.add(d);
    }
    return dates;
  }, [memories, allExpenseDates]);

  // Memories specifically on the selected date if different from today
  const selectedDateMemories = useMemo(() => {
    if (selectedDate === todayStr) return [];
    return memories.filter(
      (m) => m.eventDate && m.eventDate.slice(0, 10) === selectedDate
    );
  }, [memories, selectedDate, todayStr]);

  const openMemory = (memory: Memory) => router.push(`/entry/${memory.id}`);
  const tickMemory = (memory: Memory) => void completeMemory(memory);

  const memoryRows = (list: Memory[]) =>
    list.map((memory) => (
      <View key={memory.id} style={styles.rowContainer}>
        <View style={styles.rowMain}>
          <MemoryRow
            memory={memory}
            gutter="date"
            showAdded={false}
            onPress={() => tickMemory(memory)}
            onLongPress={() => openMemory(memory)}
          />
        </View>
        <Pressable
          onPress={() => setSnoozingMemory(memory)}
          hitSlop={10}
          style={({ pressed }) => [styles.snoozeButton, pressed && styles.snoozeButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Snooze ${memory.title}`}
        >
          <Ionicons name="alarm-outline" size={17} color={colors.mist} />
        </Pressable>
      </View>
    ));

  const isViewingToday = selectedDate === todayStr;
  const totalDaySpent = sum(dayExpenses);
  const totalDayIncome = sum(dayIncome);
  const hasTasksToday = plan.overdue.length + plan.today.length + plan.tomorrow.length > 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={type.display}>Calendar</Text>
          <Text style={[type.label, styles.subtitle]}>
            {prettyDate(selectedDate).toUpperCase()}
          </Text>
        </View>

        {!isViewingToday ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setSelectedDate(todayStr);
            }}
            hitSlop={8}
            style={styles.todayBadge}
          >
            <Ionicons name="return-up-back" size={13} color={colors.moss} />
            <Text style={[type.label, styles.todayBadgeText]}>JUMP TO TODAY</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Feature 4: Proactive AI Daily Morning Briefing (when on Today) */}
      {isViewingToday ? (
        <DailyBriefing memories={memories} onOpenEntry={openMemory} />
      ) : null}

      {/* Feature 12: Calendar Strip with Activity Dots */}
      <DateScrubber
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        activityDates={activityDates}
        daysRange={14}
      />

      {/* Day Overview Summary Pills */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={[type.stamp, styles.summaryLabel]}>TASKS</Text>
          <Text style={[type.label, styles.summaryValue]}>
            {isViewingToday
              ? `${plan.today.length + plan.overdue.length} items`
              : `${selectedDateMemories.length} items`}
          </Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryItem}>
          <Text style={[type.stamp, styles.summaryLabel]}>SPENT</Text>
          <Text
            style={[
              type.label,
              totalDaySpent > 0 ? styles.summarySpentActive : styles.summaryValue,
            ]}
          >
            {totalDaySpent > 0 ? `${currencySymbol}${totalDaySpent}` : '₹0'}
          </Text>
        </View>

        {totalDayIncome > 0 ? (
          <>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[type.stamp, styles.summaryLabel]}>INCOME</Text>
              <Text style={[type.label, styles.summaryIncomeActive]}>
                +{currencySymbol}{totalDayIncome}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* ======================================================== */}
      {/* PERAI SECTION: Tasks, Reminders & Memories */}
      {/* ======================================================== */}
      {isViewingToday ? (
        <>
          {plan.overdue.length > 0 ? (
            <Section label={`OVERDUE · ${plan.overdue.length}`}>
              {memoryRows(plan.overdue)}
            </Section>
          ) : null}

          {plan.today.length > 0 ? (
            <Section label="TODAY" tone="ahead">
              {memoryRows(plan.today)}
            </Section>
          ) : null}

          {plan.tomorrow.length > 0 ? (
            <Section label="TOMORROW">{memoryRows(plan.tomorrow)}</Section>
          ) : null}

          {!memoriesLoading && !hasTasksToday ? (
            <Text style={[type.body, styles.clearText]}>
              No tasks due today or tomorrow. Anything you record with a date shows up here.
            </Text>
          ) : null}
        </>
      ) : (
        <Section label={`TASKS & REMINDERS · ${selectedDate}`}>
          {selectedDateMemories.length > 0 ? (
            memoryRows(selectedDateMemories)
          ) : (
            <Text style={[type.body, styles.clearText]}>
              No tasks or reminders recorded for {selectedDate}.
            </Text>
          )}
        </Section>
      )}

      {/* ======================================================== */}
      {/* EXPENSE SECTION: Financial entries for this day */}
      {/* ======================================================== */}
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="wallet-outline" size={15} color={colors.moss} />
            <Text style={[type.label, styles.sectionTitle]}>
              EXPENSES {totalDaySpent > 0 ? `· ${currencySymbol}${totalDaySpent}` : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/expense/expense',
                  params: { date: selectedDate },
                })
              }
              hitSlop={8}
              style={styles.addSmallBtn}
            >
              <Ionicons name="add" size={14} color={colors.moss} />
              <Text style={[type.label, styles.addSmallText]}>ADD</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/expense/expense',
                  params: { scan: '1', date: selectedDate },
                })
              }
              hitSlop={8}
              style={styles.addSmallBtn}
            >
              <Ionicons name="camera-outline" size={13} color={colors.moss} />
              <Text style={[type.label, styles.addSmallText]}>SCAN</Text>
            </Pressable>
          </View>
        </View>

        {dayExpenses.length > 0 ? (
          <View style={styles.expenseList}>
            {dayExpenses.map((exp) => (
              <ExpenseItem
                key={exp.id}
                e={exp}
                showDate={false}
                onDeleted={loadFinancialData}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyExpenseBox}>
            <Text style={[type.body, styles.clearText]}>
              No expenses recorded for this day.
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/expense/expense',
                  params: { date: selectedDate },
                })
              }
              style={styles.quickAddLink}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.moss} />
              <Text style={[type.label, { color: colors.moss }]}>
                Add an expense for this date
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ======================================================== */}
      {/* INCOME SECTION: If any income on this date */}
      {/* ======================================================== */}
      {dayIncome.length > 0 ? (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="arrow-down-circle-outline" size={15} color={colors.moss} />
              <Text style={[type.label, styles.sectionTitle]}>
                INCOME · +{currencySymbol}{totalDayIncome}
              </Text>
            </View>
          </View>
          <View style={styles.expenseList}>
            {dayIncome.map((inc) => (
              <IncomeItem
                key={inc.id}
                e={inc}
                showDate={false}
                onDeleted={loadFinancialData}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* ======================================================== */}
      {/* LOANS / BORROW & LEND: If any active loans on this date */}
      {/* ======================================================== */}
      {dayLoans.length > 0 ? (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="people-outline" size={15} color={colors.alert} />
              <Text style={[type.label, { color: colors.alert }]}>
                LOANS & BORROWED
              </Text>
            </View>
          </View>
          {dayLoans.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => router.push('/expense/borrow-lend')}
              style={styles.loanCard}
            >
              <View>
                <Text style={[type.body, { fontWeight: '600', color: colors.ink }]}>
                  {l.person_name} ({l.type === 'lent' ? 'Lent to them' : 'Borrowed'})
                </Text>
                <Text style={[type.label, { color: colors.graphite, marginTop: 2 }]}>
                  {l.due_date === selectedDate ? 'Due on this date' : 'Recorded on this date'}
                </Text>
              </View>
              <Text style={[type.figure, { color: colors.alert }]}>
                {currencySymbol}{l.amount}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Feature 5: One-Tap Quick Snooze Modal */}
      <SnoozeModal
        visible={Boolean(snoozingMemory)}
        memory={snoozingMemory}
        onClose={() => setSnoozingMemory(null)}
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
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    subtitle: {
      color: colors.graphite,
      marginTop: 2,
      fontSize: 11,
    },
    todayBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      marginTop: 4,
    },
    todayBadgeText: {
      color: colors.moss,
      fontSize: 10,
      fontWeight: '600',
    },
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    summaryItem: {
      alignItems: 'center',
      gap: 2,
    },
    summaryLabel: {
      color: colors.mist,
      fontSize: 9,
    },
    summaryValue: {
      color: colors.ink,
      fontSize: 12,
    },
    summarySpentActive: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '700',
    },
    summaryIncomeActive: {
      color: colors.moss,
      fontSize: 12,
      fontWeight: '700',
    },
    summaryDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.rule,
    },
    sectionContainer: {
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
      fontSize: 11,
      letterSpacing: 0.8,
    },
    addSmallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
    },
    addSmallText: {
      color: colors.moss,
      fontSize: 10,
      fontWeight: '600',
    },
    expenseList: {
      gap: 0,
    },
    emptyExpenseBox: {
      paddingVertical: 12,
      gap: 8,
    },
    quickAddLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    loanCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 6,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.rule,
      marginTop: 6,
    },
    clearText: {
      maxWidth: 320,
      color: colors.graphite,
    },
    rowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    rowMain: {
      flex: 1,
    },
    snoozeButton: {
      padding: 8,
      marginLeft: 4,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    snoozeButtonPressed: {
      opacity: 0.6,
      backgroundColor: colors.surface,
    },
  });
}
