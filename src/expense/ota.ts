import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import {} from 'react-native';
import { showDialog } from '../dialogStore';

/**
 * Explicit "Check for updates" tap from Settings. Ambient checking,
 * downloading and reloading is handled by useAutoUpdate() + UpdateBanner —
 * this only gives a deliberate tap some feedback.
 */
export async function checkForOtaUpdate() {
  if (__DEV__ || !Updates.isEnabled) {
    showDialog({
      title: 'Updates',
      message: 'OTA updates only work in a release build (not in Expo Go / dev mode).',
    });
    return;
  }
  try {
    const res = await Updates.checkForUpdateAsync();
    if (!res.isAvailable) {
      showDialog({ title: 'Up to date', message: 'You are on the latest version.' });
      return;
    }
    await Updates.fetchUpdateAsync();
    // isUpdatePending flips true here — UpdateBanner picks it up and offers Restart.
  } catch (e) {
    showDialog({
      title: 'Update check failed',
      message: String(e instanceof Error ? e.message : e),
    });
  }
}

export function updateInfo() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { otaBuild?: number };
  return {
    enabled: Updates.isEnabled,
    runtimeVersion: Updates.runtimeVersion ?? 'n/a',
    channel: Updates.channel ?? 'n/a',
    updateId: Updates.updateId ?? 'embedded',
    // Bumped by hand with every `eas update` publish — unlike runtimeVersion,
    // this is free to change on every OTA push without breaking delivery.
    otaBuild: extra.otaBuild ?? 1,
  };
}
