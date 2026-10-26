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
  const effectiveBudget = budget > 0 ? budget : 50000;
  const pct = Math.min(1, Math.max(0, totalSpent / effectiveBudget));
  const pctDisplay = (pct * 100).toFixed(1);
  const remaining = Math.max(0, effectiveBudget - totalSpent);
  const isOver = totalSpent > effectiveBudget;

  return (
    <View style={styles.cardContainer}>
      <View style={styles.topRow}>
        <View style={styles.textColumn}>
          <Text style={styles.title}>Monthly Spending Health</Text>
          <Text style={styles.amountSummary}>
            {fmtMoney(totalSpent, symbol)} of {fmtMoney(effectiveBudget, symbol)} budget used
          </Text>
        </View>

        <View style={styles.piggyIconContainer}>
          <Ionicons name="wallet" size={24} color="#10b981" />
        </View>
      </View>

      {/* Modern Progress Bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressBar,
            {
              width: `${Math.min(100, Math.round(pct * 100))}%`,
              backgroundColor: isOver ? '#ef4444' : pct > 0.85 ? '#f59e0b' : '#10b981',
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {isOver
            ? `Over budget by ${fmtMoney(totalSpent - effectiveBudget, symbol)}`
            : `Remaining: ${fmtMoney(remaining, symbol)} (${pctDisplay}% Spent)`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#161d19',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.28)',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  textColumn: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  amountSummary: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    color: '#94a3b8',
  },
  piggyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
  },
});
