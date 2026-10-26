import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney } from '@/expense/stats';
import { FONTS, RADIUS } from '@/theme';

interface FinancialCopilotCardProps {
  totalSpent: number;
  budget: number;
  symbol?: string;
}

export function FinancialCopilotCard({ totalSpent, budget, symbol = '₹' }: FinancialCopilotCardProps) {
  const effectiveBudget = budget > 0 ? budget : 25000;
  const pct = Math.min(1, Math.max(0, totalSpent / effectiveBudget));
  const spentPct = Math.round(pct * 100);
  const remainingPct = 100 - spentPct;
  const remaining = Math.max(0, effectiveBudget - totalSpent);
  const isOver = totalSpent > effectiveBudget;

  return (
    <View style={styles.cardContainer}>
      <Text style={styles.title}>Monthly Spending Health</Text>

      {/* Pill Progress Bar with embedded percentages */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.max(16, Math.min(100, spentPct))}%`,
              backgroundColor: isOver ? '#ef4444' : pct > 0.85 ? '#f59e0b' : '#10b981',
            },
          ]}
        >
          <Text style={styles.barPercentageText}>{spentPct}%</Text>
        </View>
        <Text style={styles.trackRemainingText}>{remainingPct}%</Text>
      </View>

      <Text style={styles.amountSummary}>
        {fmtMoney(totalSpent, symbol)} spent of {fmtMoney(effectiveBudget, symbol)} budget
      </Text>

      <Text style={[styles.remainingText, isOver && { color: '#f87171' }]}>
        {isOver
          ? `Over budget by ${fmtMoney(totalSpent - effectiveBudget, symbol)}`
          : `Remaining: ${fmtMoney(remaining, symbol)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#121815',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  progressTrack: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  progressBar: {
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  barPercentageText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '700',
    color: '#042f1a',
  },
  trackRemainingText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    paddingRight: 10,
  },
  amountSummary: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  remainingText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#94a3b8',
  },
});
