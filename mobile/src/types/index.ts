// Central TypeScript types shared across screens and services.

import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Home: undefined;
  FocusControl: { sessionId: string };
  SafetySettings: undefined;
  NotificationPreferences: undefined;
  DeviceScan: undefined;
  Auth: undefined;
  MeetingPrepCard: { card: MeetingPrepCard };
};

export type HomeNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;
export type FocusControlNavigationProp = NativeStackNavigationProp<RootStackParamList, 'FocusControl'>;
export type SafetySettingsNavigationProp = NativeStackNavigationProp<RootStackParamList, 'SafetySettings'>;
export type NotificationPreferencesNavigationProp = NativeStackNavigationProp<RootStackParamList, 'NotificationPreferences'>;
export type DeviceScanNavigationProp = NativeStackNavigationProp<RootStackParamList, 'DeviceScan'>;
export type MeetingPrepCardNavigationProp = NativeStackNavigationProp<RootStackParamList, 'MeetingPrepCard'>;

// ─── Focus state ──────────────────────────────────────────────────────────────

export type FocusStatus = 'idle' | 'active' | 'distracted' | 'error';

export interface FocusSession {
  sessionId: string;
  userId: string;
  status: 'active' | 'completed' | 'cancelled';
  startedAt: number;
  expiresAt?: number;
  lastUndoToken?: string;
}

// ─── Meeting prep card ────────────────────────────────────────────────────────

export interface MeetingPrepCard {
  cardId: string;
  calendarEventId: string;
  meetingTitle: string;
  startEpoch: number;
  prepSummary: string;
  questions: [string, string, string];
  emotionTone: 'calm' | 'confident' | 'supportive' | 'neutral' | 'cautious';
  evidenceSources: string[];
  hapticEnabled: boolean;
}

// ─── Safety guardian ──────────────────────────────────────────────────────────

export interface EmergencyContact {
  id: string;
  name: string;
  phoneNumber: string;
  notifyOnTimeout: boolean;
}

export interface SafetySettings {
  safetyGuardianEnabled: boolean;
  contacts: EmergencyContact[];
  timeoutThresholdMinutes: number;
}

// ─── User preferences (Sub-Task 10) ─────────────────────────────────────────

export interface UserPreferences {
  user_id?: string;
  pre_meeting_enabled: boolean;
  notification_preview: 'generic' | 'private_context';
  focus_action_scope: 'ask_every_time' | 'this_session' | 'never';
  slack_status_enabled: boolean;
  safety_guardian_enabled: boolean;
  location_in_sos: 'off' | 'ask_each_time' | 'approved_contacts_only';
  muted_series?: string[];
  opted_in_calendars?: string[];
}
