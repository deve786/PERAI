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
  const days = item.daysOverdue ?? 5;
  const titleText = item.note || 'IRCTC Cancellation';

  return (
    <View style={styles.card}>
      <View style={styles.contentRow}>
        <View style={styles.leftColumn}>
          <View style={styles.titleRow}>
            <Ionicons name="warning" size={17} color="#f59e0b" />
            <Text style={styles.title}>
              Refund Alert: {fmtMoney(item.amount, symbol)} {titleText}{' '}
              <Text style={styles.overdueTag}>{days} days overdue</Text>
            </Text>
          </View>
          <Text style={styles.subText}>
            Train/Ship Ticket Cancellation • Tap follow-up to resolve
          </Text>
        </View>
      </View>

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
    backgroundColor: '#1f1912',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.38)',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
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
