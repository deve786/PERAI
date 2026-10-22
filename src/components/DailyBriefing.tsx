import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { planDay } from '@/today';
import { listExpenses, listRecurring, getSetting } from '@/expense/db';
import { listBorrowLend } from '@/expense/borrowLendDb';
import { monthName, monthRange, todayStr } from '@/expense/dates';
import { fmtMoney, sum } from '@/expense/stats';

interface Props {
  memories: Memory[];
  onOpenEntry?: (memory: Memory) => void;
}

/** One small figure in a grey box: "Overdue / 0". Shared with the Calendar's other-day summary. */
export function StatBox({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: 'alert' | 'moss';
  /** Money reads in mono; counts in sans, as in the design. */
  mono?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[
          mono ? styles.statMoney : styles.statCount,
          tone === 'alert' && styles.alertValue,
          tone === 'moss' && styles.mossValue,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

/** The day at a glance: a greeting, one line about the day, three figures. */
export function DailyBriefing({ memories }: Props) {
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

        // Bills due in the next 7 days
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

        // Active borrow/lend items due soon or overdue
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

  // The one line about the day.
  const headline =
    overdueCount > 0
      ? `${overdueCount} overdue ${overdueCount === 1 ? 'task needs' : 'tasks need'} attention.`
      : todayCount > 0
        ? `${todayCount} ${todayCount === 1 ? 'thing' : 'things'} planned for today.`
        : 'Your day is clear.';

  // A second, quieter line for money that needs noticing: a loan, a bill, the budget.
  const moneyNote = useMemo(() => {
    if (loanAlert) {
      return `${loanAlert.person}'s loan of ${fmtMoney(loanAlert.amount, currencySymbol)} is ${loanAlert.dueText}.`;
    }
    if (urgentBill) {
      const whenStr = urgentBill.dueInDays === 0 ? 'today' : urgentBill.dueInDays === 1 ? 'tomorrow' : `in ${urgentBill.dueInDays} days`;
      return `${urgentBill.name} (${fmtMoney(urgentBill.amount, currencySymbol)}) is due ${whenStr}.`;
    }
    if (spentThisMonth !== null && monthlyBudget > 0) {
      const pct = Math.round((spentThisMonth / monthlyBudget) * 100);
      return `${pct}% of your ${fmtMoney(monthlyBudget, currencySymbol)} monthly budget is spent.`;
    }
    return null;
  }, [loanAlert, urgentBill, spentThisMonth, monthlyBudget, currencySymbol]);

  const monthShort = monthName(Number(today.slice(5, 7)) - 1);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hides the figures' : 'Shows the figures'}
      >
        <View style={styles.headerText}>
          <Text style={type.fine}>{greeting}</Text>
          <Text style={styles.headline}>{headline}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.mist}
        />
      </Pressable>

      {moneyNote ? (
        <View style={styles.noteRow}>
          <Ionicons
            name={loanAlert ? 'people-outline' : urgentBill ? 'repeat-outline' : 'wallet-outline'}
            size={15}
            color={loanAlert?.isOverdue ? colors.alert : colors.moss}
          />
          <Text style={[type.fine, styles.noteText, loanAlert?.isOverdue && styles.alertValue]}>
            {moneyNote}
          </Text>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.stats}>
          <StatBox label="Overdue" value={String(overdueCount)} tone={overdueCount > 0 ? 'alert' : undefined} />
          <StatBox label="Due today" value={String(todayCount)} />
          <StatBox
            label={`Spent in ${monthShort}`}
            value={spentThisMonth !== null ? fmtMoney(spentThisMonth, currencySymbol) : '—'}
            mono
          />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
      gap: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    headerText: { flex: 1, gap: 2 },
    headline: { fontFamily: FONTS.sansSemi, fontSize: 16, lineHeight: 22, color: colors.ink },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: -4 },
    noteText: { flex: 1 },
    stats: { flexDirection: 'row', gap: 8 },
    stat: {
      flex: 1,
      backgroundColor: colors.well,
      borderRadius: RADIUS.input,
      padding: 10,
      gap: 2,
    },
    statLabel: { fontFamily: FONTS.sans, fontSize: 12, color: colors.graphite },
    statCount: { fontFamily: FONTS.sansSemi, fontSize: 20, lineHeight: 26, color: colors.ink },
    statMoney: { fontFamily: FONTS.monoMedium, fontSize: 17, lineHeight: 26, color: colors.ink },
    alertValue: { color: colors.alert },
    mossValue: { color: colors.moss },
  });
}
