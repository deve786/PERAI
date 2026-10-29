import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney, net } from '@/expense/stats';
import { FONTS } from '@/theme';
import type { ExpenseRow, Recurring } from '@/expense/db';

interface FinancialInsightsCardProps {
  expenses: ExpenseRow[];
  recurring: Recurring[];
  totalSpent: number;
  budget: number;
  symbol?: string;
  onRefresh?: () => void;
}

export function FinancialInsightsCard({
  expenses,
  recurring,
  totalSpent,
  budget,
  symbol = '₹',
}: FinancialInsightsCardProps) {
  // 1. Calculate weekly category surge
  const surgeInsight = useMemo(() => {
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const thisWeekCats = new Map<string, number>();
    const prevWeekCats = new Map<string, number>();

    for (const exp of expenses) {
      const expNet = net(exp);
      if (expNet <= 0) continue;
      if (exp.date >= oneWeekAgo) {
        thisWeekCats.set(exp.cat_name, (thisWeekCats.get(exp.cat_name) || 0) + expNet);
      } else if (exp.date >= twoWeeksAgo && exp.date < oneWeekAgo) {
        prevWeekCats.set(exp.cat_name, (prevWeekCats.get(exp.cat_name) || 0) + expNet);
      }
    }

    let maxSurgeCat = '';
    let maxSurgePct = 0;
    let maxSurgeAmount = 0;

    for (const [cat, amt] of thisWeekCats.entries()) {
      const prev = prevWeekCats.get(cat) || 0;
      if (prev > 0) {
        const pct = Math.round(((amt - prev) / prev) * 100);
        if (pct > maxSurgePct) {
          maxSurgePct = pct;
          maxSurgeCat = cat;
          maxSurgeAmount = amt;
        }
      }
    }

    if (maxSurgeCat && maxSurgePct > 0) {
      return `${maxSurgeCat} surged +${maxSurgePct}% this week (${fmtMoney(maxSurgeAmount, symbol)})`;
    }
    return null;
  }, [expenses, symbol]);

  // 2. Upcoming bill countdown
  const billInsight = useMemo(() => {
    if (recurring.length > 0) {
      const today = new Date();
      const currentDay = today.getDate();
      const sorted = [...recurring].sort((a, b) => {
        const diffA = a.day >= currentDay ? a.day - currentDay : 30 + a.day - currentDay;
        const diffB = b.day >= currentDay ? b.day - currentDay : 30 + b.day - currentDay;
        return diffA - diffB;
      });
      const nextBill = sorted[0];
      const daysUntil = nextBill.day >= currentDay ? nextBill.day - currentDay : 30 + nextBill.day - currentDay;
      const daysText = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'in 1 day' : `in ${daysUntil} days`;
      return `Upcoming bill: ${nextBill.note || 'Subscription'} ${fmtMoney(nextBill.amount, symbol)} due ${daysText}`;
    }
    return null;
  }, [recurring, symbol]);

  // 3. Projected savings target
  const savingsInsight = useMemo(() => {
    if (budget <= 0) return null;
    const remaining = Math.max(0, budget - totalSpent);
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(1, daysInMonth - now.getDate());
    const dailyTarget = Math.round(remaining / daysLeft);
    if (totalSpent > budget) {
      return `Monthly budget exceeded by ${fmtMoney(totalSpent - budget, symbol)}. Reduce discretionary spend.`;
    }
    return `Save ~${fmtMoney(remaining, symbol)} if daily spend stays < ${fmtMoney(dailyTarget, symbol)}/day`;
  }, [budget, totalSpent, symbol]);

  const items = useMemo(() => {
    const list: string[] = [];
    if (surgeInsight) list.push(surgeInsight);
    else if (expenses.length > 0) list.push('Spending pace steady across all categories this week');
    if (billInsight) list.push(billInsight);
    if (savingsInsight) list.push(savingsInsight);
    return list;
  }, [surgeInsight, expenses.length, billInsight, savingsInsight]);

  if (items.length === 0) return null;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={13} color="#a78bfa" />
        <Text style={styles.headerTitle}>Smart AI Financial Insights</Text>
      </View>

      <View style={styles.insightsList}>
        {items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.itemText} numberOfLines={2}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#141720',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#c4b5fd',
  },
  insightsList: {
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  bulletDot: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    color: '#a78bfa',
    lineHeight: 16,
  },
  itemText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    lineHeight: 16,
    color: '#e2e8f0',
    flex: 1,
  },
});
