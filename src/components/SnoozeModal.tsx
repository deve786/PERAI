import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/ThemeContext';
import { FONTS, SPACE, type Colors } from '@/theme';
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
    label: '+3 Hours',
    desc: 'Later today',
    icon: 'time-outline',
    getTargetDate: () => {
      const d = new Date(Date.now() + 3 * 3600 * 1000);
      return { date: d, expression: 'in 3 hours' };
    },
  },
  {
    id: 'tomorrow_9am',
    label: 'Tomorrow 9 AM',
    desc: 'Start of day',
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
    label: 'This Weekend',
    desc: 'Saturday 9 AM',
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
    label: 'Next Week',
    desc: 'Monday 9 AM',
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

export function SnoozeModal({ visible, memory, onClose, onSnoozed }: Props) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="alarm-outline" size={18} color={colors.moss} />
              <Text style={[type.label, styles.title]}>QUICK SNOOZE</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close-outline" size={20} color={colors.mist} />
            </Pressable>
          </View>

          <Text style={[type.entry, styles.memoryTitle]} numberOfLines={2}>
            {memory.title}
          </Text>

          <View style={styles.optionsList}>
            {SNOOZE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => void handleSnooze(opt)}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && styles.optionRowPressed,
                ]}
              >
                <View style={styles.optionIconContainer}>
                  <Ionicons name={opt.icon} size={18} color={colors.ink} />
                </View>
                <View style={styles.optionTextContainer}>
                  <Text style={[type.body, styles.optionLabel]}>{opt.label}</Text>
                  <Text style={[type.fine, styles.optionDesc]}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color={colors.mist} />
              </Pressable>
            ))}
          </View>
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
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: colors.rule,
      padding: 20,
      paddingBottom: 36,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      color: colors.moss,
      fontWeight: '600',
    },
    memoryTitle: {
      color: colors.ink,
      fontSize: 16,
      lineHeight: 22,
    },
    optionsList: {
      gap: 8,
      marginTop: 4,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.rule,
      gap: 12,
    },
    optionRowPressed: {
      opacity: 0.75,
      backgroundColor: colors.rule,
    },
    optionIconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.paper,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionTextContainer: {
      flex: 1,
    },
    optionLabel: {
      color: colors.ink,
      fontWeight: '600',
      fontSize: 14,
    },
    optionDesc: {
      color: colors.mist,
      fontSize: 11,
    },
  });
}
