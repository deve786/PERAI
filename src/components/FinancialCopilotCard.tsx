import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney } from '@/expense/stats';
import { FONTS } from '@/theme';

interface FinancialCopilotCardProps {
  totalSpent: number;
  budget: number;
  symbol?: string;
}

export function FinancialCopilotCard({ totalSpent, budget, symbol = '₹' }: FinancialCopilotCardProps) {
  const effectiveBudget = budget > 0 ? budget : 25000;
  const pct = Math.min(1, Math.max(0, totalSpent / effectiveBudget));
  const spentPct = Math.round(pct * 100);
  const remaining = Math.max(0, effectiveBudget - totalSpent);
  const isOver = totalSpent > effectiveBudget;

  const barColor = isOver ? '#ef4444' : pct > 0.85 ? '#f59e0b' : '#10b981';

  return (
    <View style={styles.cardContainer}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Ionicons name="pulse" size={14} color="#10b981" />
          <Text style={styles.title}>Monthly Spend Health</Text>
        </View>
        <Text style={[styles.percentBadge, { color: barColor }]}>
          {spentPct}% spent
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.max(2, Math.min(100, spentPct))}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.amountSummary}>
          {fmtMoney(totalSpent, symbol)} of {fmtMoney(effectiveBudget, symbol)}
        </Text>
        <Text style={[styles.statusText, { color: isOver ? '#f87171' : '#10b981' }]}>
          {isOver
            ? `${fmtMoney(totalSpent - effectiveBudget, symbol)} over`
            : `${fmtMoney(remaining, symbol)} left`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#121815',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
    paddingVertical: 10,
    paddingHorizontal: 13,
    marginBottom: 10,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  percentBadge: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountSummary: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#94a3b8',
  },
  statusText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 11.5,
    fontWeight: '600',
  },
});
