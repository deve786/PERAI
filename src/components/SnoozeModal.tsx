import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, type Colors } from '@/theme';
import type { Memory } from '@/types';
import { updateMemory } from '@/db/queries';
import { syncReminders } from '@/reminders';
import { logOk } from '@/log';

interface Props {
  visible: boolean;
  memory: Memory | null;
  onClose: () => void;
  onSnoozed?: (updatedDate: string) => void;
}

interface SnoozeOption {
  id: string;
  label: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  getTargetDate: () => { date: Date; expression: string };
}

const SNOOZE_OPTIONS: SnoozeOption[] = [
  {
    id: '3h',
    label: 'In 3 hours',
    desc: 'Later today',
    icon: 'time-outline',
    getTargetDate: () => {
      const d = new Date(Date.now() + 3 * 3600 * 1000);
      return { date: d, expression: 'in 3 hours' };
    },
  },
  {
    id: 'tomorrow_9am',
    label: 'Tomorrow',
    desc: '9:00 AM',
    icon: 'sunny-outline',
    getTargetDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return { date: d, expression: 'tomorrow at 9:00 AM' };
    },
  },
  {
    id: 'weekend',
    label: 'This weekend',
    desc: 'Saturday, 9:00 AM',
    icon: 'cafe-outline',
    getTargetDate: () => {
      const d = new Date();
      const day = d.getDay();
      const diff = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, expression: 'Saturday at 9:00 AM' };
    },
  },
  {
    id: 'next_week',
    label: 'Next week',
    desc: 'Monday, 9:00 AM',
    icon: 'calendar-outline',
    getTargetDate: () => {
      const d = new Date();
      const day = d.getDay();
      const diff = (1 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(9, 0, 0, 0);
      return { date: d, expression: 'next Monday at 9:00 AM' };
    },
  },
];

/** Bottom sheet: push a plan to a later time in one tap. */
export function SnoozeModal({ visible, memory, onClose, onSnoozed }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const insets = useSafeAreaInsets();

  if (!memory) return null;

  const handleSnooze = async (opt: SnoozeOption) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const { date, expression } = opt.getTargetDate();
      const newIso = date.toISOString();

      await updateMemory(memory.id, {
        eventDate: newIso,
        dateExpression: expression,
      });

      await syncReminders().catch(() => {});
      logOk(`Snoozed (${opt.label})`, memory.title);

      onSnoozed?.(newIso);
      onClose();
    } catch (err) {
      console.warn('Failed to snooze memory:', err);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Snooze</Text>
            <Text style={type.fine} numberOfLines={2}>
              {memory.title}
            </Text>
          </View>

          <View style={styles.optionsList}>
            {SNOOZE_OPTIONS.map((opt, index) => (
              <Pressable
                key={opt.id}
                onPress={() => void handleSnooze(opt)}
                accessibilityRole="button"
                accessibilityLabel={`Snooze: ${opt.label}, ${opt.desc}`}
                style={({ pressed }) => [
                  styles.optionRow,
                  index === SNOOZE_OPTIONS.length - 1 && styles.optionRowLast,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name={opt.icon} size={18} color={colors.moss} />
                </View>
                <Text style={[type.entry, styles.optionLabel]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.paper,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 8,
      gap: 16,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    header: { gap: 2 },
    title: { fontFamily: FONTS.sansSemi, fontSize: 20, lineHeight: 26, color: colors.ink },
    optionsList: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      paddingHorizontal: 14,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 56,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.rule,
    },
    optionRowLast: { borderBottomWidth: 0 },
    pressed: { opacity: 0.6 },
    optionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.mossSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionLabel: { flex: 1 },
    optionDesc: { fontFamily: FONTS.mono, fontSize: 13, color: colors.graphite },
    cancel: {
      minHeight: 48,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontFamily: FONTS.sansSemi, fontSize: 16, color: colors.ink },
  });
}
