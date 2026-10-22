import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { todayStr } from '@/expense/dates';
import { fmtMoney, sum } from '@/expense/stats';
import { saveExpense, type Recurring } from '@/expense/db';
import { radius, useTheme } from '@/expense/theme';
import { Row, Section, T } from '@/expense/ui';

interface Props {
  recurring: Recurring[];
  onBillPaid?: () => void;
}

interface BillScheduleItem {
  id: string;
  note: string;
  categoryName: string;
  amount: number;
  method: string;
  dueDay: number;
  dueDateStr: string; // YYYY-MM-DD
  dueInDays: number;
  categoryId: string;
}

export function UpcomingBills({ recurring, onBillPaid }: Props) {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const today = todayStr();

  const scheduled = useMemo(() => {
    const year = Number(today.slice(0, 4));
    const monthIndex = Number(today.slice(5, 7)) - 1; // 0-based
    const dayNow = Number(today.slice(8, 10));

    const daysInCurrentMonth = new Date(year, monthIndex + 1, 0).getDate();
    const daysInNextMonth = new Date(year, monthIndex + 2, 0).getDate();

    const items: BillScheduleItem[] = [];

    for (const r of recurring) {
      let targetYear = year;
      let targetMonth0 = monthIndex;
      let targetDay = Math.min(r.day, daysInCurrentMonth);

      let dueIn = targetDay - dayNow;
      if (dueIn < 0) {
        // Roll to next month
        targetMonth0 = monthIndex + 1;
        if (targetMonth0 > 11) {
          targetMonth0 = 0;
          targetYear += 1;
        }
        targetDay = Math.min(r.day, daysInNextMonth);
        dueIn = (daysInCurrentMonth - dayNow) + targetDay;
      }

      const mm = String(targetMonth0 + 1).padStart(2, '0');
      const dd = String(targetDay).padStart(2, '0');
      const dueDateStr = `${targetYear}-${mm}-${dd}`;

      items.push({
        id: r.id,
        note: r.note || r.cat_name || 'Recurring bill',
        categoryName: r.cat_name || 'Bills',
        amount: r.amount,
        method: r.method,
        dueDay: r.day,
        dueDateStr,
        dueInDays: dueIn,
        categoryId: r.category_id,
      });
    }

    return items.sort((a, b) => a.dueInDays - b.dueInDays);
  }, [recurring, today]);

  const totalUpcoming = sum(scheduled);

  const handlePayNow = async (bill: BillScheduleItem) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await saveExpense({
        amount: bill.amount,
        category_id: bill.categoryId,
        date: today,
        note: bill.note,
        notes: `Paid early from upcoming bills (${bill.dueDateStr})`,
        method: bill.method || 'UPI',
        user_tag: '',
      });
      onBillPaid?.();
    } catch (err) {
      console.warn('Could not record bill payment:', err);
    }
  };

  if (scheduled.length === 0) {
    return null;
  }

  const shown = scheduled.slice(0, 4);

  return (
    <View>
      <Section
        title="Upcoming bills"
        right={
          <Pressable onPress={() => router.push('/expense/recurring')} hitSlop={10} accessibilityRole="button">
            <T size={14} weight="600" style={{ color: c.accent }}>Manage</T>
          </Pressable>
        }
      />
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Row style={[styles.summary, { borderBottomColor: c.line }]}>
          <T size={13} sub style={{ flex: 1 }}>
            {scheduled.length} due in the next 30 days
          </T>
          <T size={13} sub>Total </T>
          <T size={14} weight="600" tabular>{fmtMoney(totalUpcoming, symbol)}</T>
        </Row>

        {shown.map((bill, i) => {
          const isUrgent = bill.dueInDays <= 3;
          const dueLabel =
            bill.dueInDays === 0
              ? 'Due today'
              : bill.dueInDays === 1
                ? 'Due tomorrow'
                : `Due in ${bill.dueInDays} days`;

          return (
            <Row
              key={bill.id}
              style={[styles.billRow, { borderBottomColor: c.line, borderBottomWidth: i === shown.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
            >
              <View style={{ flex: 1 }}>
                <T size={15} weight="500" numberOfLines={1}>{bill.note}</T>
                <T size={13} numberOfLines={1} style={{ marginTop: 1, color: isUrgent ? c.danger : c.sub }}>
                  {dueLabel} · Day {bill.dueDay}{bill.method ? ` · ${bill.method}` : ''}
                </T>
              </View>
              <T size={15} weight="500" tabular>{fmtMoney(bill.amount, symbol)}</T>
              <Pressable
                onPress={() => void handlePayNow(bill)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${bill.note} paid now`}
                style={({ pressed }) => [
                  styles.payButton,
                  { borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <T size={14} weight="600" style={{ color: c.accent }}>Pay</T>
              </Pressable>
            </Row>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  summary: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  billRow: {
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
  },
  payButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
