import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '@/theme';

export interface TimelineStep {
  title: string;
  time: string;
  sub?: string;
  date?: string;
  color?: string;
}

interface TimetableTimelineCardProps {
  steps: TimelineStep[];
  vesselName?: string;
  onSetReminder?: (step: TimelineStep) => void;
  onLogExpense?: () => void;
}

function findUpcomingStep(steps: TimelineStep[]): TimelineStep {
  const now = new Date();
  for (const s of steps) {
    if (s.date) {
      const stepTimeStr = s.time.includes('AM') || s.time.includes('PM') ? s.time : '09:00 AM';
      const tm = stepTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      let hh = 9;
      let mm = 0;
      if (tm) {
        hh = parseInt(tm[1], 10);
        mm = parseInt(tm[2], 10);
        if (tm[3]?.toUpperCase() === 'PM' && hh < 12) hh += 12;
        if (tm[3]?.toUpperCase() === 'AM' && hh === 12) hh = 0;
      }
      const stepDate = new Date(`${s.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
      if (stepDate.getTime() > now.getTime()) {
        return s; // The next upcoming future milestone!
      }
    }
  }
  // If all are in the past or date is unspecified, return the last step or first step
  return steps[steps.length - 1] || steps[0];
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
    // Pick the next upcoming future milestone
    const upcoming = findUpcomingStep(steps);
    if (onSetReminder) onSetReminder(upcoming);
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
          <Text style={[styles.chipText, reminderAdded && { color: '#10b981' }]} numberOfLines={1}>
            {reminderAdded ? 'Reminder Set ✓' : 'Set Reminder'}
          </Text>
        </Pressable>

        {onLogExpense ? (
          <Pressable
            onPress={onLogExpense}
            style={({ pressed }) => [styles.chipButton, pressed && styles.chipPressed]}
          >
            <Ionicons name="wallet-outline" size={14} color="#f59e0b" />
            <Text style={styles.chipText} numberOfLines={1}>Log Expense</Text>
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

function cleanPlaceName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\b(?:at|on|for|from|to|de|in)\b/gi, '')
    .replace(/[-_.:,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseISODate(raw: string): string | undefined {
  if (!raw) return undefined;
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return undefined;
}

/**
 * Extracts timetable timeline milestones from AI answers or telegram schedule texts.
 */
export function extractTimelineFromText(text: string, items?: string[]): TimelineStep[] | null {
  if (!text && (!items || items.length === 0)) return null;

  const steps: TimelineStep[] = [];

  // Strategy 1: Parse structured items (e.g. from RAG citations / voyage legs)
  if (items && items.length >= 1) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const parts = it.split('•').map((s) => s.trim());
      const datePart = it.match(/\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b/);
      const timePart = it.match(/\b(\d{4})\s*(?:hrs|hours)\b|\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i);

      if (datePart && parts.length >= 2) {
        const dateStr = datePart[1];
        const isoDate = parseISODate(dateStr);
        const timeVal = timePart ? formatTimelineTime(timePart[1] || timePart[2]) : '';
        const timeStr = timeVal || dateStr;
        const vessel = parts.length >= 3 ? parts[1] : '';
        const detail = parts.length >= 3 ? parts.slice(2).join(' • ') : parts[1];

        let cleanDetail = cleanPlaceName(detail.replace(/\((.*?)\)/, '$1'));
        let title = cleanDetail;
        if (/mainland\s*departure/i.test(detail)) title = 'Mainland Departure';
        else if (/island\s*stops/i.test(detail)) title = 'Island Stops';
        else if (/return/i.test(detail)) title = 'Return Voyage';
        else if (/eta\s*([A-Za-z\s]+)/i.test(detail)) {
          const em = detail.match(/eta\s*([A-Za-z\s]+?)(?:\s*\d{4}|\s*$)/i);
          title = `Arrival ETA: ${cleanPlaceName(em ? em[1] : 'Destination')}`;
        } else if (/route[:\s]*([A-Za-z0-9\s-]+)/i.test(detail)) {
          const rm = detail.match(/route[:\s]*([A-Za-z0-9\s-]+)/i);
          title = `Route: ${rm ? rm[1].trim() : cleanDetail}`;
        }

        let sub = `${vessel ? `${vessel} • ` : ''}${cleanDetail} (${dateStr})`;
        if (sub.length > 55) sub = `${vessel ? `${vessel} • ` : ''}${dateStr}`;

        steps.push({
          title,
          time: timeStr,
          sub,
          date: isoDate,
          color: i === 0 ? '#10b981' : '#3b82f6',
        });
      } else if (/running\s*schedule/i.test(it)) {
        const circuit = it.match(/([A-Z]{3}(?:\s*[/–-]\s*[A-Z]{3})+)/);
        steps.push({
          title: 'Running Circuit',
          time: 'En route',
          sub: circuit ? circuit[1].replace(/\s*\/\s*/g, ' → ') : 'Island circuit',
          color: '#f59e0b',
        });
      }
    }
    if (steps.length >= 2) return steps;
  }

  // Strategy 2: Natural text voyage legs
  const natLegs = [
    ...text.matchAll(/\b(depart(?:ing|ed|s)?|call\s*at|arrive|return\s*to)\s+(?:at\s+|from\s+|to\s+)?([A-Za-z\s&,]+?)\s+(?:on\s+|at\s+)?(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}\s*(?:hrs)?|\d{1,2}:\d{2}\s*(?:am|pm)?)/gi)
  ];
  if (natLegs.length >= 2) {
    steps.length = 0;
    for (let i = 0; i < natLegs.length; i++) {
      const match = natLegs[i];
      const action = match[1].toLowerCase();
      const place = cleanPlaceName(match[2]);
      const timeOrDate = formatTimelineTime(match[3]) || match[3];
      const isoDate = parseISODate(match[3]);

      let title = place;
      if (action.includes('depart')) title = `Departure: ${place}`;
      else if (action.includes('call')) title = `Island Stops: ${place}`;
      else if (action.includes('return')) title = `Return: ${place}`;
      else title = `Arrival: ${place}`;

      steps.push({
        title,
        time: timeOrDate,
        sub: `Scheduled voyage stop`,
        date: isoDate,
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
    /\b(?:depart(?:ed|ing|ure)?|etd)\s+(?:from\s+)?([A-Za-z\s]+?)\s+(?:on\s+([\d/.-]+)\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );
  const arrMatch = text.match(
    /\b(?:eta|arriv(?:ed|ing|al)?)\s+(?:at|to|in\s+)?([A-Za-z\s]+?)\s+(?:on\s+([\d/.-]+)\s+)?(?:at\s+)?(\d{4}|\d{1,2}(?::\d{2})?\s*(?:am|pm|hrs|hours)?)\b/i
  );

  if (depMatch && arrMatch) {
    steps.length = 0;
    const depPlace = cleanPlaceName(depMatch[1]);
    const arrPlace = cleanPlaceName(arrMatch[1]);
    const depDate = depMatch[2] ? parseISODate(depMatch[2]) : undefined;
    const arrDate = arrMatch[2] ? parseISODate(arrMatch[2]) : undefined;

    steps.push({
      title: `Departure: ${depPlace}`,
      time: formatTimelineTime(depMatch[3]),
      sub: `Departing from ${depPlace}`,
      date: depDate,
      color: '#10b981',
    });
    steps.push({
      title: `Arrival ETA: ${arrPlace}`,
      time: formatTimelineTime(arrMatch[3]),
      sub: `Arrival at ${arrPlace}`,
      date: arrDate,
      color: '#f59e0b',
    });
    return steps;
  }

  // Strategy 5: Single transit milestone + route circuit fallback
  if (steps.length === 1) {
    const circuit = text.match(/([A-Z]{3}(?:\s*[/–-]\s*[A-Z]{3})+)/);
    if (circuit) {
      steps.push({
        title: 'Voyage Circuit',
        time: 'En route',
        sub: circuit[1].replace(/\s*\/\s*/g, ' → '),
        color: '#f59e0b',
      });
      return steps;
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    paddingVertical: 8,
    paddingHorizontal: 8,
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
