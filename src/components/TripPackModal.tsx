import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, RADIUS } from '@/theme';
import type { TimelineStep } from './TimetableTimelineCard';

interface TripPackModalProps {
  visible: boolean;
  vesselName?: string;
  step?: TimelineStep;
  onClose: () => void;
  onOpenFolder?: (groupName: string) => void;
}

const DEFAULT_CHECKLIST = [
  { id: '1', label: 'Lakport Boat Ticket PDF', checked: true },
  { id: '2', label: 'Entry Permit / ID Proof', checked: true },
  { id: '3', label: 'Motion Sickness Tablets', checked: true },
  { id: '4', label: 'Power Bank & Cables', checked: false },
];

export function TripPackModal({
  visible,
  vesselName = 'Island',
  step,
  onClose,
  onOpenFolder,
}: TripPackModalProps) {
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const groupTitle = `${vesselName.replace(/^MV\s*|^HSC\s*/i, '')} Voyage`;

  function toggleCheck(id: string) {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item))
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.suitcaseIconBox}>
              <Ionicons name="briefcase" size={20} color="#10b981" />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Trip Pack: {groupTitle}</Text>
              <Text style={styles.subtitle}>{step?.time ? `Departure: ${step.time}` : 'Auto-generated travel bundle'}</Text>
            </View>
          </View>

          {/* 1. Checklist */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Packing & Prep Checklist</Text>
            <View style={styles.checklistGrid}>
              {checklist.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => toggleCheck(item.id)}
                  style={styles.checkItem}
                >
                  <Ionicons
                    name={item.checked ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={item.checked ? '#10b981' : '#64748b'}
                  />
                  <Text style={[styles.checkLabel, item.checked && styles.checkLabelDone]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 2. Auto Reminders */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Auto-Scheduled Reminders</Text>
            <View style={styles.reminderRow}>
              <Ionicons name="time" size={16} color="#f59e0b" />
              <Text style={styles.reminderText}>
                Wharf Check-in at {step?.time || '08:00 AM'} (1.5h before departure)
              </Text>
            </View>
          </View>

          {/* 3. Expense Group */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Expense Group Created</Text>
            <View style={styles.expenseRow}>
              <View style={styles.folderRow}>
                <Ionicons name="folder" size={16} color="#3b82f6" />
                <View>
                  <Text style={styles.folderName}>{groupTitle} 2026</Text>
                  <Text style={styles.folderSub}>Budget allocated</Text>
                </View>
              </View>
              <Text style={styles.budgetValue}>₹6,000</Text>
            </View>
          </View>

          {/* Bottom Actions */}
          <Pressable
            onPress={() => {
              onOpenFolder?.(groupTitle);
              onClose();
            }}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.primaryBtnText}>Open Trip Folder</Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: '#161917',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  suitcaseIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    fontFamily: FONTS.sansSemi,
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '700',
    color: '#cbd5e1',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checklistGrid: {
    gap: 8,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkLabel: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#f1f5f9',
  },
  checkLabelDone: {
    color: '#94a3b8',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reminderText: {
    fontFamily: FONTS.sans,
    fontSize: 13,
    color: '#f1f5f9',
    flex: 1,
  },
  expenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folderName: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  folderSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#94a3b8',
  },
  budgetValue: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
  },
  primaryBtn: {
    backgroundColor: '#10b981',
    borderRadius: RADIUS.button,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 6,
  },
  btnPressed: {
    opacity: 0.8,
  },
  primaryBtnText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 15,
    fontWeight: '700',
    color: '#0a2318',
  },
  secondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
});
