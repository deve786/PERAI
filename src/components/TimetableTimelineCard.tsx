import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, RADIUS } from '@/theme';

export interface TimelineStep {
  title: string;
  time: string;
  sub?: string;
  color?: string;
}

interface TimetableTimelineCardProps {
  steps: TimelineStep[];
  vesselName?: string;
  onSetReminder?: (step: TimelineStep) => void;
  onLogExpense?: () => void;
}

export function TimetableTimelineCard({
  steps,
  vesselName,
  onSetReminder,
  onLogExpense,
}: TimetableTimelineCardProps) {
  const [reminderAdded, setReminderAdded] = useState(false);

  if (!steps || steps.length === 0) return null;

  function handleReminder() {
    setReminderAdded(true);
    if (onSetReminder) onSetReminder(steps[0]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={15} color="#10b981" />
        <Text style={styles.headerTitle}>Timetable Timeline</Text>
        {vesselName ? <Text style={styles.vesselTag}>• {vesselName}</Text> : null}
      </View>

      <View style={styles.stepsContainer}>
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const nodeColor = step.color || (idx === 0 ? '#10b981' : idx === steps.length - 1 ? '#f59e0b' : '#3b82f6');
          return (
            <View key={`${step.title}-${idx}`} style={styles.stepRow}>
              <View style={styles.nodeColumn}>
                <View style={[styles.nodeDot, { backgroundColor: nodeColor }]} />
                {!isLast && <View style={[styles.nodeLine, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />}
              </View>
              <View style={[styles.stepContent, !isLast && { paddingBottom: 16 }]}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepTime}>{step.time}</Text>
                {step.sub ? <Text style={styles.stepSub}>{step.sub}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={handleReminder}
          style={({ pressed }) => [styles.chipButton, pressed && styles.chipPressed]}
        >
          <Ionicons
            name={reminderAdded ? 'checkmark-circle' : 'add-outline'}
            size={14}
            color={reminderAdded ? '#10b981' : '#f59e0b'}
          />
          <Text style={[styles.chipText, reminderAdded && { color: '#10b981' }]}>
            {reminderAdded ? 'Reminder Set ✓' : 'Set Reminder'}
          </Text>
        </Pressable>

        {onLogExpense ? (
          <Pressable
            onPress={onLogExpense}
            style={({ pressed }) => [styles.chipButton, pressed && styles.chipPressed]}
          >
            <Ionicons name="add-outline" size={14} color="#f59e0b" />
            <Text style={styles.chipText}>Log Expense</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Helper to detect and extract timeline steps from AI answer text or Telegram messages.
 */
export function extractTimelineFromText(text: string): TimelineStep[] | null {
  if (!text) return null;

  const steps: TimelineStep[] = [];

  // Match counter check / security
  const counterMatch = text.match(/counter\s*(?:check|security)?[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?)/i);
  if (counterMatch) {
    steps.push({
      title: 'Boarding Check',
      time: counterMatch[1].trim(),
      sub: 'Security & ticket verification',
      color: '#10b981',
    });
  }

  // Match boarding time
  const boardingMatch = text.match(/boarding\s*time[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?)/i);
  if (boardingMatch && (!counterMatch || boardingMatch[1].trim() !== counterMatch[1].trim())) {
    steps.push({
      title: 'Gate Boarding',
      time: boardingMatch[1].trim(),
      sub: 'Boarding gate closes',
      color: '#10b981',
    });
  }

  // Match departure
  const depMatch = text.match(/depart(?:ed|ure)?\s*(?:from)?\s*([a-z\s]+?)?\s*(?:at|@)\s*([\d\w:.]+\s*(?:am|pm|hrs)?)/i);
  if (depMatch) {
    const loc = depMatch[1] ? `From ${depMatch[1].trim()}` : '';
    steps.push({
      title: 'Departure',
      time: depMatch[2].trim(),
      sub: loc || 'Scheduled departure',
      color: '#f59e0b',
    });
  }

  // Match arrival / ETA
  const etaMatch = text.match(/eta\s*([a-z\s]+?)?\s*(?:at|@|to)?\s*([\d\w:.]+\s*(?:am|pm|hrs)?)/i);
  if (etaMatch) {
    const loc = etaMatch[1] ? `Arrival at ${etaMatch[1].trim()}` : 'Arrival';
    steps.push({
      title: 'Arrival (ETA)',
      time: etaMatch[2].trim(),
      sub: loc,
      color: '#3b82f6',
    });
  }

  return steps.length >= 2 ? steps : null;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161d19',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  vesselTag: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
  },
  stepsContainer: {
    paddingLeft: 4,
  },
  stepRow: {
    flexDirection: 'row',
  },
  nodeColumn: {
    alignItems: 'center',
    width: 20,
    marginRight: 10,
  },
  nodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
  },
  nodeLine: {
    width: 2,
    flex: 1,
    marginVertical: 3,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  stepTime: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    color: '#ffffff',
    marginTop: 1,
  },
  stepSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
});
