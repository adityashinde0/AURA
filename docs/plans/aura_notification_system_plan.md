# AURA Notification System — Full Implementation Plan

## Top-Level Overview

**Goal:** Complete the end-to-end AURA notification pipeline so that a user wearing an Apple Watch or the AURA Orbit wearable reliably receives only important, user-approved notifications (T-5 meeting briefings, focus signals, safety check-ins), and can act on them (Read, Not useful, Mute series, I'm OK, Undo).

**Scope:**
- Backend: APNs/FCM delivery Lambda, Bedrock adapter wiring, feedback API endpoints, quiet hours timezone fix, Safety Guardian SMS integration.
- Mobile (React Native/Expo): Meeting prep card UI with action buttons, feedback relay to backend.
- Native Apple Watch app (SwiftUI/watchOS): Watch UI screens, WatchConnectivity bridge, HealthKit event subscription (pre-classified events only, never raw data), voice input.
- Native iPhone companion app (SwiftUI/iOS): Sign-in, device binding, calendar selection, audit timeline, settings.
- AURA Orbit wearable: BLE relay of focus signals and safety check-ins via the existing `BLEService.ts` / `RelayController.ts`; optional PPG wellness signal active only during a focus session.

**Core principle — AURA is proactive, not always-on:**
AURA activates only when the user explicitly starts a Focus Session. Outside a session, AURA is silent — no sensors run, no signals are collected, no data is stored. This applies to both Apple Watch and AURA Orbit. Every notification, sensor read, and safety check-in is gated on an active `FocusSession.status == "active"` or an explicit user action.

**Non-goals:**
- This plan does not block or filter other apps' OS-level notifications.
- This plan does not build medical diagnostic features or automatic emergency calling.
- This plan does not replace Apple Emergency SOS.
- This plan does not build continuous heart-rate monitoring or AI that watches biometric data in the background. Apple Watch defers health classification to Apple's own watchOS algorithms (pre-classified events only). AURA Orbit's PPG sensor runs only during an active session and its output is treated as a wellness signal, never a diagnosis.

**Architectural constraint:** `standalone_agent/policy_engine.py` is the only component authorised to execute adapter actions. All Lambda handlers return proposals; none execute directly. Every new action must go through this gate.

---

## Sub-Task 1 — APNs / FCM Delivery Lambda

**Status:** [x] done

### Intent
The AURA backend can register push tokens but currently has no code that actually sends a push notification. This sub-task wires an EventBridge trigger → Lambda → APNs/FCM provider so that T-5 meeting prep cards are delivered to the user's device.

### Expected Outcomes
- A new Lambda handler `lambda/apns_dispatcher.py` consumes `MeetingPrepTriggered` events from EventBridge.
- It calls `whisper_adapter.deliver_briefing()` to format the `WatchWhisperCard`.
- It calls the APNs HTTP/2 API (or FCM HTTP v1) using the push token stored by `handle_register_wearable()` in `control_plane.py`.
- Delivery success/failure is recorded in an audit entry (append-only, same pattern as `AuditRecord`).
- Quiet hours suppression (already computed by `calendar_scheduler.py`) is respected — no notification is sent when `is_quiet_hours=True`, unless the user's preference says `override_quiet_hours=True`.

### Todo List
- [x] Create `lambda/apns_dispatcher.py` with a `lambda_handler(event, context)` that expects a `MeetingPrepTriggered` EventBridge detail payload.
- [x] Load push token from the wearable binding store (use `InMemoryDataStore.wearable_bindings` in tests; real DynamoDB lookup in production).
- [x] Call `standalone_agent/whisper_adapter.WhisperAdapter.deliver_briefing()` to produce the `WatchWhisperCard` or `MobileNotification` payload.
- [x] Call `standalone_agent/policy_engine.PolicyEngine.evaluate_pre_meeting_briefing()` before sending; abort if decision is not `"executed"`.
- [x] Send the formatted payload to APNs (iOS) or FCM (Android) using provider credentials from AWS Secrets Manager (stub with env-var for local/test).
- [x] Record a structured audit log line (use the `_log()` pattern from `lambda/focus_guardian.py`).
- [x] Add `lambda/requirements.txt` entry for `httpx>=0.27.0` (async APNs HTTP/2 client).
- [x] Write unit tests in `tests/unit/test_apns_dispatcher.py` using `InMemoryDataStore` and a mock HTTP client; assert `policy_required is True` before delivery and audit entry is appended.
- [x] Add JSON Schema `schemas/pre_meeting/apns_dispatch_result.json` for the handler's response shape.
- [x] Add a contract test in `tests/contract/` that validates the dispatch result against the new schema.

### Relevant Context
- `standalone_agent/whisper_adapter.py` — `WhisperAdapter.deliver_briefing()` formats the card.
- `standalone_agent/policy_engine.py` — `evaluate_pre_meeting_briefing()` is the policy gate.
- `standalone_agent/calendar_scheduler.py` — `create_meeting_prep_event()` produces the EventBridge payload consumed here.
- `lambda/control_plane.py` — `handle_register_wearable()` stores the push token; `InMemoryDataStore.wearable_bindings` is the in-memory equivalent.
- `lambda/focus_guardian.py` — copy the `_log()` structured logging helper; do not use `print()`.
- `schemas/pre_meeting/` — place new schema here.

---

## Sub-Task 2 — Bedrock Adapter Wiring (Briefing Generation)

**Status:** [x] done

### Intent
`lambda/focus_guardian.py` raises `NotImplementedError` in `invoke_model()`. Until a real model is wired, every focus proposal and meeting briefing falls back to `safe_fallback()` — a neutral, unhelpful response. This sub-task connects the existing handler to a real Bedrock model call so that T-5 briefings contain genuine, redacted meeting context.

### Expected Outcomes
- `lambda/watsonx_adapter.py` (already present) or a new `lambda/bedrock_adapter.py` provides a `invoke_model(prompt: str) -> dict` function that calls Amazon Bedrock (Claude or Titan) and returns a parsed JSON dict matching `FocusProposal` field names.
- `focus_guardian.lambda_handler` accepts an `invoker=` parameter (already designed for this); passing the real adapter replaces the `NotImplementedError` path.
- Existing unit tests continue to pass (they inject a mock invoker).
- The briefing content is redacted before model invocation: no raw names, PII, or OAuth tokens in the prompt — only structured context keys.

### Todo List
- [x] Read `lambda/watsonx_adapter.py` to determine whether it can be adapted or a new `lambda/bedrock_adapter.py` is needed.
- [x] Implement `invoke_model(prompt: str) -> dict` using `boto3` Bedrock Runtime `invoke_model` API; parse the model JSON response into a dict.
- [x] Inject the real adapter via the `invoker=` parameter in the EventBridge Lambda entry point (not in the handler itself, which must remain testable).
- [x] Add prompt construction logic that redacts raw calendar content and formats a structured briefing request (purpose, tone, 3 questions).
- [x] Handle Bedrock throttling/error: catch `ClientError`, fall back to `safe_fallback()`, log the reason.
- [x] Add `boto3>=1.35.0` to `lambda/requirements.txt` if not already present.
- [x] Write unit tests in `tests/unit/test_bedrock_adapter.py` — mock the boto3 client; assert redaction, correct model ID, and fallback on error.

### Relevant Context
- `lambda/focus_guardian.py` — `invoke_model` parameter, `safe_fallback()`, `FocusProposal` Pydantic model, hallucination guard (`evidence_ids` check).
- `lambda/watsonx_adapter.py` — check if this is reusable.
- `AGENTS.md` — "invoke_model() raises NotImplementedError by design ... injected via invoker= parameter."

---

## Sub-Task 3 — Notification Feedback API (Not Useful / Mute Series)

**Status:** [x] done

### Intent
`standalone_agent/whisper_adapter.py` already has `record_feedback()` but it is not exposed as an HTTP endpoint. Users who tap **Not useful** or **Mute series** on the Watch/mobile currently have their feedback silently dropped. This sub-task adds two API routes so feedback is recorded and the scheduler respects it.

### Expected Outcomes
- New handler `handle_notification_feedback(body, store)` in `lambda/control_plane.py` accepts `{card_id, calendar_event_id, user_id, action}` where `action` is one of `Read | Save | Not useful | Mute this event series`.
- `WhisperAdapter.record_feedback()` is called to persist the feedback into user preferences.
- For `Mute this event series`, the `series_id` is added to `user_preferences["muted_series"]`; future calls to `calendar_scheduler.schedule_event()` will return `status: "muted"` for that series.
- An audit record is appended.
- New JSON Schema `schemas/websocket/notification_feedback.json` describes the request and response.
- Contract test validates the schema.

### Todo List
- [x] Add `handle_notification_feedback(body, store)` function to `lambda/control_plane.py` following the existing handler pattern (validate required fields, return `{"ok": True}`).
- [x] Call `standalone_agent/whisper_adapter.WhisperAdapter(store=store).record_feedback(user_id, card_id, calendar_event_id, action)` from the new handler.
- [x] For `action == "Mute this event series"`, extract `series_id` from body and append it to `user_preferences["muted_series"]` in the store.
- [x] Route the new handler from the main Lambda dispatcher (the `if/elif` routing block in `control_plane.py`).
- [x] Add JSON Schema `schemas/websocket/notification_feedback.json`.
- [x] Write unit tests in `tests/unit/test_control_plane.py` for the new handler: assert feedback is recorded, muted series is updated, and audit entry appended.
- [x] Write a contract test in `tests/contract/` validating the feedback request/response against the schema.
- [x] Update `mobile/src/services/AuraApiClient.ts` to add a `sendNotificationFeedback(cardId, calendarEventId, action)` method that POSTs to the new endpoint.
- [x] Wire the new method to the mobile UI (handled in Sub-Task 4).

### Relevant Context
- `lambda/control_plane.py` — add new `handle_notification_feedback()` alongside existing handlers; follow the same `body.get(...)` validation pattern.
- `standalone_agent/whisper_adapter.py` — `record_feedback()` and `get_user_preferences()`.
- `standalone_agent/calendar_scheduler.py` — `schedule_event()` already checks `muted_series`; nothing to change here once preferences are updated.
- `schemas/websocket/` — place new schema here.

---

## Sub-Task 4 — Mobile: Meeting Prep Card UI with Action Buttons

**Status:** [x] completed

### Intent
`mobile/src/screens/HomeScreen.tsx` receives a `WatchWhisperCard` from WebSocket but renders nothing useful — there is no card display and no action buttons. This sub-task adds the meeting prep card component with the four actions defined in the plan: **Open**, **Save**, **Not useful**, and **Mute series**.

### Expected Outcomes
- When a `WatchWhisperCard` arrives (via WebSocket or APNs), `HomeScreen` renders a card showing: meeting title, time remaining, prep summary (max 500 chars), and three questions.
- Four action buttons are visible: **Open**, **Save**, **Not useful**, **Mute series**.
- Tapping **Not useful** or **Mute series** calls `AuraApiClient.sendNotificationFeedback()` (from Sub-Task 3) and dismisses the card.
- Tapping **Open** deep-links to the calendar event or shows an expanded detail view.
- Tapping **Save** marks the card as saved in local state.
- Lock-screen privacy is respected: if `card.is_quiet_hours === true`, the card is shown but haptic is suppressed; if the user has set `notificationPreview: 'generic'`, the preview shows "AURA Meeting Prep" rather than the full title.
- All existing TypeScript types pass `npm run typecheck`.

### Todo List
- [x] Create `mobile/src/components/MeetingPrepCard.tsx` — a pure presentational component accepting a `WatchWhisperCard` prop and an `onAction(action: string) => void` callback.
- [x] Render meeting title, start time countdown, prep summary, and three numbered questions within the card.
- [x] Add four `Pressable` action buttons: Open, Save, Not useful, Mute series — matching the style in `FocusControlScreen.tsx`.
- [x] Update `mobile/src/screens/HomeScreen.tsx` to render `<MeetingPrepCard>` / banner navigation when `prepCard` state is non-null; pass an `onAction` handler.
- [x] In the `onAction` handler, call `auraHttp.sendNotificationFeedback(card.card_id, card.calendar_event_id, action)` for Not useful and Mute series; clear `prepCard` state after.
- [x] Add `sendNotificationFeedback` to `mobile/src/services/AuraApiClient.ts` (if not done in Sub-Task 3).
- [x] Suppress haptic relay in `RelayController.relayMeetingPrepToOrbit()` when `card.haptic_enabled === false` or `card.is_quiet_hours === true`.
- [x] Run `npm run typecheck` in `mobile/` and fix all type errors.

### Relevant Context
- `mobile/src/screens/HomeScreen.tsx` — `prepCard` state, `auraWS.registerMessageCallback()` wiring already present.
- `mobile/src/screens/FocusControlScreen.tsx` — copy button and layout style.
- `mobile/src/controllers/RelayController.ts` — `relayMeetingPrepToOrbit()` already checks `haptic_enabled`; no change needed beyond confirming the flag flows from the card.
- `mobile/src/services/AuraApiClient.ts` — `WatchWhisperCard` interface is already typed here.

---

## Sub-Task 5 — Quiet Hours Timezone Fix

**Status:** [x] done

### Intent
`standalone_agent/calendar_scheduler.py` calls `is_in_quiet_hours()` with a POSIX epoch and a user-configured quiet hours dict, but timezone conversion is not validated. A user in "Europe/London" with quiet hours 22:00–07:00 could receive a notification at 21:59 local time because the epoch comparison fails silently. This sub-task makes the calculation timezone-correct and adds tests for edge cases.

### Expected Outcomes
- `is_in_quiet_hours(start_epoch, quiet_hours_config)` converts `start_epoch` to the configured timezone using the standard library `zoneinfo` module before comparing against `start_time` / `end_time`.
- Invalid or unknown timezone strings fall back to UTC and log a warning (using `_log()`).
- DST transitions and midnight-crossing ranges (e.g., 22:00–07:00) are handled correctly.
- Unit tests cover: UTC, named timezone, DST transition, midnight-crossing, invalid timezone, and quiet hours disabled.

### Todo List
- [x] Read the current implementation of `is_in_quiet_hours()` in `standalone_agent/calendar_scheduler.py`.
- [x] Replace the existing time comparison with `zoneinfo.ZoneInfo` (Python 3.9+ stdlib) for correct local time conversion.
- [x] Handle midnight-crossing ranges: if `start_time > end_time` (e.g., 22:00–07:00), treat the window as spanning two calendar days.
- [x] Catch `ZoneInfoNotFoundError` and fall back to UTC; emit a structured warning log.
- [x] Add `zoneinfo` to `standalone_agent/requirements.txt` only if it is not already available (it is stdlib in Python 3.9+, so no entry needed; add `tzdata` for cross-platform support).
- [x] Add unit tests in `tests/unit/test_calendar_scheduler.py` covering the cases described above.

### Relevant Context
- `standalone_agent/calendar_scheduler.py` — `is_in_quiet_hours()`, `schedule_event()`.
- `standalone_agent/requirements.txt` — check if `tzdata` needs to be added.
- AGENTS.md — "Three separate dependency sets ... identify which requirements file to update."

---

## Sub-Task 6 — Safety Guardian SMS Integration

**Status:** [x] done

### Intent
`lambda/control_plane.py` `handle_safety_escalate()` writes an audit record but never actually sends an SMS or push notification to the emergency contact. This sub-task wires a real SNS (or Twilio) send so that approved contacts are notified when the user does not respond to a safety check-in.

### Expected Outcomes
- When `handle_safety_escalate()` runs and the escalation is not rate-limited, it publishes an SMS to the approved contact's phone number via AWS SNS (or a Twilio adapter) using credentials from Secrets Manager.
- Contact phone numbers are never written to logs (existing `_log()` helper must be used; no `print()`).
- If the SMS send fails (provider error), the audit record status is set to `"escalation_failed"` and the error code is logged — no silent failure.
- A 60-second cancel window is tracked via a `pending_escalation` entry in the store; a subsequent `handle_safety_cancel()` call within 60 seconds prevents the send.
- Safety Guardian remains off by default; the escalation handler checks that the user has an active Safety Guardian consent grant before proceeding.
- Unit tests assert: successful send, rate-limited skip, cancelled-within-window, grant missing = blocked, provider error = `escalation_failed` audit.

### Todo List
- [x] Read the current `handle_safety_escalate()` in `lambda/control_plane.py` fully.
- [x] Add a `SlackAdapter`-style `SmsAdapter` class (or reuse an existing adapter pattern from `standalone_agent/`) that wraps `boto3.client("sns").publish()`.
- [x] Add a 60-second pending escalation window: before sending, write `{user_id: {expires_at: now+60}}` to `InMemoryDataStore`; check on next call.
- [x] Add `handle_safety_cancel(body, store)` handler that clears the pending escalation window and appends a `"escalation_cancelled"` audit record.
- [x] Never log the contact phone number; log only the delivery outcome and audit ID.
- [x] Add JSON Schema `schemas/eventbridge/safety_escalation_result.json`.
- [x] Write unit tests in `tests/unit/test_control_plane.py` for all outcomes listed above.
- [x] Add a contract test validating the escalation result schema.

### Relevant Context
- `lambda/control_plane.py` — `handle_safety_escalate()`, `InMemoryDataStore`, `AuditRecord` pattern.
- `standalone_agent/policy_engine.py` — consent grant check pattern to reuse.
- AGENTS.md — "Audit trail is append-only ... Undo creates a new record; it does not mutate the original." Same rule applies to safety records.
- AGENTS.md — "Policy engine is the only execution gate." Safety SMS send must go through a policy check.

---

## Sub-Task 7 — Native Apple Watch App (SwiftUI / watchOS)

**Status:** [x] done

### Intent
The apple_implementation_plan.md specifies a full SwiftUI Watch app. None exists today. This sub-task scaffolds the Watch target with the four key screens: Home, Pre-Meeting Card, Focus Guardian, and Safety Check-In — using fixture data and WatchConnectivity stubs so the UI is testable before the iPhone companion is wired.

### Expected Outcomes
- `apple/AURAWatch/` contains a valid Xcode watchOS app target with SwiftUI.
- Home screen shows: next meeting name, time countdown, Start Focus, I'm distracted buttons — matching the wireframe in plan §4.1.
- Pre-meeting card screen shows: meeting title, tone, prep summary, three questions, Open/Not useful/Mute series buttons.
- Focus Guardian screen shows: session countdown, Deep Work Bank delta, I'm distracted/End Focus buttons, and the approval card (Suggestion/Yes/No/Always ask).
- Safety check-in screen shows: haptic + "Are you okay?" with I'm OK / Call Emergency / Notify Contacts.
- All screens render correctly in Xcode Simulator with fixture data (no live backend required for Phase A).
- A `WatchConnectivityManager.swift` class stub is present and compiles, ready for Sub-Task 8.

### Todo List
- [x] Create `apple/AURAWatch/` directory structure: `App/`, `Views/`, `Models/`, `Services/`.
- [x] Create `AURAWatchApp.swift` entry point with `@main` and a root `ContentView`.
- [x] Create `HomeView.swift` with the wireframe layout from plan §4.1: next meeting label, countdown, Start Focus, and I'm Distracted buttons.
- [x] Create `MeetingPrepView.swift` rendering a `WatchWhisperCard` struct with all fields from plan §4.2.
- [x] Create `FocusGuardianView.swift` with countdown timer, Deep Work Bank delta display, I'm Distracted button, and the approval sub-view from plan §4.3.
- [x] Create `SafetyCheckinView.swift` with the haptic check-in UI from plan §6.3.
- [x] Create `WatchConnectivityManager.swift` as a stub conforming to `WCSessionDelegate` — empty implementations, ready to send/receive messages.
- [x] Create `FixtureData.swift` with sample `WatchWhisperCard` and `FocusSession` instances for Xcode previews.
- [x] Verify the target builds without errors in Xcode (Phase A does not require a physical device).

### Relevant Context
- `apple_implementation_plan.md` §4.1–4.4 — wireframes and UX rules.
- `apple_implementation_plan.md` §8 — Apple platform requirements (WatchConnectivity, UserNotifications entitlements).
- `mobile/src/types/index.ts` — TypeScript definitions to mirror in Swift structs.

---

## Sub-Task 8 — iPhone Companion App (SwiftUI / iOS + WatchConnectivity)

**Status:** [x] done

### Intent
The iPhone companion app is the secure bridge between the Watch and the AURA backend. It handles OAuth sign-in, device binding, calendar selection, encrypted preference storage, and relays Watch commands to the API. This sub-task builds the iPhone target and wires real WatchConnectivity message passing to the Watch app from Sub-Task 7.

### Expected Outcomes
- `apple/AURAiPhone/` contains a valid Xcode iOS app target.
- OAuth 2.0 PKCE sign-in screen completes the auth flow and stores the access token in the iOS Secure Enclave / Keychain.
- `WatchConnectivityManager` on the iPhone side sends and receives the six command types from plan §5.2: `focus.start`, `focus.stop`, `distraction.reported`, `brief.feedback`, `sos.ok`, `sos.escalate`.
- Each received Watch command is forwarded to the AURA backend via HTTPS using the stored OAuth token.
- Calendar selection screen (read-only list of connected calendars; toggling opt-in status).
- Device binding is registered with the backend on first launch; a new binding revokes the old one (plan §7.1).
- Audit timeline screen displays the last 20 audit records returned by the backend.
- All network calls use TLS 1.3; no raw health, meeting content, or OAuth tokens appear in any log.

### Todo List
- [x] Create `apple/AURAiPhone/` directory structure: `App/`, `Views/`, `Models/`, `Services/`, `Auth/`.
- [x] Create `AURAiPhoneApp.swift` entry point and root navigation.
- [x] Create `AuthService.swift` implementing OAuth 2.0 PKCE using `ASWebAuthenticationSession`; store tokens in Keychain.
- [x] Create `AuraApiService.swift` with methods mirroring `mobile/src/services/AuraApiClient.ts`: `registerDevice()`, `startFocusSession()`, `reportDistracted()`, `undoLastAction()`, `sendNotificationFeedback()`, `getAuditRecords()`.
- [x] Implement `WatchConnectivityManager.swift` (replace stub from Sub-Task 7) with real `sendMessage(_:replyHandler:errorHandler:)` calls for each of the six command types.
- [x] Create `CalendarSelectionView.swift` for opt-in calendar toggling.
- [x] Create `AuditTimelineView.swift` showing the last 20 records.
- [x] Create `DeviceBindingService.swift` that registers the device on first launch and revokes old bindings per plan §7.1.
- [x] Verify both iPhone and Watch targets build together in the same Xcode workspace.

### Relevant Context
- `apple_implementation_plan.md` §3, §5.1, §5.2, §7.1, §7.2 — architecture and security requirements.
- `mobile/src/auth/AuthService.ts` — OAuth PKCE flow to port to Swift.
- `mobile/src/services/AuraApiClient.ts` — API method signatures to mirror.
- `apple/AURAWatch/Services/WatchConnectivityManager.swift` — stub from Sub-Task 7.

---

## Sub-Task 9 — Safety Guardian: Health Signals (Apple Watch HealthKit Events + AURA Orbit PPG)

**Status:** [x] done

### Intent
AURA supports safety check-ins on two hardware paths that work fundamentally differently and must never be confused:

**Path A — Apple Watch:** Apple's own watchOS algorithms run continuously inside the chip and fire a single pre-classified `HKCategoryType` event (e.g. `highHeartRateEvent`) when something notable happens. AURA subscribes to that pre-classified event label only — it never reads raw heart rate numbers, never runs its own health algorithm, and never does continuous monitoring. Apple does the analysis; AURA just reacts to the result.

**Path B — AURA Orbit:** The optional MAX86141 PPG sensor on Orbit reads raw optical signals. Because raw PPG has no medical classification, AURA treats it only as a wellness signal and applies a simple threshold (resting HR notably above/below the user's personal baseline, sampled at 25 Hz for 45-second spot checks). The PPG sensor is powered off by default and powers on only when a Focus Session is `"active"`. This is a hardware-enforced rule documented in `AURA_ORBIT_HARDWARE_DOCS.md` §11: the PPG draws 3.2 mA and is budgeted only for 5 minutes of daily use. No continuous monitoring. No AI watching in the background. No medical claim.

Both paths end at the same place: a haptic tap, an "Are you okay?" prompt on screen, and a user-driven escalation flow. Neither path calls emergency services automatically.

### Expected Outcomes

**Apple Watch path:**
- `HealthKitService.swift` requests HealthKit authorization for pre-classified event types only: `HKCategoryTypeIdentifier.highHeartRateEvent`, `HKCategoryTypeIdentifier.lowHeartRateEvent`, `HKCategoryTypeIdentifier.irregularHeartRhythmEvent`, and fall-related types where entitlement permits. It does NOT request `HKQuantityTypeIdentifier.heartRate` (raw BPM samples) — that would imply continuous monitoring.
- Background delivery is registered using `HKHealthStore.enableBackgroundDelivery(for:frequency:withCompletion:)` for the pre-classified event types only.
- On receiving a pre-classified event, the app fires `SafetyCheckinView` with a haptic and "Are you okay?" — regardless of whether a focus session is active, because Apple fires these events based on its own criteria.
- Safety Guardian is off by default; HealthKit authorization is requested only when the user explicitly enables it in settings.

**AURA Orbit path:**
- The BLE firmware event `EVT_SAFETY_TIMEOUT` (byte `0x10`, already defined in `mobile/README.md`) is emitted by Orbit firmware only when the PPG wellness check fires during an active focus session.
- `RelayController.handleSafetyTimeout()` (already implemented in `mobile/src/controllers/RelayController.ts`) handles this event on the mobile side.
- No new sensor polling is added to the mobile app — the firmware gates the PPG; the app only reacts to the BLE event.
- The mobile app shows the same "Are you okay?" safety check-in UI when `EVT_SAFETY_TIMEOUT` arrives.

**Shared outcomes (both paths):**
- If the user does not respond within the configured timeout (default 30 seconds, set in `SafetySettings.timeoutThresholdMinutes`), the app calls `handle_safety_escalate()` on the backend via the iPhone companion.
- The check-in UI always shows the exact disclaimer from `apple_implementation_plan.md` §6.1: *"Safety Guardian is an opt-in check-in service... It is not a medical device, does not diagnose emergencies, and does not replace Emergency SOS."*
- Stored data is `event_category + timestamp + delivery_outcome` only. No raw heart rate samples, no continuous telemetry, ever.
- Safety Guardian is off by default on both hardware paths.
- Unit tests simulate both paths using mock observers and mock BLE events.

### Todo List

**Apple Watch — HealthKit event subscription:**
- [x] Create `apple/AURAWatch/Services/HealthKitService.swift` requesting authorization for pre-classified event category types only (NOT raw `heartRate` quantity type).
- [x] Implement `enableBackgroundDelivery()` for the pre-classified event types.
- [x] Implement an `HKObserverQuery` that fires `SafetyCheckinView` on event delivery.
- [x] Add exact disclaimer strings from `apple_implementation_plan.md` §6.1 to `SafetyCheckinView` and all related UI; add a visible label "Powered by Apple HealthKit — not a medical device."
- [x] Add HealthKit entitlement keys and purpose strings to `Info.plist`; purpose string must state wellness check-in use only, not medical monitoring.
- [x] Wire the countdown timer in `SafetyCheckinView`; on expiry call the iPhone companion to escalate via `handle_safety_escalate()`.
- [x] Write unit tests with mock `HKObserverQuery` to verify the check-in fires, the "I'm OK" path clears the escalation, and the no-response path triggers escalation.

**AURA Orbit — BLE wellness event:**
- [x] Confirm `mobile/src/controllers/RelayController.ts` `handleSafetyTimeout()` shows the same "Are you okay?" UI used by the Apple Watch path (unify into a single `showSafetyCheckin()` function to avoid duplication).
- [x] Confirm the BLE `EVT_SAFETY_TIMEOUT` event is only ever emitted by Orbit firmware during an active focus session — document this constraint in `firmware/README.md` as a firmware contract.
- [x] Add a unit test in `tests/unit/` asserting that `handleSafetyTimeout()` calls `handle_safety_escalate()` after the configured timeout and that a timely "I'm OK" response calls `handle_safety_cancel()`.

**Both paths — no raw data rule:**
- [x] Add a guard in `RelayController.ts` and `HealthKitService.swift`: if any payload contains raw continuous heart rate samples, log a warning and discard — do not relay to backend.
- [x] Assert in contract tests that the safety escalation schema (`schemas/eventbridge/safety_escalation_result.json`) has no field for raw BPM values.

### Relevant Context
- `AURA_ORBIT_HARDWARE_DOCS.md` §10, §11 — PPG sensor is optional, session-only, wellness-only; regulatory boundary notice.
- `aura_wearable_hardware_design.md` §8 — safety and health boundaries; wellness baseline only, no autonomous emergency calls.
- `apple_implementation_plan.md` §6.1–6.4 — exact disclaimer language, HealthKit inputs (pre-classified events only), escalation flow, emergency SOS handoff rules.
- `mobile/src/controllers/RelayController.ts` — `handleSafetyTimeout()` already implemented for the Orbit BLE path.
- `mobile/README.md` — BLE command byte `0x10` = `EVT_SAFETY_TIMEOUT`; Orbit → Phone direction.
- `mobile/src/stores/SafetySettingsStore.ts` — `timeoutThresholdMinutes` is the user-configurable escalation delay.
- `apple/AURAWatch/Views/SafetyCheckinView.swift` — created in Sub-Task 7.
- `lambda/control_plane.py` `handle_safety_escalate()` and `handle_safety_cancel()` — wired in Sub-Task 6.
- AGENTS.md — policy engine is the only execution gate; escalation call must return `policy_required: True`.

---

## Execution Order

## Sub-Task 10 — User Preferences Screen (Mobile + iPhone Companion)

**Status:** [x] done

### Intent
The backend already stores a `user_preferences` object (in `whisper_adapter.py`) with fields for `pre_meeting_enabled`, `muted_series`, `quiet_hours`, notification preview mode, focus action scope, Slack status, and Safety Guardian. However, there is no UI anywhere that lets the user read or change these values. This sub-task adds a full Preferences screen to both the React Native mobile app and the native iPhone companion app so users can control every notification and consent preference in one place.

### Expected Outcomes
- A new `NotificationPreferencesScreen` in the React Native app exposes all six preference rows from the plan (see table below).
- A matching `PreferencesView.swift` in the iPhone companion app (Sub-Task 8) mirrors the same controls natively.
- Changes made on either surface are written to the backend via `PATCH /api/v1/preferences` and immediately respected by the scheduler and policy engine.
- Safety-sensitive settings (Safety Guardian toggle, emergency contacts, SOS location) remain stored in the device secure enclave via `SafetySettingsStore.ts` / iOS Keychain — they are never sent to the backend in plaintext.
- Every preference defaults to the most private/conservative value (meeting brief = Off, notification preview = Generic, focus actions = Ask every time, Slack = Off, Safety Guardian = Off, location = Ask each time).
- A backend handler `handle_update_preferences(body, store)` in `control_plane.py` accepts and persists the non-sensitive preferences.
- All existing tests continue to pass.

### Preference Rows

| Preference | Control type | Choices | Default |
|---|---|---|---|
| Meeting brief | Toggle + calendar picker | Off / selected calendars / all selected meetings | Off |
| Watch notification preview | Segmented picker | Generic / Private context | Generic |
| Focus actions | Segmented picker | Ask every time / This session / Never | Ask every time |
| Slack status | Toggle + channel picker | Off / Selected channel with preview | Off |
| Safety Guardian | Toggle (links to SafetySettingsScreen) | Off / Warning check-in + contacts | Off |
| Location in SOS | Segmented picker | Off / Ask each time / Approved contacts only | Ask each time |

### Todo List
- [x] Add `handle_update_preferences(body, store)` to `lambda/control_plane.py`; accept `{user_id, preferences: {...}}` and merge into `WhisperAdapter.user_preferences`; validate that only known keys are accepted (allowlist pattern).
- [x] Add `GET /api/v1/preferences` handler `handle_get_preferences(body, store)` that returns the current preference profile for the user (never returns phone numbers or OAuth tokens).
- [x] Add JSON Schema `schemas/websocket/user_preferences.json` covering all preference fields and their allowed values.
- [x] Add unit tests in `tests/unit/test_control_plane.py` for get and update handlers: assert unknown keys are rejected, defaults are returned for new users, and sensitive fields (contacts, phone numbers) are never in the response.
- [x] Add a contract test in `tests/contract/` validating the preferences response against the schema.
- [x] Add `getPreferences()` and `updatePreferences(patch)` methods to `mobile/src/services/AuraApiClient.ts`.
- [x] Add `UserPreferences` TypeScript interface to `mobile/src/types/index.ts` with all six preference fields typed strictly.
- [x] Create `mobile/src/stores/NotificationPreferencesStore.ts` — a thin wrapper around `AuraApiClient.getPreferences()` / `updatePreferences()` with an in-memory cache and optimistic update pattern (same style as `SafetySettingsStore.ts`).
- [x] Create `mobile/src/screens/NotificationPreferencesScreen.tsx` rendering all six preference rows as described in the table above; use `Switch`, segmented `Pressable` rows, and a calendar multi-select for the meeting brief row.
- [x] Add `NotificationPreferences` to `RootStackParamList` in `mobile/src/types/index.ts` and register the screen in `mobile/App.tsx`.
- [x] Add a **Preferences** navigation button on `HomeScreen.tsx` so users can reach the new screen.
- [x] Create `apple/AURAiPhone/Views/PreferencesView.swift` in the iPhone companion app (Sub-Task 8 dependency); wire each row to `AuraApiService.updatePreferences()`.
- [x] Ensure the Safety Guardian row on both screens navigates to the existing `SafetySettingsScreen` / `SafetySettingsView` rather than duplicating that logic.
- [x] Run `npm run typecheck` in `mobile/` and fix all type errors before marking done.

### Relevant Context
- `standalone_agent/whisper_adapter.py` — `get_user_preferences()` and `record_feedback()`; the `user_preferences` dict schema is the source of truth for field names.
- `standalone_agent/calendar_scheduler.py` — `schedule_event()` reads `pre_meeting_enabled`, `muted_series`, `quiet_hours` from the preferences dict; changes here are immediately respected.
- `mobile/src/stores/SafetySettingsStore.ts` — pattern to follow for the new `NotificationPreferencesStore.ts`; secure enclave storage for sensitive fields.
- `mobile/src/screens/SafetySettingsScreen.tsx` — existing settings screen to link to (not replace) for the Safety Guardian row.
- `lambda/control_plane.py` — add new handlers alongside existing `handle_focus_signal`, `handle_focus_session`, etc.
- `apple_implementation_plan.md` §4.5 — the exact six preference rows and their defaults.
- AGENTS.md — "Policy engine is the only execution gate." Preference changes that affect consent grants (e.g. disabling pre_meeting_enabled) must invalidate the corresponding grant in `PolicyEngine.grants`.

---

## Execution Order

Sub-tasks are ordered so that backend work (1–6) can be done first and is fully testable without Apple hardware. Native app work (7–9) can proceed in parallel once Sub-Tasks 1 and 3 are complete. Sub-Task 10 depends on Sub-Task 3 (feedback API) for the backend pattern and Sub-Task 8 (iPhone companion) for the native UI.

```
[1] APNs/FCM Delivery Lambda
[2] Bedrock Adapter Wiring
[3] Notification Feedback API
    ↓
[4] Mobile Card UI (depends on 3)
[5] Quiet Hours Timezone Fix (independent)
[6] Safety Guardian SMS (independent)
    ↓
[7] Watch App SwiftUI (depends on 1, 3)
    ↓
[8] iPhone Companion + WatchConnectivity (depends on 7)
    ↓
[9] HealthKit Safety Guardian (depends on 7, 8, 6)
[10] User Preferences Screen (depends on 3, 8)
```

---

*Plan author: AURA Project*
*All implementation must pass `python3 -m pytest` (ignoring known boto3-missing tests) and `npm run typecheck` in `mobile/` before any sub-task is marked done.*
