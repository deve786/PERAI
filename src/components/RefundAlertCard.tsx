import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney } from '@/expense/stats';
import { FONTS } from '@/theme';

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
      <View style={styles.iconBadge}>
        <Ionicons name="warning-outline" size={17} color="#f59e0b" />
      </View>

      <View style={styles.infoCol}>
        <Text style={styles.title} numberOfLines={1}>
          Refund Alert: {titleText}
        </Text>
        <Text style={styles.details} numberOfLines={1}>
          {fmtMoney(item.amount, symbol)} • Overdue by {days}d
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => onFollowUp?.(item)}
          style={({ pressed }) => [styles.followUpBtn, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Follow up refund of ${titleText}`}
        >
          <Text style={styles.followUpText}>Follow Up</Text>
          <Ionicons name="arrow-forward" size={12} color="#181204" />
        </Pressable>

        {onDismiss ? (
          <Pressable
            onPress={() => onDismiss(item.id)}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss refund alert"
          >
            <Ionicons name="close" size={15} color="#a8a29e" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#19140d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#fef3c7',
  },
  details: {
    fontFamily: FONTS.sans,
    fontSize: 11.5,
    color: '#f59e0b',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f59e0b',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  btnPressed: {
    opacity: 0.75,
  },
  followUpText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#181204',
  },
  closeBtn: {
    padding: 2,
  },
});
