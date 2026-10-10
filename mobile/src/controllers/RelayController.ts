/**
 * RelayController — the central relay logic layer that bridges BLE events
 * from the Orbit wearable to the AURA cloud backend and vice-versa.
 *
 * Relay rules
 * ───────────
 * 1. BLE CMD_FOCUS_START from Orbit → POST /api/v1/focus/session {action:"start"}
 *    and send a WebSocket relay_envelope with explicit_signal:"focus_started".
 * 2. BLE CMD_DISTRACTED from Orbit → relay focus_signal with "self_report_distracted".
 * 3. BLE EVT_SAFETY_TIMEOUT → call registered safety timeout handlers (SMS/call
 *    via the contacts stored in SafetySettingsStore).
 * 4. APNs / push WatchWhisperCard → send haptic meeting_alert packet over BLE to Orbit.
 */
import { Alert, Linking } from 'react-native';
import {
  bleService,
  CMD_FOCUS_START,
  CMD_FOCUS_STOP,
  CMD_DISTRACTED,
  CMD_UNDO,
} from '../services/BLEService';
import {
  auraHttp,
  auraWS,
  buildFocusRelayEnvelope,
  getStoredUserId,
  type WatchWhisperCard,
  type FocusSignalResponse,
  type RoutineDeviceAction,
  type RecommendedAction,
  type EmotionTone,
} from '../services/AuraApiClient';
import { loadSafetySettings } from '../stores/SafetySettingsStore';
import type { FocusSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

type SessionStateListener = (session: FocusSession | null) => void;

class RelayController {
  private activeSession: FocusSession | null = null;
  private listeners: Set<SessionStateListener> = new Set();

  // ── Initialise relay wiring ────────────────────────────────────────────────

  init(): void {
    bleService.registerFocusStateCallback((cmd) => this.handleBleCommand(cmd));
    bleService.registerSafetyTimeoutCallback(() => this.handleSafetyTimeout());
  }

  subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.activeSession));
  }

  // ── BLE command dispatch ───────────────────────────────────────────────────

  private async handleBleCommand(cmd: number): Promise<void> {
    const userId = await getStoredUserId();
    if (!userId) return;

    switch (cmd) {
      case CMD_FOCUS_START:
        await this.startFocusSession(userId);
        break;
      case CMD_FOCUS_STOP:
        await this.stopFocusSession(userId);
        break;
      case CMD_DISTRACTED:
        await this.reportDistracted(userId);
        break;
      case CMD_UNDO:
        await this.undoLastAction(userId);
        break;
      default:
        break;
    }
  }

  // ── Focus session helpers (also called directly from FocusControlScreen) ──

  async startFocusSession(userId: string, durationMinutes = 45): Promise<FocusSession> {
    let session: FocusSession;
    try {
      const response = await auraHttp.manageFocusSession({
        user_id: userId,
        action: 'start',
        duration_minutes: durationMinutes,
      });
      session = {
        sessionId: response.session_id,
        userId: response.user_id,
        status: response.status,
        startedAt: response.started_at,
        expiresAt: response.expires_at,
      };
    } catch {
      // Offline / sandbox fallback: create local session so button action never stalls
      const now = Math.floor(Date.now() / 1000);
      session = {
        sessionId: `session_${uuidv4().slice(0, 8)}`,
        userId: userId,
        status: 'active',
        startedAt: now,
        expiresAt: now + durationMinutes * 60,
      };
    }

    this.activeSession = session;
    this.notify();

    // Also relay over WebSocket if connected
    if (auraWS.isConnected) {
      const envelope = buildFocusRelayEnvelope(userId, session.sessionId, 'focus_started');
      await auraWS.sendRelay(envelope).catch(() => {});
    }

    return session;
  }

  async stopFocusSession(userId: string): Promise<void> {
    const sessionId = this.activeSession?.sessionId ?? uuidv4();
    try {
      await auraHttp.manageFocusSession({ user_id: userId, action: 'stop', session_id: sessionId });
    } catch {
      // Local fallback
    }
    this.activeSession = null;
    this.notify();
  }

  async reportDistracted(userId: string): Promise<void> {
    if (!this.activeSession) return;
    const eventId = uuidv4();
    try {
      await auraHttp.postFocusSignal({
        event_id: eventId,
        user_id: userId,
        session_id: this.activeSession.sessionId,
        timestamp: Date.now() / 1000,
        explicit_signal: 'self_report_distracted',
        evidence: [],
        idempotency_key: eventId,
      });
    } catch {
      // Local fallback
    }

    if (auraWS.isConnected) {
      const envelope = buildFocusRelayEnvelope(userId, this.activeSession.sessionId, 'self_report_distracted');
      await auraWS.sendRelay(envelope).catch(() => {});
    }
  }

  async triggerAdaptiveIntent(
    userId: string,
    intent: string,
    devices?: string[],
  ): Promise<FocusSignalResponse> {
    const sessionId = this.activeSession?.sessionId ?? `session_${uuidv4().slice(0, 8)}`;
    const eventId = uuidv4();
    try {
      const response = await auraHttp.postFocusSignal({
        event_id: eventId,
        user_id: userId,
        session_id: sessionId,
        timestamp: Date.now() / 1000,
        explicit_signal: 'none',
        user_intent: intent,
        connected_devices: devices ?? ['dev_firetv_living_room', 'dev_smart_lights', 'dev_echo_office'],
        evidence: [],
        idempotency_key: eventId,
      });
      if (response.undo_token && this.activeSession) {
        this.activeSession.lastUndoToken = response.undo_token;
        this.notify();
      }
      return response;
    } catch {
      // Offline fallback: generate structured proposal locally without hanging or crashing
      const intentLower = intent.trim().toLowerCase();
      let recAction: RecommendedAction = 'request_pause';
      let actions: RoutineDeviceAction[] = [
        { device: 'dev_firetv_living_room', device_name: 'Living Room Fire TV', action: 'request_pause', description: 'Pause video playback' },
        { device: 'dev_smart_lights', device_name: 'Smart Key Light', action: 'dim_lights', description: 'Dim lighting to 20%' },
      ];
      let summary = `Adaptive routine proposal for intent: "${intent}"`;
      let reason = `Recommended actions tailored to "${intent}".`;
      let tone: EmotionTone = 'calm';

      if (intentLower.includes('break')) {
        recAction = 'request_pause';
        actions = [
          { device: 'dev_firetv_living_room', device_name: 'Living Room Fire TV', action: 'request_pause', description: 'Pause active screens' },
          { device: 'dev_echo_office', device_name: 'Office Echo', action: 'request_dnd', description: '15-min Breather status' },
        ];
        summary = '15-min pause timer + Slack breather status recommended.';
        tone = 'supportive';
      } else if (intentLower.includes('distracted')) {
        recAction = 'nudge';
        actions = [
          { device: 'dev_orbit_wearable', device_name: 'Orbit Wristband', action: 'nudge', description: 'Refocus haptic pulse' },
        ];
        summary = 'Gentle refocus haptic nudge recommended.';
        tone = 'neutral';
      }

      return {
        proposal: {
          prep_summary: summary,
          '3_questions': [
            'Would you like to apply these actions now?',
            'Should we adjust ambient stimulation?',
            'Remember this routine for next time?',
          ],
          emotion_tone: tone,
          is_distracted: intentLower.includes('distracted'),
          distraction_score: 0.5,
          deep_work_bank_delta: 0,
          evidence_ids: [],
          recommended_action: recAction,
          reason,
          device_actions: actions,
        },
        policy_required: true,
        decision: 'ask_user_confirmation',
        device_actions: actions,
        routine_actions: actions,
      };
    }
  }

  async applyRoutineProposal(
    userId: string,
    intent: string,
    remember: boolean,
    actions: RoutineDeviceAction[],
  ): Promise<{ undoToken: string }> {
    const undoToken = `undo_rtn_${uuidv4().slice(0, 8)}`;
    if (this.activeSession) {
      this.activeSession.lastUndoToken = undoToken;
      this.notify();
    }
    try {
      if (remember) {
        await auraHttp.createRoutine({
          user_id: userId,
          intent,
          actions,
          name: `Routine: ${intent}`,
          scope: 'always',
        }).catch(() => {});
      }
    } catch {
      // Local fallback
    }
    return { undoToken };
  }

  async undoLastAction(userId: string): Promise<void> {
    if (!this.activeSession?.lastUndoToken) return;
    const token = this.activeSession.lastUndoToken;
    this.activeSession.lastUndoToken = undefined;
    this.notify();
    try {
      await auraHttp.undoAction({ undo_token: token, user_id: userId });
    } catch {
      // Local fallback
    }
  }

  // ── Safety timeout relay & Health Guardian ────────────────────────────────

  /**
   * Guard checking that no raw heart-rate or biometric samples leak into payloads.
   * Enforces zero raw health telemetry rule.
   */
  static validateNoRawHealthTelemetry(payload: Record<string, unknown>): boolean {
    const prohibitedKeys = ['bpm', 'heart_rate', 'raw_ppg', 'raw_samples', 'continuous_hr', 'optical_samples'];
    for (const key of prohibitedKeys) {
      if (key in payload && payload[key] !== undefined) {
        console.warn(`[RelayController] Prohibited raw health telemetry detected: "${key}". Discarding.`);
        return false;
      }
    }
    return true;
  }

  /**
   * Single unified safety check-in prompt handler shared across hardware paths.
   */
  showSafetyCheckin(onOk?: () => Promise<void>, onEscalate?: () => Promise<void>): void {
    const title = 'Are you okay?';
    const message =
      'Safety Guardian check-in triggered. AURA is an opt-in wellness companion and not a medical device.';
    Alert.alert(
      title,
      message,
      [
        {
          text: "I'm OK",
          onPress: async () => {
            if (onOk) await onOk();
          },
        },
        {
          text: 'Notify Contacts',
          style: 'destructive',
          onPress: async () => {
            if (onEscalate) await onEscalate();
          },
        },
      ],
      { cancelable: false },
    );
  }

  async handleSafetyTimeout(): Promise<void> {
    const settings = await loadSafetySettings();
    if (!settings.safetyGuardianEnabled) return;

    const incidentId = `inc_${uuidv4().slice(0, 8)}`;
    const userId = this.activeSession?.userId ?? 'usr_default';

    const onOk = async () => {
      try {
        await auraHttp.cancelSafety(userId, incidentId);
      } catch (err) {
        console.warn('[RelayController] Safety cancel failed:', err);
      }
    };

    const onEscalate = async () => {
      try {
        await auraHttp.escalateSafety(userId, incidentId, 'timeout_no_response');
      } catch (err) {
        console.warn('[RelayController] Safety escalation failed:', err);
      }

      // Notify contacts via OS dialler
      const contacts = settings.contacts.filter((c) => c.notifyOnTimeout);
      for (const contact of contacts) {
        const tel = `tel:${contact.phoneNumber.replace(/\D/g, '')}`;
        const canOpen = await Linking.canOpenURL(tel);
        if (canOpen) {
          await Linking.openURL(tel);
          break;
        }
      }
    };

    this.showSafetyCheckin(onOk, onEscalate);
  }

  // ── Push notification relay (APNs → BLE Orbit) ────────────────────────────

  /**
   * Called by the push notification handler in App.tsx when a WatchWhisperCard
   * payload arrives from the backend (APNs data payload).
   */
  async relayMeetingPrepToOrbit(card: WatchWhisperCard): Promise<void> {
    if (!bleService.isConnected) return;
    if (!card.haptic_enabled || card.is_quiet_hours) return;
    const label = card.meeting_title.slice(0, 28);
    await bleService.sendMeetingAlertHaptic(label);
  }

  // ── State accessors ───────────────────────────────────────────────────────

  get session(): FocusSession | null {
    return this.activeSession;
  }
}

export const relayController = new RelayController();
