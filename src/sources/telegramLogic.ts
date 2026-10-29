/**
 * Pure logic for Telegram incremental syncing, message filtering, and formatting.
 * Free of React Native / Expo imports so it can be tested and used anywhere.
 */

export interface RawTelegramPost {
  postPath: string;
  messageId: number;
  date: string;
  text: string;
  mediaType: 'photo' | 'video' | 'document' | 'none';
  mediaPath: string | null;
  photos: string[];
  docInfo: string | null;
  ocrText?: string | null;
}

/**
 * Filters posts for incremental syncing.
 * Only returns posts strictly newer than lastMessageId (messageId > lastMessageId).
 * Signals reachedKnown = true as soon as any post with messageId <= lastMessageId is encountered.
 */
export function filterIncrementalTelegramPosts(
  posts: RawTelegramPost[],
  lastMessageId?: number | null
): { newPosts: RawTelegramPost[]; reachedKnown: boolean } {
  if (!lastMessageId || lastMessageId <= 0) {
    return {
      newPosts: posts,
      reachedKnown: false,
    };
  }

  const newPosts = posts.filter((p) => p.messageId > lastMessageId);
  const reachedKnown = posts.some((p) => p.messageId <= lastMessageId);

  return {
    newPosts,
    reachedKnown,
  };
}

/**
 * Calculates whether an auto-sync check is due based on the last sync timestamp
 * and the configured interval in minutes.
 */
export function isAutoSyncDue(
  lastSyncedAt: string | null | undefined,
  intervalMinutes: number,
  now = Date.now()
): boolean {
  if (intervalMinutes <= 0) return false;
  if (!lastSyncedAt) return true;

  const lastSyncTime = new Date(lastSyncedAt).getTime();
  if (isNaN(lastSyncTime)) return true;

  const intervalMs = intervalMinutes * 60 * 1000;
  return now - lastSyncTime >= intervalMs;
}

/**
 * Formats the auto-sync interval label.
 */
export function formatAutoSyncInterval(minutes: number): string {
  if (minutes <= 0) return 'Off';
  if (minutes === 1) return 'Every 1 minute';
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return 'Every 1 hour';
  return `Every ${Math.round(minutes / 60)} hours`;
}
