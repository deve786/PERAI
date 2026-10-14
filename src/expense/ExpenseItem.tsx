import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { deleteExpense, type ExpenseRow } from './db';
import { prettyDate } from './dates';
import { FONTS, useTheme } from './theme';
import { ConfirmDialog, IconDot, Money, Row, T } from './ui';

export function ExpenseItem({ e, showDate = true, onDeleted }: { e: ExpenseRow; showDate?: boolean; onDeleted?: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const meta = [
    e.cat_name.toUpperCase(),
    e.user_tag ? `@${e.user_tag.toUpperCase()}` : null,
    e.method.toUpperCase(),
    showDate ? prettyDate(e.date).toUpperCase() : null,
    e.recurring_id ? 'REPEATS' : null,
    e.item_count > 1 ? `${e.item_count} ITEMS` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

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
          opacity: pressed ? 0.45 : 1,
          paddingVertical: 11,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.line,
          backgroundColor: c.bg,
        })}
      >
        <Row style={{ gap: 12 }}>
          <IconDot icon={e.cat_icon} color={e.cat_color} size={32} />
          <View style={{ flex: 1, gap: 3 }}>
            <Row style={{ justifyContent: 'space-between', gap: 12 }}>
              <T size={15} weight="500" numberOfLines={1} style={{ flex: 1 }}>{e.note || e.cat_name}</T>
              <Money value={e.amount} size={13} weight="500" />
            </Row>
            <T size={10} faint tabular style={{ fontFamily: FONTS.mono, letterSpacing: 0.9 }} numberOfLines={1}>
              {meta}
            </T>
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
