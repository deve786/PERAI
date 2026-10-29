/**
 * Background auto-sync service for Telegram channels.
 * Runs on a user-configured interval (default: 5 minutes) and when app returns to foreground.
 * Only fetches NEW messages since the last known message ID (incremental sync).
 */
import { AppState, type AppStateStatus } from 'react-native';
import { syncAllActiveTelegramChannels } from './telegram';
import { getTelegramAutoSyncInterval } from '@/settings';
import { getSetting } from '@/db/queries';
import { syncSourcesNow } from './sync';

let syncTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncTime = 0;
let isSyncing = false;

type AutoSyncListener = (outcome: { newMessagesTotal: number; syncedAt: string }) => void;
const listeners = new Set<AutoSyncListener>();

export function onTelegramAutoSynced(callback: AutoSyncListener): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(outcome: { newMessagesTotal: number; syncedAt: string }) {
  listeners.forEach((cb) => {
    try {
      cb(outcome);
    } catch (e) {
      console.warn('[telegram-auto-sync] Listener error:', e);
    }
  });
}

/**
 * Checks if auto-sync interval has elapsed and executes incremental sync.
 */
export async function checkAndSyncTelegram(force = false): Promise<number> {
  if (isSyncing) return 0;
  isSyncing = true;

  try {
    const intervalMinutes = await getTelegramAutoSyncInterval();
    if (intervalMinutes <= 0 && !force) return 0;

    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;

    if (!force && lastSyncTime > 0 && now - lastSyncTime < intervalMs) {
      return 0;
    }

    const token = (await getSetting('telegram_bot_token')) || '';
    const { newMessagesTotal } = await syncAllActiveTelegramChannels(token);
    lastSyncTime = Date.now();

    const outcome = {
      newMessagesTotal,
      syncedAt: new Date().toISOString(),
    };

    if (newMessagesTotal > 0) {
      void syncSourcesNow();
    }

    notifyListeners(outcome);
    return newMessagesTotal;
  } catch (err) {
    console.warn('[telegram-auto-sync] Auto-sync failed:', err);
    return 0;
  } finally {
    isSyncing = false;
  }
}

/**
 * Starts the Telegram auto-sync service.
 * Automatically checks for updates periodically while the app is running.
 */
export function startTelegramAutoSync(): () => void {
  // Run on startup
  void checkAndSyncTelegram();

  // Heartbeat check every 30 seconds to test if the interval has passed
  if (!syncTimer) {
    syncTimer = setInterval(() => {
      void checkAndSyncTelegram();
    }, 30_000);
  }

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void checkAndSyncTelegram();
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return () => {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
    subscription.remove();
  };
}
