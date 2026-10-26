import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '@/theme';

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
          const nodeColor = step.color || (idx === 0 ? '#10b981' : isLast ? '#f59e0b' : '#3b82f6');
          return (
            <View key={`${step.title}-${step.time}-${idx}`} style={styles.stepRow}>
              <View style={styles.nodeColumn}>
                <View style={[styles.nodeDot, { backgroundColor: nodeColor }]} />
                {!isLast && <View style={[styles.nodeLine, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]} />}
              </View>
              <View style={[styles.stepContent, !isLast && { paddingBottom: 14 }]}>
                <View style={styles.stepHeaderRow}>
                  <Text style={[styles.stepTime, { color: nodeColor }]}>{step.time}</Text>
                  <Text style={styles.stepDot}>•</Text>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                </View>
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
            name={reminderAdded ? 'checkmark-circle' : 'notifications-outline'}
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
            <Ionicons name="wallet-outline" size={14} color="#f59e0b" />
            <Text style={styles.chipText}>Log Expense</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Formats times cleanly: 0630 -> 06:30 AM, 1500 -> 03:00 PM */
export function formatTimelineTime(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{2})(\d{2})(?:\s*hrs)?$/i);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = m[2];
    const ampm = hh >= 12 ? 'PM' : 'AM';
    const displayH = hh % 12 || 12;
    return `${String(displayH).padStart(2, '0')}:${mm} ${ampm}`;
  }
  return trimmed;
}

/**
 * Extracts timetable timeline milestones from AI answers or telegram schedule texts.
 */
export function extractTimelineFromText(text: string): TimelineStep[] | null {
  if (!text) return null;

  const steps: TimelineStep[] = [];

  // 1. Counter check
  const counterMatch = text.match(/\bcounter\s*(?:check|verification)?[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?|\d{4}\s*(?:hrs)?)/i);
  if (counterMatch) {
    steps.push({
      title: 'Counter Verification',
      time: formatTimelineTime(counterMatch[1]),
      sub: 'Security & ticket verification',
      color: '#10b981',
    });
  }

  // 2. Boarding time
  const boardingMatch = text.match(/\bboarding\s*(?:time)?[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?|\d{4}\s*(?:hrs)?)/i);
  if (boardingMatch) {
    steps.push({
      title: 'Gate Boarding',
      time: formatTimelineTime(boardingMatch[1]),
      sub: 'Wharf gate boarding window',
      color: '#10b981',
    });
  }

  // 3. Departure match with word boundaries to prevent Chetlat -> Chetl + at bug
  // e.g. "departed Chetlat on 26/10/2026 at 1500 hours" or "departing Kavaratti at 0630 hrs" or "ETD from Kavaratti 0630 Hrs"
  const depMatch = text.match(
    /\b(?:depart(?:ed|ing|ure)?|etd)\s+(?:from\s+)?([A-Za-z\s]+?)\s+(?:on\s+[\d/.-]+\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );

  if (depMatch) {
    const port = depMatch[1].replace(/\b(?:at|on|for)\b/gi, '').trim();
    const time = formatTimelineTime(depMatch[2]);
    // Check if date exists
    const dateMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/);
    const dateStr = dateMatch ? ` (${dateMatch[1]})` : '';
    steps.push({
      title: `Departure (${port || 'Wharf'})`,
      time,
      sub: `Vessel departing from ${port || 'port'}${dateStr}`,
      color: '#f59e0b',
    });
  }

  // 4. Arrival / ETA match
  // e.g. "ETA at Kochi on 27/10/2026 at 0715 hours" or "ETA Kochi 11:30 AM"
  const arrMatch = text.match(
    /\b(?:eta|arriv(?:ed|ing|al)?)\s+(?:at|to|in\s+)?([A-Za-z\s]+?)\s+(?:on\s+[\d/.-]+\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );

  if (arrMatch) {
    const port = arrMatch[1].replace(/\b(?:at|on|for)\b/gi, '').trim();
    const time = formatTimelineTime(arrMatch[2]);
    steps.push({
      title: `Arrival ETA (${port || 'Destination'})`,
      time,
      sub: `Estimated arrival at ${port || 'wharf'}`,
      color: '#3b82f6',
    });
  }

  // 5. Multi-leg schedule extraction (e.g. "1 27/10/26 • HSC CHERIYAPANI • Route: KVT-AGT-KVT-AND (ETD from Kavaratti 0630 Hrs)")
  if (steps.length < 2) {
    const legMatches = [
      ...text.matchAll(/(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s*•?\s*([A-Za-z\s]+?)\s*•?\s*Route:\s*([A-Za-z0-9\s-]+?)(?:\s*\((?:ETD|dep)?[^)]*?(\d{4}|\d{1,2}:\d{2})\s*(?:hrs)?\))?(?:\n|$)/gi),
    ];

    if (legMatches.length >= 2) {
      steps.length = 0; // replace with multi-leg sequence
      for (let i = 0; i < legMatches.length; i++) {
        const leg = legMatches[i];
        const dateStr = leg[1];
        const routeStr = leg[3].trim();
        const timeStr = leg[4] ? formatTimelineTime(leg[4]) : dateStr;
        steps.push({
          title: `Leg ${i + 1}: ${routeStr}`,
          time: timeStr,
          sub: `${leg[2].trim()} • ${dateStr}`,
          color: i === 0 ? '#10b981' : i === legMatches.length - 1 ? '#3b82f6' : '#f59e0b',
        });
      }
    }
  }

  // If only departure was matched with a known route in text (e.g. "KVT-AGT-KVT-AND"), synthesize arrival milestone
  if (steps.length === 1 && depMatch) {
    const routeCode = text.match(/\b([A-Z]{3,}(?:\s*[-–→]\s*[A-Z]{3,})+)\b/);
    if (routeCode) {
      steps.push({
        title: `Voyage Route`,
        time: 'En route',
        sub: `Route: ${routeCode[1]}`,
        color: '#3b82f6',
      });
    }
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
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  stepTime: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '700',
  },
  stepDot: {
    color: '#64748b',
    fontSize: 12,
  },
  stepTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f5f9',
    flexShrink: 1,
  },
  stepSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
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
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    paddingVertical: 7,
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
