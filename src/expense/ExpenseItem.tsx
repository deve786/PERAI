import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { deleteExpense, type ExpenseRow } from './db';
import { prettyDate } from './dates';
import { useTheme } from './theme';
import { ConfirmDialog, IconDot, Money, Row, T } from './ui';

export function ExpenseItem({ e, showDate = true, onDeleted }: { e: ExpenseRow; showDate?: boolean; onDeleted?: () => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const meta = [
    e.cat_name,
    e.user_tag ? `@${e.user_tag}` : null,
    e.method,
    showDate ? prettyDate(e.date) : null,
    e.recurring_id ? 'Repeats' : null,
    e.item_count > 1 ? `${e.item_count} items` : null,
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
            <Row style={{ alignItems: 'center', gap: 6 }}>
              <T size={15} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{e.note || e.cat_name}</T>
              {e.user_tag ? (
                <View style={{
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.line,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}>
                  <Ionicons name="person-outline" size={10} color={c.sub} />
                  <T size={11} sub weight="600">{e.user_tag}</T>
                </View>
              ) : null}
            </Row>
            <T size={12.5} sub numberOfLines={1} style={{ marginTop: 2 }}>{meta}</T>
          </View>
          <Money value={e.amount} size={15.5} weight="600" />
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
