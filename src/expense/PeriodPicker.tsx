import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OVERALL, periodLabel, type Period } from './period';
import { radius, useTheme } from './theme';
import { Row, T } from './ui';

/**
 * A drop-down for choosing what a money screen covers: Overall, or any month
 * that has entries. Opens as a small list anchored under the button.
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
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const button = useRef<View>(null);
  // Where the list opens: under the button, lined up with whichever edge is
  // nearer the screen side. Falls back to the top right if not measured.
  const [anchor, setAnchor] = useState<{ top: number; left?: number; right?: number }>({ top: 96, right: 20 });

  const options: { key: Period; label: string; hint?: string }[] = [
    { key: OVERALL, label: 'Overall', hint: 'Every entry' },
    ...months.map((ym) => ({
      key: ym,
      label: periodLabel(ym),
      hint: ym === currentMonth ? 'This month' : undefined,
    })),
  ];

  function show() {
    const node = button.current;
    if (!node) { setOpen(true); return; }
    node.measureInWindow((x, y, w, h) => {
      const top = y + h + 6;
      setAnchor(x + w / 2 > width / 2 ? { top, right: Math.max(12, width - (x + w)) } : { top, left: Math.max(12, x) });
      setOpen(true);
    });
  }

  return (
    <>
      <Pressable
        ref={button}
        onPress={show}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${periodLabel(value)}. Change period.`}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40,
          paddingLeft: 14, paddingRight: 10, borderRadius: radius.pill,
          borderWidth: 1, borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.65 : 1,
        })}
      >
        <T size={15} weight="600">{periodLabel(value)}</T>
        <Ionicons name="chevron-down" size={16} color={c.sub} />
      </Pressable>

      <Modal visible={open} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <View
            style={{
              position: 'absolute', top: anchor.top, left: anchor.left, right: anchor.right,
              backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line,
              maxHeight: 420, overflow: 'hidden', minWidth: 220,
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
                      minHeight: 52, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line,
                      backgroundColor: active ? c.accentSoft : 'transparent', opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                      <View>
                        <T size={15} weight={active ? '600' : '400'}>{o.label}</T>
                        {o.hint ? <T size={13} sub style={{ marginTop: 1 }}>{o.hint}</T> : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={c.accent} /> : null}
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
