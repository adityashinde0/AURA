import * as SecureStore from 'expo-secure-store';
import { v4 as uuidv4 } from 'uuid';

// ─── Endpoint configuration ───────────────────────────────────────────────────
// Override via environment / Expo config in app.config.ts at build time.
const HTTPS_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://api.aura.internal/v1';
const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'wss://ws.aura.internal/v1';

const SECURE_STORE_TOKEN_KEY = 'aura.auth_token';
const SECURE_STORE_USER_ID_KEY = 'aura.user_id';

// ─── Schema-aligned types (mirror schemas/ directory contracts) ───────────────

export type ExplicitSignal = 'none' | 'self_report_distracted' | 'focus_started';
export type FocusSessionAction = 'start' | 'stop';
export type EmotionTone = 'calm' | 'confident' | 'supportive' | 'neutral' | 'cautious';
export type RecommendedAction = 'none' | 'nudge' | 'request_dnd' | 'request_pause';
export type ActionType = 'nudge' | 'request_dnd' | 'request_pause' | 'slack_status';
export type ConsentScope = 'ask_every_time' | 'allow_session' | 'allow_always' | 'never';
export type AckStatus = 'accepted' | 'quarantined' | 'rejected';
export type RelayEventType =
  | 'transcription_snippet'
  | 'focus_signal'
  | 'noise_detected'
  | 'mark_moment'
  | 'meeting_prep_envelope';

export interface EvidenceItem {
  id: string;
  snippet: string;
}

export interface RoutineDeviceAction {
  device: string;
  device_name?: string;
  action: string;
  description?: string;
}

export interface LearnedRoutine {
  routine_id: string;
  user_id: string;
  intent: string;
  intent_pattern: string;
  name: string;
  actions: RoutineDeviceAction[];
  scope: 'always' | 'allow_always' | 'ask_every_time';
  active: boolean;
  created_at: number;
}

// POST /api/v1/focus/signal
export interface FocusSignalRequest {
  event_id: string;
  user_id: string;
  session_id: string;
  timestamp: number;
  explicit_signal: ExplicitSignal;
  evidence: EvidenceItem[];
  consented_signal_score?: number;
  idempotency_key?: string;
  user_intent?: string;
  connected_devices?: string[];
}

export interface FocusProposal {
  prep_summary?: string;
  '3_questions'?: string[];
  emotion_tone?: EmotionTone;
  is_distracted?: boolean;
  distraction_score?: number;
  deep_work_bank_delta?: number;
  evidence_ids?: string[];
  recommended_action: RecommendedAction;
  reason: string;
  device_actions?: RoutineDeviceAction[];
  routine_name?: string;
}

export interface FocusSignalResponse {
  proposal: FocusProposal;
  policy_required: boolean;
  decision?: string;
  undo_token?: string | null;
  target_device_id?: string | null;
  device_actions?: RoutineDeviceAction[];
  routine_actions?: RoutineDeviceAction[];
  learned_routine?: boolean;
}

// POST /api/v1/focus/session
export interface FocusSessionRequest {
  user_id: string;
  action: FocusSessionAction;
  duration_minutes?: number;
  session_id?: string;
}

export interface FocusSessionResponse {
  session_id: string;
  user_id: string;
  status: 'active' | 'completed' | 'cancelled';
  started_at: number;
  expires_at?: number;
}

// POST /api/v1/actions/undo
export interface UndoRequest {
  undo_token: string;
  user_id: string;
}

// GET /api/v1/consent/grants
export interface ConsentGrant {
  grant_id: string;
  user_id: string;
  tenant_id?: string;
  action_type: ActionType;
  scope: ConsentScope;
  target_allowlist: string[];
  active: boolean;
  created_at: number;
  expires_at?: number;
}

export interface CreateConsentGrantRequest {
  user_id: string;
  tenant_id?: string;
  action_type: ActionType;
  scope: ConsentScope;
  target_allowlist?: string[];
  ttl_seconds?: number;
}

// GET /api/v1/audit/actions
export interface AuditRecord {
  action_id: string;
  user_id: string;
  action_type: string;
  target_device?: string;
  status: 'executed' | 'blocked' | 'suggested' | 'undone';
  reason?: string;
  undo_token?: string;
  timestamp: number;
}

// WebSocket relay envelope (schema: schemas/websocket/relay_envelope.json)
export interface RelayEnvelope {
  action: 'relay';
  event_id: string;
  event_type: RelayEventType;
  timestamp: number;
  user_id: string;
  session_id?: string;
  source?: string;
  evidence?: EvidenceItem[];
  signal_payload?: {
    explicit_signal?: ExplicitSignal;
    consented_signal_score?: number;
    app?: string;
  };
}

// WebSocket relay acknowledgement (schema: schemas/websocket/relay_acknowledgement.json)
export interface RelayAcknowledgement {
  ack_id: string;
  event_id: string;
  status: AckStatus;
  bus_message_id?: string;
  timestamp: number;
}

// POST /api/v1/notifications/feedback
export type FeedbackAction = 'Read' | 'Save' | 'Not useful' | 'Mute this event series';

export interface NotificationFeedbackRequest {
  user_id: string;
  card_id: string;
  calendar_event_id: string;
  action: FeedbackAction;
  series_id?: string;
}

export interface NotificationFeedbackResponse {
  ok: true;
  user_id: string;
  card_id: string;
  action: FeedbackAction;
  muted_series_count: number;
  audit_id: string;
}

// Watch whisper card (schema: schemas/pre_meeting/watch_whisper_card.json)
export interface WatchWhisperCard {
  card_id: string;
  calendar_event_id: string;
  user_id: string;
  meeting_title: string;
  start_epoch: number;
  prep_summary: string;
  questions: [string, string, string];
  emotion_tone: EmotionTone;
  evidence_sources: string[];
  actions: Array<'Read' | 'Save' | 'Not useful' | 'Mute this event series'>;
  created_at: number;
  delivered_to: 'bee_watch' | 'mobile_fallback';
  is_quiet_hours?: boolean;
  haptic_enabled?: boolean;
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

/** Maximum time to wait for a backend HTTP response (milliseconds). */
const HTTP_REQUEST_TIMEOUT_MS = 10_000; // 10 s

/**
 * Wraps `fetch` with an AbortController-based timeout.  If the server does
 * not respond within `timeoutMs`, the request is aborted and an error is
 * thrown rather than hanging indefinitely (which would spin the event loop
 * and drain battery).
 */
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = HTTP_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

class AuraHttpClient {
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await SecureStore.getItemAsync(SECURE_STORE_TOKEN_KEY);
    if (!token) throw new Error('AuraApiClient: no auth token — user must authenticate first');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const headers = await this.authHeaders();
    let url = `${HTTPS_BASE}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url = `${url}?${qs}`;
    }
    const response = await fetchWithTimeout(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Fail-closed on all non-2xx responses, including unknown status codes
    // outside the 200–299 range. response.ok already covers this range, but
    // the explicit check below makes the intent clear: any unrecognised status
    // (e.g. a 5xx from an intermediate proxy) is treated as an error and the
    // response body is never deserialized as valid data.
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new AuraApiError(
        response.status,
        (errorBody as Record<string, unknown>)?.error as string ?? 'request_failed',
        (errorBody as Record<string, unknown>)?.message as string ?? `HTTP ${response.status}`,
      );
    }

    // Explicitly validate that the status is within the expected 200–299 range.
    // response.ok is equivalent, but this guard documents the invariant and
    // ensures any future change to the condition above does not silently allow
    // non-success codes to reach the JSON decoder.
    if (response.status < 200 || response.status > 299) {
      throw new AuraApiError(response.status, 'unexpected_status', `Unexpected HTTP status: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Focus signal ───────────────────────────────────────────────────────────

  async postFocusSignal(payload: FocusSignalRequest): Promise<FocusSignalResponse> {
    return this.request<FocusSignalResponse>('POST', '/api/v1/focus/signal', payload);
  }

  // ── Focus session ──────────────────────────────────────────────────────────

  async manageFocusSession(payload: FocusSessionRequest): Promise<FocusSessionResponse> {
    return this.request<FocusSessionResponse>('POST', '/api/v1/focus/session', payload);
  }

  // ── Undo ───────────────────────────────────────────────────────────────────

  async undoAction(payload: UndoRequest): Promise<void> {
    await this.request<unknown>('POST', '/api/v1/actions/undo', payload);
  }

  // ── Consent ────────────────────────────────────────────────────────────────

  async listConsentGrants(userId: string): Promise<ConsentGrant[]> {
    const data = await this.request<{ user_id: string; grants: ConsentGrant[] }>(
      'GET',
      '/api/v1/consent/grants',
      undefined,
      { user_id: userId },
    );
    return data.grants;
  }

  async createConsentGrant(payload: CreateConsentGrantRequest): Promise<ConsentGrant> {
    return this.request<ConsentGrant>('POST', '/api/v1/consent/grants', payload);
  }

  async revokeConsentGrant(grantId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/v1/consent/grants/${grantId}`);
  }

  // ── Adaptive Intent Routines ───────────────────────────────────────────────

  async getRoutines(userId: string): Promise<LearnedRoutine[]> {
    const data = await this.request<{ routines: LearnedRoutine[] }>(
      'GET',
      '/api/v1/routines',
      undefined,
      { user_id: userId },
    );
    return data.routines ?? [];
  }

  async createRoutine(payload: {
    user_id: string;
    intent: string;
    actions: RoutineDeviceAction[];
    name?: string;
    scope?: string;
  }): Promise<LearnedRoutine> {
    return this.request<LearnedRoutine>('POST', '/api/v1/routines', payload);
  }

  async revokeRoutine(routineId: string, userId: string): Promise<void> {
    await this.request<unknown>('DELETE', `/api/v1/routines/${routineId}`, undefined, { user_id: userId });
  }

  // ── Audit ──────────────────────────────────────────────────────────────────

  async listAuditActions(userId: string, limit = 20): Promise<AuditRecord[]> {
    const data = await this.request<{ records: AuditRecord[] }>(
      'GET',
      '/api/v1/audit/actions',
      undefined,
      { user_id: userId, limit: String(limit) },
    );
    return data.records ?? [];
  }

  // ── Notification feedback ──────────────────────────────────────────────────

  async sendNotificationFeedback(
    cardId: string,
    calendarEventId: string,
    action: FeedbackAction,
    options?: { userId?: string; seriesId?: string },
  ): Promise<NotificationFeedbackResponse> {
    const userId = options?.userId ?? (await SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY)) ?? '';
    const payload: NotificationFeedbackRequest = {
      user_id: userId,
      card_id: cardId,
      calendar_event_id: calendarEventId,
      action,
      ...(options?.seriesId !== undefined ? { series_id: options.seriesId } : {}),
    };
    return this.request<NotificationFeedbackResponse>('POST', '/api/v1/notifications/feedback', payload);
  }

  // ── Safety escalation & cancellation ──────────────────────────────────────

  async escalateSafety(userId: string, incidentId: string, reason = 'timeout_no_response'): Promise<unknown> {
    return this.request<unknown>('POST', '/api/v1/safety/escalate', {
      user_id: userId,
      incident_id: incidentId,
      reason,
    });
  }

  async cancelSafety(userId: string, incidentId: string): Promise<unknown> {
    return this.request<unknown>('POST', '/api/v1/safety/cancel', {
      user_id: userId,
      incident_id: incidentId,
    });
  }

  // ── User preferences (Sub-Task 10) ─────────────────────────────────────────

  async getPreferences(userId?: string): Promise<unknown> {
    const uid = userId ?? (await SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY)) ?? '';
    return this.request<unknown>('GET', '/api/v1/preferences', undefined, { user_id: uid });
  }

  async updatePreferences(preferences: Record<string, unknown>, userId?: string): Promise<unknown> {
    const uid = userId ?? (await SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY)) ?? '';
    return this.request<unknown>('PATCH', '/api/v1/preferences', {
      user_id: uid,
      preferences,
    });
  }

  // ── Safety guardrails ──────────────────────────────────────────────────────

  async getSafetyGuardrails(userId: string): Promise<unknown> {
    return this.request<unknown>('GET', '/api/v1/safety/guardrails', undefined, { user_id: userId });
  }

  // ── Device registry (push token) ───────────────────────────────────────────

  async registerDevice(userId: string, pushToken: string): Promise<unknown> {
    return this.request<unknown>('POST', '/api/v1/devices', {
      user_id: userId,
      push_token: pushToken,
    });
  }
}

// ─── WebSocket client ─────────────────────────────────────────────────────────

type WSMessageCallback = (data: unknown) => void;
type WSAckCallback = (ack: RelayAcknowledgement) => void;
type WSStateCallback = (connected: boolean) => void;

/** Initial WebSocket reconnect delay (ms). Doubles on each failure up to the cap. */
const WS_RECONNECT_BASE_DELAY_MS = 1_000;  //  1 s
/** Maximum WebSocket reconnect delay (ms) — prevents indefinite spin-loops. */
const WS_RECONNECT_MAX_DELAY_MS  = 30_000; // 30 s

class AuraWebSocketClient {
  private ws: WebSocket | null = null;
  private pendingAcks = new Map<string, (ack: RelayAcknowledgement) => void>();
  private onMessage: WSMessageCallback | null = null;
  private onAck: WSAckCallback | null = null;
  private onStateChange: WSStateCallback | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  /** Current WebSocket reconnect delay; doubles on each close until capped. */
  private wsReconnectDelay: number = WS_RECONNECT_BASE_DELAY_MS;

  registerMessageCallback(cb: WSMessageCallback): void { this.onMessage = cb; }
  registerAckCallback(cb: WSAckCallback): void { this.onAck = cb; }
  registerStateCallback(cb: WSStateCallback): void { this.onStateChange = cb; }

  async connect(): Promise<void> {
    const token = await SecureStore.getItemAsync(SECURE_STORE_TOKEN_KEY);
    const userId = await SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY);
    if (!token || !userId) throw new Error('AuraWebSocketClient: missing auth credentials');

    // Reset backoff whenever a fresh connect() is initiated by the caller.
    this.wsReconnectDelay = WS_RECONNECT_BASE_DELAY_MS;
    this.shouldReconnect = true;
    this.openSocket(token, userId);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, 'client_disconnect');
    this.ws = null;
  }

  private openSocket(token: string, userId: string): void {
    const url = `${WS_URL}?user_id=${encodeURIComponent(userId)}&auth_token=${encodeURIComponent(token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // Reset the backoff delay on a successful connection so the next
      // disconnect starts from the fast-retry baseline (1 s) rather than
      // the last backed-off delay.
      this.wsReconnectDelay = WS_RECONNECT_BASE_DELAY_MS;
      this.onStateChange?.(true);
    };

    this.ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch {
        return;
      }
      const msg = parsed as Record<string, unknown>;
      // If it is a relay acknowledgement, resolve the pending promise.
      if (typeof msg.ack_id === 'string' && typeof msg.event_id === 'string') {
        const ack = msg as unknown as RelayAcknowledgement;
        const resolver = this.pendingAcks.get(ack.event_id);
        if (resolver) {
          resolver(ack);
          this.pendingAcks.delete(ack.event_id);
        }
        this.onAck?.(ack);
      } else {
        this.onMessage?.(parsed);
      }
    };

    this.ws.onerror = () => {
      this.onStateChange?.(false);
    };

    this.ws.onclose = () => {
      this.onStateChange?.(false);
      if (this.shouldReconnect) {
        // Exponential backoff: initial 1 s, doubling up to 30 s cap.
        // Prevents WebSocket reconnect spin-loops (CPU/battery drain) when
        // the backend is unreachable for an extended period.
        const delay = Math.min(this.wsReconnectDelay, WS_RECONNECT_MAX_DELAY_MS);
        this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, WS_RECONNECT_MAX_DELAY_MS);
        this.reconnectTimer = setTimeout(async () => {
          const t = await SecureStore.getItemAsync(SECURE_STORE_TOKEN_KEY);
          const u = await SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY);
          if (t && u) this.openSocket(t, u);
        }, delay);
      }
    };
  }

  /**
   * Send a relay envelope and await the server acknowledgement.
   * Rejects if the ack does not arrive within timeoutMs.
   */
  sendRelay(envelope: RelayEnvelope, timeoutMs = 10_000): Promise<RelayAcknowledgement> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      const timer = setTimeout(() => {
        this.pendingAcks.delete(envelope.event_id);
        reject(new Error(`WebSocket ACK timeout for event_id=${envelope.event_id}`));
      }, timeoutMs);

      this.pendingAcks.set(envelope.event_id, (ack) => {
        clearTimeout(timer);
        resolve(ack);
      });

      this.ws.send(JSON.stringify(envelope));
    });
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class AuraApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuraApiError';
  }
}

// ─── Credential helpers (called from AuthService / OAuth flow) ────────────────

export async function storeCredentials(userId: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_STORE_USER_ID_KEY, userId);
  await SecureStore.setItemAsync(SECURE_STORE_TOKEN_KEY, token);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_USER_ID_KEY);
  await SecureStore.deleteItemAsync(SECURE_STORE_TOKEN_KEY);
}

export async function getStoredUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_STORE_USER_ID_KEY);
}

// ─── Relay helper — focus signal via WebSocket envelope ───────────────────────

export function buildFocusRelayEnvelope(
  userId: string,
  sessionId: string,
  signal: ExplicitSignal,
): RelayEnvelope {
  return {
    action: 'relay',
    event_id: uuidv4(),
    event_type: 'focus_signal',
    timestamp: Date.now() / 1000,
    user_id: userId,
    session_id: sessionId,
    source: 'orbit_ble',
    evidence: [],
    signal_payload: {
      explicit_signal: signal,
      consented_signal_score: 1.0,
      app: 'aura_mobile',
    },
  };
}

// ─── Singleton exports ────────────────────────────────────────────────────────

export const auraHttp = new AuraHttpClient();
export const auraWS = new AuraWebSocketClient();
