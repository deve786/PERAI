import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OVERALL, periodLabel, type Period } from './period';
import { radius, useTheme } from './theme';
import { Row, T } from './ui';

/**
 * A drop-down for choosing what the expense page covers: Overall, or any
 * month that has entries. Opens as a small list under the button.
 */
export function PeriodPicker({
  value,
  months,
  currentMonth,
  onChange,
}: {
  value: Period;
  /** 'YYYY-MM' of each month to offer, newest first. */
  months: string[];
  currentMonth: string;
  onChange: (period: Period) => void;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);

  const options: { key: Period; label: string; hint?: string }[] = [
    { key: OVERALL, label: 'Overall', hint: 'Every entry' },
    ...months.map((ym) => ({
      key: ym,
      label: periodLabel(ym),
      hint: ym === currentMonth ? 'This month' : undefined,
    })),
  ];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${periodLabel(value)}. Change period.`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingVertical: 5, paddingLeft: 10, paddingRight: 7, borderRadius: radius.md,
          borderWidth: 1, borderColor: c.line, backgroundColor: c.card, opacity: pressed ? 0.65 : 1,
        })}
      >
        <T size={14} weight="600">{periodLabel(value)}</T>
        <Ionicons name="chevron-down" size={15} color={c.sub} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', paddingTop: 96, paddingHorizontal: 20 }}
        >
          <View
            style={{
              backgroundColor: c.bg, borderRadius: radius.md, borderWidth: 1, borderColor: c.line,
              maxHeight: 420, overflow: 'hidden', alignSelf: 'flex-start', minWidth: 220,
            }}
          >
            <ScrollView>
              {options.map((o, i) => {
                const active = o.key === value;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => { onChange(o.key); setOpen(false); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => ({
                      paddingVertical: 13, paddingHorizontal: 16,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line,
                      backgroundColor: active ? c.card : 'transparent', opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <View>
                        <T size={15} weight={active ? '700' : '500'}>{o.label}</T>
                        {o.hint ? <T size={12} sub style={{ marginTop: 1 }}>{o.hint}</T> : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={c.good} /> : null}
                    </Row>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
