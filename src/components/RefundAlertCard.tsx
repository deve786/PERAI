import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney } from '@/expense/stats';
import { FONTS, RADIUS } from '@/theme';

export interface RefundAlertItem {
  id: string;
  amount: number;
  note?: string;
  since?: string;
  daysOverdue?: number;
}

interface RefundAlertCardProps {
  refunds: RefundAlertItem[];
  symbol?: string;
  onFollowUp?: (item: RefundAlertItem) => void;
  onDismiss?: (id: string) => void;
}

export function RefundAlertCard({ refunds, symbol = '₹', onFollowUp, onDismiss }: RefundAlertCardProps) {
  if (!refunds || refunds.length === 0) return null;

  const item = refunds[0];
  const days = item.daysOverdue ?? 2;
  const titleText = item.note || 'IRCTC Tatkal';

  return (
    <View style={styles.card}>
      <View style={styles.topHeader}>
        <Text style={styles.cardHeaderTitle}>Refund Alert Watchdog</Text>
        <View style={styles.warningIconBadge}>
          <Ionicons name="warning" size={18} color="#f59e0b" />
        </View>
      </View>

      <Text style={styles.alertSubtitle}>Refund Alert: {titleText}</Text>
      <Text style={styles.alertDetails}>
        ({fmtMoney(item.amount, symbol)} • Overdue by {days} days)
      </Text>

      <View style={styles.actionsRow}>
        {onDismiss ? (
          <Pressable onPress={() => onDismiss(item.id)} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => onFollowUp?.(item)}
          style={({ pressed }) => [styles.followUpBtn, pressed && styles.followUpBtnPressed]}
        >
          <Text style={styles.followUpText}>Follow Up</Text>
          <Ionicons name="arrow-forward" size={14} color="#041f14" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1c1710',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  warningIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertSubtitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '600',
    color: '#fef3c7',
    marginBottom: 2,
  },
  alertDetails: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#d97706',
    marginBottom: 12,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leftColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 20,
    flex: 1,
  },
  overdueTag: {
    color: '#f59e0b',
    fontWeight: '800',
  },
  subText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  dismissBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  dismissText: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
  },
  followUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#10b981',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  followUpBtnPressed: {
    opacity: 0.8,
  },
  followUpText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '700',
    color: '#041f14',
  },
});
