import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { deleteIncome, type IncomeRow } from './db';
import { prettyDate } from './dates';
import { fmtMoney } from './stats';
import { useTheme } from './theme';
import { ConfirmDialog, IconDot, Row, T } from './ui';

export function IncomeItem({ e, showDate = true, onDeleted }: { e: IncomeRow; showDate?: boolean; onDeleted?: () => void }) {
  const { c, symbol } = useTheme();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const meta = [e.cat_name, e.method, showDate ? prettyDate(e.date) : null].filter(Boolean).join('  ·  ');

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
          opacity: pressed ? 0.55 : 1,
          paddingVertical: 13,
          borderBottomWidth: 1,
          borderBottomColor: c.line,
          backgroundColor: c.bg,
        })}
      >
        <Row style={{ gap: 13 }}>
          <IconDot icon={e.cat_icon} color={e.cat_color} />
          <View style={{ flex: 1 }}>
            <T size={15} weight="600" numberOfLines={1}>{e.note || e.cat_name}</T>
            <T size={12.5} sub numberOfLines={1} style={{ marginTop: 2 }}>{meta}</T>
          </View>
          <T size={15.5} weight="600" tabular style={{ color: c.good }}>+{fmtMoney(e.amount, symbol)}</T>
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
