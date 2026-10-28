import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { deleteExpense, type ExpenseRow } from './db';
import { addDays, fromStr, prettyDate, todayStr } from './dates';
import { fmtMoney, net } from './stats';
import { useTheme } from './theme';
import { ConfirmDialog, IconDot, Money, Row, T } from './ui';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Heading for a day of entries: "Today", "Yesterday", "Tue 20 Oct". */
export function dayHeading(date: string): string {
  const t = todayStr();
  if (date === t || date === addDays(t, -1)) return prettyDate(date);
  return `${WEEKDAYS[fromStr(date).getDay()]} ${prettyDate(date)}`;
}

/** Entries grouped by date, newest day first; keeps the order within a day. */
export function groupByDate<T extends { row: { date: string } }>(entries: T[]): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.row.date) last.items.push(e);
    else groups.push({ date: e.row.date, items: [e] });
  }
  return groups;
}

/** One expense row, for use inside a card: category dot, title, one meta line, amount. */
export function ExpenseItem({ e, showDate = true, onDeleted, trip, last }: {
  e: ExpenseRow; showDate?: boolean; onDeleted?: () => void;
  /** Title of the PERAI entry this belongs to, when it belongs to one. */
  trip?: string;
  /** Last row in its card — no hairline under it. */
  last?: boolean;
}) {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const netAmount = net(e);
  const hasDeductions = (e.refund_amount != null && e.refund_amount > 0) || (e.reimburse_amount != null && e.reimburse_amount > 0);

  const meta = [
    // The category is already the title when there's no note.
    e.note ? e.cat_name : null,
    e.sub_category || null,
    e.user_tag ? `@${e.user_tag}` : null,
    e.reimburse_amount ? `Paid back ${fmtMoney(e.reimburse_amount, symbol)}` : null,
    e.refund_amount ? `Refunded ${fmtMoney(e.refund_amount, symbol)}` : null,
    e.place || null,
    e.method,
    showDate ? prettyDate(e.date) : null,
    e.recurring_id ? 'Repeats' : null,
    e.item_count > 1 ? `${e.item_count} items` : null,
    trip || null,
  ]
    .filter(Boolean)
    .join(' · ');

  function onLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConfirming(true);
  }

  async function confirmDelete() {
    setConfirming(false);
    await deleteExpense(e.id);
    onDeleted?.();
  }

  return (
    <>
      <Pressable
        onPress={() => router.push({ pathname: '/expense/expense', params: { id: String(e.id) } })}
        onLongPress={onLongPress}
        accessibilityRole="button"
        style={({ pressed }) => ({
          opacity: pressed ? 0.5 : 1,
          minHeight: 60,
          paddingVertical: 10,
          justifyContent: 'center',
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: c.line,
        })}
      >
        <Row style={{ gap: 12 }}>
          <IconDot icon={e.cat_icon} color={e.cat_color} size={36} />
          <View style={{ flex: 1 }}>
            <T size={15} weight="500" numberOfLines={1}>{e.note || e.cat_name}</T>
            {meta ? <T size={13} sub numberOfLines={1} style={{ marginTop: 1 }}>{meta}</T> : null}
          </View>
          <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
            <Money value={netAmount} size={15} weight="500" />
            {hasDeductions ? (
              <T size={11} sub tabular style={{ textDecorationLine: 'line-through', opacity: 0.6, marginTop: 1 }}>
                {fmtMoney(e.amount, symbol)}
              </T>
            ) : null}
          </View>
        </Row>
      </Pressable>
      <ConfirmDialog
        visible={confirming}
        title="Delete this expense?"
        message="It will be removed from your history."
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
