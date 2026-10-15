import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { planDay } from '@/today';
import { listExpenses, listRecurring, getSetting, type ExpenseRow, type Recurring } from '@/expense/db';
import { listBorrowLend } from '@/expense/borrowLendDb';
import { monthRange, todayStr } from '@/expense/dates';
import { sum, fmtMoney } from '@/expense/stats';

interface Props {
  memories: Memory[];
  onOpenEntry?: (memory: Memory) => void;
}

export function DailyBriefing({ memories, onOpenEntry }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const [expanded, setExpanded] = useState(true);
  const [spentThisMonth, setSpentThisMonth] = useState<number | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [upcomingBills, setUpcomingBills] = useState<{ name: string; amount: number; dueInDays: number }[]>([]);
  const [loanAlert, setLoanAlert] = useState<{ person: string; amount: number; dueText: string; isOverdue: boolean } | null>(null);

  const today = todayStr();
  const plan = useMemo(() => planDay(memories), [memories]);

  // Determine greeting based on current local hour
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const year = Number(today.slice(0, 4));
        const month0 = Number(today.slice(5, 7)) - 1;
        const { from, to } = monthRange(year, month0);

        const [monthExpenses, recurringList, budgetStr, sym, blList] = await Promise.all([
          listExpenses(from, to),
          listRecurring(),
          getSetting('monthly_budget', '0'),
          getSetting('currency_symbol', '₹'),
          listBorrowLend({ status: 'active' }).catch(() => []),
        ]);

        if (!mounted) return;

        setSpentThisMonth(sum(monthExpenses));
        setMonthlyBudget(parseFloat(budgetStr) || 0);
        setCurrencySymbol(sym || '₹');

        // Check bills due in the next 7 days
        const dayNow = Number(today.slice(8, 10));
        const daysInMonth = new Date(year, month0 + 1, 0).getDate();

        const upcoming = recurringList.map((r) => {
          let dueIn = r.day - dayNow;
          if (dueIn < 0) {
            dueIn += daysInMonth;
          }
          return {
            name: r.note || r.cat_name || 'Recurring bill',
            amount: r.amount,
            dueInDays: dueIn,
          };
        }).filter((b) => b.dueInDays >= 0 && b.dueInDays <= 7)
          .sort((a, b) => a.dueInDays - b.dueInDays);

        setUpcomingBills(upcoming);

        // Check active borrow/lend items due soon or overdue
        const activeWithDue = blList.filter((b) => b.due_date && (b.type === 'lent' || b.type === 'borrowed'));
        const urgent = activeWithDue.map((b) => {
          const diffMs = new Date(b.due_date! + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          return { ...b, diffDays };
        }).filter((b) => b.diffDays <= 3)
          .sort((a, b) => a.diffDays - b.diffDays)[0];

        if (urgent) {
          let dueText = '';
          if (urgent.diffDays < 0) {
            dueText = `${Math.abs(urgent.diffDays)}d overdue`;
          } else if (urgent.diffDays === 0) {
            dueText = 'due today';
          } else if (urgent.diffDays === 1) {
            dueText = 'due tomorrow';
          } else {
            dueText = `due in ${urgent.diffDays} days`;
          }
          setLoanAlert({
            person: urgent.person_name,
            amount: urgent.amount,
            dueText,
            isOverdue: urgent.diffDays < 0,
          });
        }
      } catch (err) {
        console.warn('Could not load DailyBriefing metrics:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [today]);

  const overdueCount = plan.overdue.length;
  const todayCount = plan.today.length;
  const urgentBill = upcomingBills[0];

  // Synthesize concise smart digest
  const digestProse = useMemo(() => {
    const parts: string[] = [];

    if (overdueCount > 0) {
      parts.push(`You have ${overdueCount} overdue ${overdueCount === 1 ? 'task' : 'tasks'} requiring attention.`);
    } else if (todayCount > 0) {
      parts.push(`${todayCount} scheduled ${todayCount === 1 ? 'item' : 'items'} planned for today.`);
    } else {
      parts.push('Your schedule is clear for today.');
    }

    if (loanAlert) {
      parts.push(`${loanAlert.person}'s loan of ${currencySymbol}${loanAlert.amount} is ${loanAlert.dueText}.`);
    } else if (urgentBill) {
      const whenStr = urgentBill.dueInDays === 0 ? 'today' : urgentBill.dueInDays === 1 ? 'tomorrow' : `in ${urgentBill.dueInDays} days`;
      parts.push(`${urgentBill.name} (${currencySymbol}${urgentBill.amount}) is due ${whenStr}.`);
    } else if (spentThisMonth !== null && monthlyBudget > 0) {
      const pct = Math.round((spentThisMonth / monthlyBudget) * 100);
      parts.push(`${pct}% of your ${currencySymbol}${monthlyBudget} monthly budget is spent.`);
    }

    return parts.join(' ');
  }, [overdueCount, todayCount, urgentBill, spentThisMonth, monthlyBudget, currencySymbol, loanAlert]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.header}
        hitSlop={8}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="sunny-outline" size={16} color={colors.moss} />
          <Text style={[type.label, styles.headerTitle]}>
            {greeting.toUpperCase()} · DAILY BRIEFING
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={16}
          color={colors.mist}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text style={[type.body, styles.digestText]}>
            {digestProse}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={[type.stamp, styles.metricLabel]}>OVERDUE</Text>
              <Text style={[type.figure, overdueCount > 0 ? styles.alertValue : styles.normalValue]}>
                {overdueCount}
              </Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={[type.stamp, styles.metricLabel]}>TODAY</Text>
              <Text style={[type.figure, styles.normalValue]}>
                {todayCount}
              </Text>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <Text style={[type.stamp, styles.metricLabel]}>THIS MONTH</Text>
              <Text style={[type.figure, styles.normalValue]}>
                {spentThisMonth !== null ? `${currencySymbol}${spentThisMonth}` : '—'}
              </Text>
            </View>

            {loanAlert ? (
              <>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={[type.stamp, styles.metricLabel]}>LOAN DUE</Text>
                  <Text style={[type.figure, loanAlert.isOverdue ? styles.alertValue : styles.billValue]} numberOfLines={1}>
                    {loanAlert.dueText}
                  </Text>
                </View>
              </>
            ) : urgentBill ? (
              <>
                <View style={styles.metricDivider} />
                <View style={styles.metricItem}>
                  <Text style={[type.stamp, styles.metricLabel]}>NEXT BILL</Text>
                  <Text style={[type.figure, styles.billValue]} numberOfLines={1}>
                    {urgentBill.dueInDays === 0 ? 'Today' : `${urgentBill.dueInDays}d`}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
      gap: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    headerTitle: {
      color: colors.moss,
      fontWeight: '600',
    },
    body: {
      gap: 12,
      marginTop: 2,
    },
    digestText: {
      color: colors.ink,
      lineHeight: 22,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    metricItem: {
      alignItems: 'center',
      flex: 1,
      gap: 2,
    },
    metricLabel: {
      color: colors.mist,
      fontSize: 10,
    },
    metricDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.rule,
    },
    normalValue: {
      color: colors.ink,
      fontSize: 16,
    },
    alertValue: {
      color: colors.alert,
      fontSize: 16,
      fontWeight: '700',
    },
    billValue: {
      color: colors.moss,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
