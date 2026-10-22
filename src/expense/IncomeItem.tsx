import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { deleteIncome, type IncomeRow } from './db';
import { prettyDate } from './dates';
import { fmtMoney } from './stats';
import { useTheme } from './theme';
import { ConfirmDialog, IconDot, Row, T } from './ui';

/** One income row, for use inside a card. The amount is moss with a "+". */
export function IncomeItem({ e, showDate = true, onDeleted, last }: {
  e: IncomeRow; showDate?: boolean; onDeleted?: () => void;
  /** Last row in its card — no hairline under it. */
  last?: boolean;
}) {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const meta = [
    // The category is already the title when there's no note.
    e.note ? e.cat_name : null,
    e.method,
    showDate ? prettyDate(e.date) : null,
  ].filter(Boolean).join(' · ');

  function onLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setConfirming(true);
  }

  async function confirmDelete() {
    setConfirming(false);
    await deleteIncome(e.id);
    onDeleted?.();
  }

  return (
    <>
      <Pressable
        onPress={() => router.push({ pathname: '/expense/income', params: { id: String(e.id) } })}
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
          <T size={15} weight="500" tabular style={{ color: c.good }}>+{fmtMoney(e.amount, symbol)}</T>
        </Row>
      </Pressable>
      <ConfirmDialog
        visible={confirming}
        title="Delete this income entry?"
        message="It will be removed from your history."
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
