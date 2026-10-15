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
  const { memories } = useMemories();
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

      {/* Day Overview — only when scrubbed away from today, since the Daily
          Briefing above already summarizes today's tasks and spending. */}
      {!isViewingToday ? (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={[type.stamp, styles.summaryLabel]}>TASKS</Text>
            <Text style={[type.label, styles.summaryValue]}>
              {selectedDateMemories.length} items
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
      ) : null}

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
        </>
      ) : selectedDateMemories.length > 0 ? (
        <Section label={`TASKS & REMINDERS · ${selectedDate}`}>
          {memoryRows(selectedDateMemories)}
        </Section>
      ) : null}

      {/* ======================================================== */}
      {/* EXPENSE SECTION: Financial entries for this day */}
      {/* ======================================================== */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={type.label}>EXPENSES</Text>
          <View style={styles.sectionActions}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/expense/expense',
                  params: { date: selectedDate },
                })
              }
              hitSlop={10}
            >
              <Text style={[type.label, styles.actionLink]}>ADD</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/expense/expense',
                  params: { scan: '1', date: selectedDate },
                })
              }
              hitSlop={10}
            >
              <Text style={[type.label, styles.actionLink]}>SCAN</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.sectionRule} />

        {dayExpenses.map((exp) => (
          <ExpenseItem
            key={exp.id}
            e={exp}
            showDate={false}
            onDeleted={loadFinancialData}
          />
        ))}
      </View>

      {/* ======================================================== */}
      {/* INCOME SECTION: If any income on this date */}
      {/* ======================================================== */}
      {dayIncome.length > 0 ? (
        <Section label={`INCOME · +${currencySymbol}${totalDayIncome}`}>
          {dayIncome.map((inc) => (
            <IncomeItem
              key={inc.id}
              e={inc}
              showDate={false}
              onDeleted={loadFinancialData}
            />
          ))}
        </Section>
      ) : null}

      {/* ======================================================== */}
      {/* LOANS / BORROW & LEND: If any active loans on this date */}
      {/* ======================================================== */}
      {dayLoans.length > 0 ? (
        <Section label="LOANS & BORROWED">
          {dayLoans.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => router.push('/expense/borrow-lend')}
              style={({ pressed }) => [styles.loanRow, pressed && styles.loanRowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>
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
        </Section>
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
    section: {
      gap: 4,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    sectionActions: {
      flexDirection: 'row',
      gap: 14,
    },
    actionLink: {
      color: colors.mist,
    },
    sectionRule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.rule,
      marginBottom: 2,
    },
    loanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    loanRowPressed: {
      opacity: 0.55,
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
