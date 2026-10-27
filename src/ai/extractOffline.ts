import {
  CATEGORIES,
  type Category,
  type MemoryDraft,
  type MemoryType,
  type Priority,
  type Repeat,
} from '../types';
import { DEFAULT_CURRENCY } from '../constants';
import { normalizeGroupName, splitTasks } from '../groups';
import { dueToday, parseWhen } from '../whenText';
import { mapToExpenseCategory } from '../expense/categoryMapping';

/**
 * Maps a title or phrase to one of the canonical Memory Categories:
 * 'Personal Care' | 'Work' | 'Shopping' | 'Entertainment' | 'Fitness' | 'Travel' | 'Health' | 'Other'
 */
function mapToMemoryCategory(title: string): Category {
  const t = title.toLowerCase();
  if (/doctor|hospital|medicine|clinic|pharmacy|dental|dentist|tablet|checkup|fever|sick/i.test(t)) {
    return 'Health';
  }
  if (/gym|workout|exercise|running|run|yoga|walk|fitness|training/i.test(t)) {
    return 'Fitness';
  }
  if (/work|office|meeting|project|client|call|email|presentation|code|task|bug|deadline/i.test(t)) {
    return 'Work';
  }
  if (/flight|train|trip|hotel|ticket|travel|kozhikode|cochin|bangalore|delhi|island|ferry|ship|vessel/i.test(t)) {
    return 'Travel';
  }
  if (/movie|film|cinema|theatre|game|play|song|album|music|concert|series|show|episode/i.test(t)) {
    return 'Entertainment';
  }
  if (/salon|barber|haircut|hair|spa|massage|grooming|bath|skincare/i.test(t)) {
    return 'Personal Care';
  }
  if (/buy|bought|purchase|shopping|shirt|shoes|dress|amazon|flipkart|store|market|groceries|grocery/i.test(t)) {
    return 'Shopping';
  }
  return 'Other';
}

/**
 * Pure on-device heuristic memory extractor.
 *
 * Runs 100% offline with zero network calls and 0ms latency.
 * Employs PERAI's local regex rules, Malayalam/Manglish date parser (parseWhen),
 * task splitter, and purchase detectors.
 */
export function extractMemoriesOffline(
  text: string,
  nowISO: string,
  knownPeople: string[] = []
): MemoryDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const now = new Date(nowISO);

  // 1. Group / Project name detection:
  // e.g. "for the Kozhikode trip: book tickets, pack bags"
  // or "Kozhikode trip: book tickets, pack bags"
  let groupName: string | null = null;
  let workText = trimmed;
  const groupMatch = trimmed.match(/^(?:for\s+(?:the\s+)?)?([^:\n]{2,40}):\s*(.+)$/i);
  if (groupMatch && groupMatch[2]?.trim()) {
    groupName = normalizeGroupName(groupMatch[1]);
    workText = groupMatch[2].trim();
  }

  // 2. Multi-task splitting
  const parts = splitTasks(workText);
  const drafts: MemoryDraft[] = [];

  for (const rawPart of parts) {
    let part = rawPart.trim();
    if (!part) continue;

    // Detect priority:
    let priority: Priority | null = null;
    if (/\b(?:high|urgent|top)\s+priority\b|\burgent\b/i.test(part)) {
      priority = 'high';
      part = part.replace(/\b(?:high|urgent|top)\s+priority\b|\burgent\b/gi, '').trim();
    } else if (/\blow\s+priority\b/i.test(part)) {
      priority = 'low';
      part = part.replace(/\blow\s+priority\b/gi, '').trim();
    } else if (/\bmedium\s+priority\b/i.test(part)) {
      priority = 'medium';
      part = part.replace(/\bmedium\s+priority\b/gi, '').trim();
    }

    // Detect repeat:
    let repeat: Repeat | null = null;
    if (/\b(?:every\s+day|daily)\b/i.test(part)) {
      repeat = 'daily';
      part = part.replace(/\b(?:every\s+day|daily)\b/gi, '').trim();
    } else if (/\b(?:every\s+week|weekly)\b/i.test(part)) {
      repeat = 'weekly';
      part = part.replace(/\b(?:every\s+week|weekly)\b/gi, '').trim();
    } else if (/\b(?:every\s+month|monthly)\b/i.test(part)) {
      repeat = 'monthly';
      part = part.replace(/\b(?:every\s+month|monthly)\b/gi, '').trim();
    }

    // Detect purchase:
    // e.g. "bought groceries for 450", "spent 200 on lunch", "paid 300 for coffee"
    let isPurchase = false;
    let purchaseAmount: number | null = null;
    const purchasePatterns = [
      /(?:bought|purchased|spend|spent|paid)\s+(?:for\s+)?(.+?)\s+(?:for|cost|costing|worth|of)?\s*(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:bought|purchased|spend|spent|paid)\s*(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:for|on)\s+(.+)/i,
      /(?:bought|purchased|spend|spent|paid)\s+(.+?)\s+(?:for|at)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:rs|rupees|inr|₹)/i,
      /(.+?)\s+(?:for|costing|at)\s*(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];

    for (const pat of purchasePatterns) {
      const pMatch = part.match(pat);
      if (pMatch) {
        let titleCandidate = '';
        let amountCandidate = '';
        if (pat === purchasePatterns[1]) {
          amountCandidate = pMatch[1];
          titleCandidate = pMatch[2];
        } else {
          titleCandidate = pMatch[1];
          amountCandidate = pMatch[2];
        }
        const amt = parseFloat(amountCandidate.replace(/,/g, ''));
        if (Number.isFinite(amt) && amt > 0) {
          isPurchase = true;
          purchaseAmount = Math.round(amt * 100) / 100;
          part = titleCandidate.trim();
          break;
        }
      }
    }

    // Detect reminder:
    let isReminder = false;
    const reminderPrefix = /^(?:remind\s+me\s+to\s+|remind\s+me\s+|reminder\s*:?\s*)/i;
    if (reminderPrefix.test(part)) {
      isReminder = true;
      part = part.replace(reminderPrefix, '').trim();
    }

    // Detect appointment:
    const isAppointment = /\b(?:doctor\s+appointment|dentist\s+appointment|appointment|scheduled\s+meeting)\b/i.test(part);

    // Parse date and time with local date engine (whenText.ts):
    const when = parseWhen(part, now);
    let title = when.title.trim() || part.trim();

    // Clean up title: remove leading/trailing noise, capitalize
    title = title.replace(/^[-*•\s]+/, '').replace(/[,;.\s]+$/, '').trim();
    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    if (!title) title = 'Untitled task';

    // Match people from knownPeople
    const matchedPeople = knownPeople.filter((p) =>
      new RegExp(`\\b${p}\\b`, 'i').test(rawPart)
    );
    const people = matchedPeople.length > 0 ? matchedPeople.join(', ') : null;

    // Determine type:
    let type: MemoryType = 'task';
    if (isPurchase) {
      type = 'purchase';
    } else if (isReminder) {
      type = 'reminder';
    } else if (isAppointment) {
      type = 'appointment';
    }

    // Determine eventDate:
    let eventDate = when.eventDate;
    if (!eventDate) {
      if (type === 'task' || type === 'reminder' || type === 'appointment') {
        eventDate = dueToday(now).toISOString();
      } else {
        eventDate = nowISO;
      }
    }

    // Determine category:
    let category: Category = 'Other';
    if (type === 'purchase') {
      const expCategory = mapToExpenseCategory(title);
      category = (CATEGORIES.includes(expCategory as Category) ? expCategory : 'Shopping') as Category;
    } else {
      category = mapToMemoryCategory(title);
    }

    drafts.push({
      title,
      type,
      category,
      eventDate,
      dateExpression: when.dateExpression,
      amount: purchaseAmount,
      currency: purchaseAmount !== null ? DEFAULT_CURRENCY : null,
      people,
      location: null,
      tags: null,
      priority,
      status: 'active',
      repeat,
      groupName,
    });
  }

  return drafts;
}
