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
  if (/^202[0-9]$/.test(trimmed)) return ''; // ignore standalone years
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
export function extractTimelineFromText(text: string, items?: string[]): TimelineStep[] | null {
  if (!text && (!items || items.length === 0)) return null;

  const steps: TimelineStep[] = [];

  // Strategy 1: Parse structured items (e.g. from RAG citations / voyage legs)
  if (items && items.length >= 2) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const parts = it.split('•').map((s) => s.trim());
      const datePart = it.match(/\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/);
      const timePart = it.match(/\b(\d{4})\s*(?:hrs|hours)\b|\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i);

      if (datePart && parts.length >= 2) {
        const dateStr = datePart[1];
        const timeVal = timePart ? formatTimelineTime(timePart[1] || timePart[2]) : '';
        const timeStr = timeVal || dateStr;
        const vessel = parts.length >= 3 ? parts[1] : '';
        const detail = parts.length >= 3 ? parts.slice(2).join(' • ') : parts[1];

        // Format clean title
        let cleanDetail = detail.replace(/\((.*?)\)/, '$1').replace(/\s+/g, ' ').trim();
        let title = cleanDetail;
        if (/mainland\s*departure/i.test(cleanDetail)) title = 'Mainland Departure';
        else if (/island\s*stops/i.test(cleanDetail)) title = 'Island Stops';
        else if (/return/i.test(cleanDetail)) title = 'Return Voyage';
        else if (/route[:\s]*([A-Za-z0-9\s-]+)/i.test(cleanDetail)) {
          const rm = cleanDetail.match(/route[:\s]*([A-Za-z0-9\s-]+)/i);
          title = rm ? `Route: ${rm[1].trim()}` : cleanDetail;
        }

        let sub = `${vessel ? `${vessel} • ` : ''}${cleanDetail} (${dateStr})`;
        if (sub.length > 55) sub = `${vessel ? `${vessel} • ` : ''}${dateStr}`;

        const isFirst = i === 0;
        const isLast = i === items.length - 1;
        const color = isFirst ? '#10b981' : isLast ? '#f59e0b' : '#3b82f6';

        steps.push({
          title,
          time: timeStr,
          sub,
          color,
        });
      }
    }
    if (steps.length >= 2) return steps;
  }

  // Strategy 2: Natural text voyage legs
  // e.g. "depart Kochi on 27.10.2026, call at Kavaratti and Agatti on 28.10.2026, and return to Kochi on 29.10.2026"
  const natLegs = [
    ...text.matchAll(/\b(depart(?:ing|ed|s)?|call\s*at|arrive|return\s*to)\s+([A-Za-z\s&,]+?)\s+(?:on\s+)?(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}\s*(?:hrs)?|\d{1,2}:\d{2}\s*(?:am|pm)?)/gi)
  ];
  if (natLegs.length >= 2) {
    steps.length = 0;
    for (let i = 0; i < natLegs.length; i++) {
      const match = natLegs[i];
      const action = match[1].toLowerCase();
      const place = match[2].trim();
      const timeOrDate = formatTimelineTime(match[3]) || match[3];

      let title = place;
      if (action.includes('depart')) title = `Departure: ${place}`;
      else if (action.includes('call')) title = `Island Stops: ${place}`;
      else if (action.includes('return')) title = `Return: ${place}`;
      else title = `Arrival: ${place}`;

      steps.push({
        title,
        time: timeOrDate,
        sub: `Scheduled voyage stop`,
        color: i === 0 ? '#10b981' : i === natLegs.length - 1 ? '#f59e0b' : '#3b82f6',
      });
    }
    if (steps.length >= 2) return steps;
  }

  // Strategy 3: Boarding & Counter checks
  const counterMatch = text.match(/\bcounter\s*(?:check|verification)?[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?|\d{4}\s*(?:hrs)?)/i);
  if (counterMatch) {
    steps.push({
      title: 'Counter Verification',
      time: formatTimelineTime(counterMatch[1]),
      sub: 'Security & ticket verification',
      color: '#10b981',
    });
  }

  const boardingMatch = text.match(/\bboarding\s*(?:time)?[:\s*]*([\d:.]+\s*(?:am|pm)?\s*(?:to|-)\s*[\d:.]+\s*(?:am|pm)?|\d{4}\s*(?:hrs)?)/i);
  if (boardingMatch) {
    steps.push({
      title: 'Gate Boarding',
      time: formatTimelineTime(boardingMatch[1]),
      sub: 'Wharf gate boarding window',
      color: '#10b981',
    });
  }

  // Strategy 4: Transit / Departure / Arrival milestones
  const depMatch = text.match(
    /\b(?:depart(?:ed|ing|ure)?|etd)\s+(?:from\s+)?([A-Za-z\s]+?)\s+(?:on\s+[\d/.-]+\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );
  const arrMatch = text.match(
    /\b(?:eta|arriv(?:ed|ing|al)?)\s+(?:at|to|in\s+)?([A-Za-z\s]+?)\s+(?:on\s+[\d/.-]+\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );

  if (depMatch && arrMatch) {
    const depPlace = depMatch[1].replace(/\b(?:at|on|for)\b/gi, '').trim();
    const arrPlace = arrMatch[1].replace(/\b(?:at|on|for)\b/gi, '').trim();
    steps.push({
      title: `Departure (${depPlace})`,
      time: formatTimelineTime(depMatch[2]),
      sub: `Departing from ${depPlace}`,
      color: '#10b981',
    });
    steps.push({
      title: `Arrival ETA (${arrPlace})`,
      time: formatTimelineTime(arrMatch[2]),
      sub: `Arrival at ${arrPlace}`,
      color: '#f59e0b',
    });
    return steps;
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
