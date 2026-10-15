import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { todayStr } from '@/expense/dates';
import { fmtMoney, sum } from '@/expense/stats';
import { saveExpense, type Recurring } from '@/expense/db';
import { numerals, radius, useTheme } from '@/expense/theme';
import { Row, T } from '@/expense/ui';

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
    return (
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Row style={{ gap: 8, alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={17} color={c.sub} />
            <T size={14} weight="600">Upcoming Bills & Renewals</T>
          </Row>
          <Pressable onPress={() => router.push('/expense/recurring')} hitSlop={8}>
            <T size={12.5} sub>Manage ›</T>
          </Pressable>
        </Row>
        <T size={13} sub style={{ marginTop: 8 }}>
          No recurring subscriptions or bills active. Set them up in settings to track renewal forecasts.
        </T>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Row style={{ gap: 8, alignItems: 'center' }}>
          <Ionicons name="calendar-outline" size={17} color={c.accent} />
          <T size={14} weight="700">Upcoming Bills (Next 30 Days)</T>
        </Row>
        <Pressable onPress={() => router.push('/expense/recurring')} hitSlop={8}>
          <T size={12.5} sub>Manage ›</T>
        </Pressable>
      </Row>

      <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <T size={12.5} sub>{scheduled.length} upcoming commitments</T>
        <T size={14} weight="700" tabular style={{ color: c.accent }}>
          Total {fmtMoney(totalUpcoming, symbol)}
        </T>
      </Row>

      <View style={styles.list}>
        {scheduled.slice(0, 4).map((bill) => {
          const isUrgent = bill.dueInDays <= 3;
          const dueLabel =
            bill.dueInDays === 0
              ? 'Due today'
              : bill.dueInDays === 1
                ? 'Due tomorrow'
                : `Due in ${bill.dueInDays} days`;

          return (
            <Row key={bill.id} style={[styles.billRow, { borderBottomColor: c.line }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row style={{ gap: 6, alignItems: 'center' }}>
                  <T size={14} weight="600" numberOfLines={1}>
                    {bill.note}
                  </T>
                  {bill.method ? (
                    <View style={[styles.methodBadge, { backgroundColor: c.bg }]}>
                      <T size={10} sub>{bill.method}</T>
                    </View>
                  ) : null}
                </Row>
                <T
                  size={12}
                  weight={isUrgent ? '600' : '400'}
                  style={{ color: isUrgent ? c.danger : c.sub }}
                >
                  {dueLabel} · Day {bill.dueDay}
                </T>
              </View>

              <Row style={{ gap: 10, alignItems: 'center' }}>
                <T size={14} weight="700" tabular>
                  {fmtMoney(bill.amount, symbol)}
                </T>
                <Pressable
                  onPress={() => void handlePayNow(bill)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.payButton,
                    { backgroundColor: c.bg, borderColor: c.line },
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityLabel={`Mark ${bill.note} paid now`}
                >
                  <T size={11} weight="600" style={{ color: c.good }}>Pay</T>
                </Pressable>
              </Row>
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
    padding: 16,
    marginTop: 20,
    gap: 10,
  },
  list: {
    marginTop: 6,
  },
  billRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  methodBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  payButton: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
});
