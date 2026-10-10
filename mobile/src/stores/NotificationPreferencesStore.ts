/**
 * NotificationPreferencesStore — manages user preference profiles for
 * pre-meeting cards, notification preview mode, focus action scopes, and Slack.
 *
 * Provides in-memory caching and optimistic update pattern mirroring SafetySettingsStore.
 */
import { auraHttp } from '../services/AuraApiClient';
import type { UserPreferences } from '../types';

export const DEFAULT_PREFERENCES: UserPreferences = {
  pre_meeting_enabled: false,
  notification_preview: 'generic',
  focus_action_scope: 'ask_every_time',
  slack_status_enabled: false,
  safety_guardian_enabled: false,
  location_in_sos: 'ask_each_time',
  muted_series: [],
  opted_in_calendars: [],
};

let cachedPreferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let hasFetched = false;

export async function loadPreferences(forceRefresh = false): Promise<UserPreferences> {
  if (hasFetched && !forceRefresh) {
    return { ...cachedPreferences };
  }

  try {
    const raw = (await auraHttp.getPreferences()) as { preferences?: Partial<UserPreferences> };
    if (raw && raw.preferences) {
      cachedPreferences = {
        ...DEFAULT_PREFERENCES,
        ...raw.preferences,
      };
      hasFetched = true;
    }
  } catch (err) {
    console.warn('[NotificationPreferencesStore] Failed to load preferences, using cached:', err);
  }

  return { ...cachedPreferences };
}

export async function savePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences> {
  // Optimistic update
  cachedPreferences = {
    ...cachedPreferences,
    ...patch,
  };

  try {
    const res = (await auraHttp.updatePreferences(patch)) as { preferences?: Partial<UserPreferences> };
    if (res && res.preferences) {
      cachedPreferences = {
        ...cachedPreferences,
        ...res.preferences,
      };
    }
  } catch (err) {
    console.warn('[NotificationPreferencesStore] Failed to sync preferences with backend:', err);
  }

  return { ...cachedPreferences };
}
