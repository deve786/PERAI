import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { DailyBriefing, StatBox } from '@/components/DailyBriefing';
import { DateScrubber } from '@/components/DateScrubber';
import { MemoryRow } from '@/components/MemoryRow';
import { SnoozeModal } from '@/components/SnoozeModal';
import { completeMemory } from '@/complete';
import { planDay } from '@/today';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, SPACE, type Colors } from '@/theme';
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
import { fromStr, monthName, todayStr as getTodayStr } from '@/expense/dates';
import { fmtMoney, sum } from '@/expense/stats';
import { ExpenseItem } from '@/expense/ExpenseItem';
import { IncomeItem } from '@/expense/IncomeItem';
import { PillButton, Screen, TopBar } from '@/expense/ui';

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thursday, 22 Oct" — with the year only when it is not this one. */
function dayHeading(date: string): string {
  const d = fromStr(date);
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${monthName(d.getMonth())}${year}`;
}

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

  // Opened from Record and More; when there is nothing to go back to
  // (e.g. a deep link), go to Record instead of doing nothing.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const jumpToToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedDate(todayStr);
  };

  // New plans are made by saying or typing them on Record.
  const addPlan = () => router.navigate('/');

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
          hitSlop={6}
          style={({ pressed }) => [styles.snoozeButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Snooze ${memory.title}`}
        >
          <Ionicons name="alarm-outline" size={19} color={colors.graphite} />
        </Pressable>
      </View>
    ));

  /** A small grey heading with an optional figure or control on the right. */
  const heading = (label: string, right?: React.ReactNode, tone?: 'alert' | 'moss') => (
    <View style={styles.subHead}>
      <Text
        style={[type.label, tone === 'alert' && styles.alertText, tone === 'moss' && styles.mossText]}
      >
        {label}
      </Text>
      {right}
    </View>
  );

  /** Rows in a white card; the rows' own bottom hairline is hidden on the last one. */
  const rowCard = (rows: React.ReactNode) => (
    <View style={styles.card}>
      <View style={styles.cardInner}>{rows}</View>
    </View>
  );

  const isViewingToday = selectedDate === todayStr;
  const totalDaySpent = sum(dayExpenses);
  const totalDayIncome = sum(dayIncome);
  const dayPlans = isViewingToday ? plan.today : selectedDateMemories;
  const hasMoney = dayExpenses.length > 0 || dayIncome.length > 0;

  const moneyTotal = [
    totalDaySpent > 0 ? `${fmtMoney(totalDaySpent, currencySymbol)} spent` : null,
    totalDayIncome > 0 ? `+${fmtMoney(totalDayIncome, currencySymbol)} in` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen edges={['top']}>
      <TopBar
        title="Calendar"
        onBack={goBack}
        right={<PillButton label="Today" onPress={jumpToToday} disabled={isViewingToday} />}
      />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <DateScrubber
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          activityDates={activityDates}
        />

        {/* Today gets the briefing; any other day a summary of that day. */}
        {isViewingToday ? (
          <DailyBriefing memories={memories} onOpenEntry={openMemory} />
        ) : (
          <View style={styles.stats}>
            <StatBox label="Plans" value={String(selectedDateMemories.length)} />
            <StatBox
              label="Spent"
              value={fmtMoney(totalDaySpent, currencySymbol)}
              mono
            />
            <StatBox
              label="Income"
              value={totalDayIncome > 0 ? `+${fmtMoney(totalDayIncome, currencySymbol)}` : fmtMoney(0, currencySymbol)}
              tone={totalDayIncome > 0 ? 'moss' : undefined}
              mono
            />
          </View>
        )}

        <Text style={styles.dayHeading}>{dayHeading(selectedDate)}</Text>

        {isViewingToday && plan.overdue.length > 0 ? (
          <View style={styles.group}>
            {heading(`Overdue · ${plan.overdue.length}`, undefined, 'alert')}
            {rowCard(memoryRows(plan.overdue))}
          </View>
        ) : null}

        <View style={styles.group}>
          {heading(
            'Plans',
            dayPlans.length > 0 ? (
              <Pressable onPress={addPlan} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add a plan">
                <Text style={[type.label, styles.mossText]}>+ Add</Text>
              </Pressable>
            ) : undefined
          )}
          {dayPlans.length > 0 ? (
            rowCard(memoryRows(dayPlans))
          ) : (
            <View style={[styles.card, styles.emptyRow]}>
              <Text style={[type.body, styles.flexText]}>Nothing planned for this day.</Text>
              <PillButton label="+ Add" tone={colors.moss} onPress={addPlan} />
            </View>
          )}
        </View>

        {isViewingToday && plan.tomorrow.length > 0 ? (
          <View style={styles.group}>
            {heading('Tomorrow')}
            {rowCard(memoryRows(plan.tomorrow))}
          </View>
        ) : null}

        <View style={styles.group}>
          {heading(
            'Money',
            moneyTotal ? <Text style={styles.total}>{moneyTotal}</Text> : undefined
          )}
          <View style={styles.card}>
            {hasMoney ? (
              <View style={styles.cardInner}>
                {dayExpenses.map((exp) => (
                  <ExpenseItem
                    key={exp.id}
                    e={exp}
                    showDate={false}
                    onDeleted={loadFinancialData}
                  />
                ))}
                {dayIncome.map((inc) => (
                  <IncomeItem
                    key={inc.id}
                    e={inc}
                    showDate={false}
                    onDeleted={loadFinancialData}
                  />
                ))}
              </View>
            ) : (
              <Text style={[type.body, styles.moneyEmpty]}>Nothing spent or earned on this day.</Text>
            )}
            <View style={[styles.moneyFooter, hasMoney && styles.moneyFooterRule]}>
              <PillButton
                label="+ Expense"
                tone={colors.moss}
                onPress={() =>
                  router.push({
                    pathname: '/expense/expense',
                    params: { date: selectedDate },
                  })
                }
              />
              <PillButton
                label="Scan"
                icon="scan-outline"
                onPress={() =>
                  router.push({
                    pathname: '/expense/expense',
                    params: { scan: '1', date: selectedDate },
                  })
                }
              />
            </View>
          </View>
        </View>

        {dayLoans.length > 0 ? (
          <View style={styles.group}>
            {heading('Lent and borrowed')}
            {rowCard(
              dayLoans.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() => router.push('/expense/borrow-lend')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.loanRow, pressed && styles.pressed]}
                >
                  <View style={styles.flexText}>
                    <Text style={type.entry} numberOfLines={1}>
                      {l.person_name}
                    </Text>
                    <Text style={type.stamp}>
                      {l.type === 'lent' ? 'Lent to them' : 'Borrowed'} ·{' '}
                      {l.due_date === selectedDate ? 'Due on this day' : 'Recorded on this day'}
                    </Text>
                  </View>
                  <Text style={[type.figure, styles.alertText]}>
                    {fmtMoney(l.amount, currencySymbol)}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.mist} />
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        <SnoozeModal
          visible={Boolean(snoozingMemory)}
          memory={snoozingMemory}
          onClose={() => setSnoozingMemory(null)}
        />
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      paddingHorizontal: SPACE.page,
      paddingTop: 12,
      paddingBottom: 48,
      gap: 16,
    },
    stats: { flexDirection: 'row', gap: 8 },
    dayHeading: {
      fontFamily: FONTS.sansSemi,
      fontSize: 17,
      lineHeight: 23,
      color: colors.ink,
      marginTop: 4,
    },
    group: { gap: 8 },
    subHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingHorizontal: 14,
      overflow: 'hidden',
    },
    cardInner: { marginBottom: -1 },
    emptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    flexText: { flex: 1 },
    total: { fontFamily: FONTS.mono, fontSize: 14, color: colors.graphite },
    moneyEmpty: { paddingTop: 14 },
    moneyFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    moneyFooterRule: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    alertText: { color: colors.alert },
    mossText: { color: colors.moss },
    loanRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 60,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    pressed: { opacity: 0.6 },
    rowContainer: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    rowMain: {
      flex: 1,
    },
    // Carries the same hairline as the row beside it, so the rule runs edge to edge.
    snoozeButton: {
      width: 44,
      marginRight: -8,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
  });
}
