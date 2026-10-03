/**
 * Reading a "you have run out" answer from the AI, and working out when it
 * comes back. Pure, so the timing is unit tested in plain Node.
 *
 * Two different limits wear the same 429: a short burst limit that clears in
 * seconds, and the day's allowance, which Google resets at midnight Pacific
 * time (https://ai.google.dev/gemini-api/docs/rate-limits).
 */

export function isQuotaError(message: string): boolean {
  return /quota|rate limit|too many requests|resource_exhausted|\b429\b/i.test(message);
}

/** The wait the API itself asked for, when it says one. */
export function suggestedWaitMs(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)\s*s/i);
  if (!match) return null;
  return Math.ceil(Number(match[1])) * 1000;
}

function pacificClock(now: Date): { hour: number; minute: number; second: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(now);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
    return { hour: value('hour') % 24, minute: value('minute'), second: value('second') };
  } catch {
    // A phone without time zone data: Pacific runs 7 or 8 hours behind UTC, so
    // 7 puts the answer within an hour of the truth.
    const approximate = new Date(now.getTime() - 7 * 3_600_000);
    return {
      hour: approximate.getUTCHours(),
      minute: approximate.getUTCMinutes(),
      second: approximate.getUTCSeconds(),
    };
  }
}

/** When the day's allowance refills: the next midnight in California. */
export function nextDailyReset(now: Date = new Date()): Date {
  const { hour, minute, second } = pacificClock(now);
  const secondsLeft = (24 - hour) * 3600 - minute * 60 - second;
  return new Date(now.getTime() + secondsLeft * 1000);
}

export interface QuotaWait {
  /** 'burst' clears in seconds; 'day' waits for the daily reset. */
  kind: 'burst' | 'day';
  retryAt: Date;
}

/** Which limit was hit, and when it is worth trying again. */
export function quotaWait(message: string, now: Date = new Date()): QuotaWait {
  const suggested = suggestedWaitMs(message);
  const daily = /per ?day|daily|requests per day|rpd/i.test(message);

  if (!daily && suggested !== null && suggested <= 10 * 60_000) {
    return { kind: 'burst', retryAt: new Date(now.getTime() + suggested) };
  }
  return { kind: 'day', retryAt: nextDailyReset(now) };
}

const clock = (at: Date) =>
  at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** What to put in front of the person when the AI has nothing left to give. */
export function quotaMessage(message: string, now: Date = new Date()): string {
  const wait = quotaWait(message, now);
  if (wait.kind === 'burst') {
    return `The AI is busy for a moment. It frees up at about ${clock(wait.retryAt)}.`;
  }

  const tomorrow = wait.retryAt.toDateString() !== now.toDateString();
  return `Today's AI quota is used up. It comes back at about ${clock(wait.retryAt)}${
    tomorrow ? ' tomorrow' : ''
  }.`;
}
