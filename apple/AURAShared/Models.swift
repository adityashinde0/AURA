// AURAShared/Models.swift
// Shared data models used by both AURAWatch and AURACompanion targets.
// Conforms to the relay_envelope.json schema and the WatchConnectivity command set.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import Foundation

// ---------------------------------------------------------------------------
// MARK: - Command types
// ---------------------------------------------------------------------------

/// All commands that may travel from Watch → iPhone → backend.
public enum CommandType: String, Codable, Sendable {
    case focusStart              = "focus.start"
    case focusStop               = "focus.stop"
    case distractionReported     = "distraction.reported"
    case briefFeedback           = "brief.feedback"
    case sosOK                   = "sos.ok"
    case sosEscalate             = "sos.escalate"
    case userIntent              = "user.intent"
    case applyRoutine            = "routine.apply"
    case undoRoutine             = "routine.undo"
}

/// Feedback choices from the pre-meeting brief card.
public enum BriefFeedbackKind: String, Codable, Sendable {
    case open       = "open"
    case notUseful  = "not_useful"
    case muteSeries = "mute_series"
}

/// Focus-distraction suggested response kinds returned by the policy service.
public enum DistractionResponseKind: String, Codable, Sendable {
    case nudge                   = "nudge"
    case openPhoneFocusSettings  = "open_phone_focus_settings"
    case requestPause            = "request_pause"
}

// ---------------------------------------------------------------------------
// MARK: - Command envelope  (Watch → iPhone → backend)
// ---------------------------------------------------------------------------

/// A small, encrypted command envelope forwarded over WatchConnectivity and
/// then over HTTPS to the AURA API Gateway.
///
/// Maps to the `relay_envelope.json` schema with `event_type = "focus_signal"`.
public struct CommandEnvelope: Codable, Sendable {
    /// Which action the user triggered.
    public let commandType: CommandType
    /// UUIDv4 idempotency key generated at the Watch.
    public let commandID: String
    /// ISO-8601 UTC timestamp of the user action.
    public let issuedAt: Date
    /// Optional additional context (e.g. `distractionResponse` choice).
    public let payload: [String: String]?

    public init(
        commandType: CommandType,
        commandID: String = UUID().uuidString,
        issuedAt: Date = Date(),
        payload: [String: String]? = nil
    ) {
        self.commandType = commandType
        self.commandID   = commandID
        self.issuedAt    = issuedAt
        self.payload     = payload
    }

    /// Serialise to a `[String: Any]` dictionary for use with
    /// `WCSession.sendMessage(_:replyHandler:errorHandler:)` or `transferUserInfo(_:)`.
    public func wcPayload() throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(self)
        guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw EncodingError.invalidValue(
                self,
                EncodingError.Context(codingPath: [], debugDescription: "WC serialisation failed")
            )
        }
        return dict
    }
}

// ---------------------------------------------------------------------------
// MARK: - Pre-meeting card  (backend → APNs → Watch)
// ---------------------------------------------------------------------------

/// A purpose-limited T-5 meeting briefing card (≤ 70 words of context).
/// Contains no raw transcript or unredacted PII.
public struct PreMeetingCard: Codable, Identifiable, Sendable {
    /// Opaque server-assigned card ID.
    public let id: String
    /// Human-readable event title, e.g. "Design Review".
    public let title: String
    /// Minutes until the meeting starts.
    public let startsInMinutes: Int
    /// One-sentence last-decision summary (≤ 20 words, redacted by policy service).
    public let lastDecision: String
    /// Tone keyword, e.g. "confident", "diplomatic".
    public let tone: String
    /// Exactly three strategic questions (never raw transcript).
    public let questions: [String]
    /// Opaque event-series ID used for `Mute Series` feedback.
    public let seriesID: String

    public init(
        id: String,
        title: String,
        startsInMinutes: Int,
        lastDecision: String,
        tone: String,
        questions: [String],
        seriesID: String
    ) {
        self.id              = id
        self.title           = title
        self.startsInMinutes = startsInMinutes
        self.lastDecision    = lastDecision
        self.tone            = tone
        self.questions       = questions
        self.seriesID        = seriesID
    }
}

// ---------------------------------------------------------------------------
// MARK: - Focus session state  (backend → iPhone → Watch)
// ---------------------------------------------------------------------------

/// Live state pushed from the iPhone to the Watch while a focus session runs.
public struct FocusState: Codable, Sendable {
    /// Whether a focus session is currently active.
    public let isActive: Bool
    /// Seconds remaining in the focus block; `nil` when not active.
    public let secondsRemaining: Int?
    /// Cumulative "deep-work bank" points for the current session.
    public let deepWorkPoints: Int
    /// Last distraction response suggested by the policy service.
    public let lastDistractionResponse: DistractionResponseKind?

    public init(
        isActive: Bool,
        secondsRemaining: Int? = nil,
        deepWorkPoints: Int = 0,
        lastDistractionResponse: DistractionResponseKind? = nil
    ) {
        self.isActive                = isActive
        self.secondsRemaining        = secondsRemaining
        self.deepWorkPoints          = deepWorkPoints
        self.lastDistractionResponse = lastDistractionResponse
    }

    /// Sensible default before any backend data arrives.
    public static let idle = FocusState(isActive: false, deepWorkPoints: 0)
}

// ---------------------------------------------------------------------------
// MARK: - Safety settings  (stored in iPhone Keychain / App Group UserDefaults)
// ---------------------------------------------------------------------------

/// User-controlled Safety Guardian preferences.
/// Stored securely on-device; never sent to any AI model or Slack.
public struct SafetySettings: Codable, Sendable {
    /// Whether Safety Guardian is active. Default: `false`.
    public var isEnabled: Bool
    /// Seconds before a non-response escalates to approved contacts. Default: 30.
    public var checkInTimeoutSeconds: Int
    /// Share last-known location with approved contacts on escalation.
    /// Requires explicit location permission AND per-contact consent.
    public var shareLocationWithContacts: Bool
    /// Pre-approved contact identifiers (opaque, resolved server-side).
    /// Never stored in application logs or sent to Slack.
    public var approvedContactIDs: [String]

    public init(
        isEnabled: Bool = false,
        checkInTimeoutSeconds: Int = 30,
        shareLocationWithContacts: Bool = false,
        approvedContactIDs: [String] = []
    ) {
        self.isEnabled                 = isEnabled
        self.checkInTimeoutSeconds     = checkInTimeoutSeconds
        self.shareLocationWithContacts = shareLocationWithContacts
        self.approvedContactIDs        = approvedContactIDs
    }

    public static let defaultSettings = SafetySettings()
}

// ---------------------------------------------------------------------------
// MARK: - Notification privacy level
// ---------------------------------------------------------------------------

/// Controls whether Watch notification previews include context or stay generic.
public enum NotificationPrivacyLevel: String, Codable, CaseIterable, Sendable {
    /// Shows only "AURA notification" on the lock screen.
    case generic        = "generic"
    /// Shows meeting title, tone, and questions on the lock screen.
    case privateContext = "private_context"
}

// ---------------------------------------------------------------------------
// MARK: - Relay envelope  (iPhone → AURA API Gateway)
// ---------------------------------------------------------------------------

/// HTTP request body sent from AURACompanion to the AURA API Gateway.
/// Matches every required field in the `schemas/websocket/relay_envelope.json` schema.
public struct RelayEnvelope: Codable, Sendable {

    // Fixed per schema
    public let action: String           // always "relay"
    public let eventID: String          // UUIDv4
    public let eventType: RelayEventType
    public let timestamp: TimeInterval  // Unix epoch seconds
    public let userID: String
    public let sessionID: String?
    /// Fixed source tag so the backend can identify Apple Watch origin.
    public let source: String           // "aura_watch"
    public let signalPayload: SignalPayload?

// MARK: Nested types

    public enum RelayEventType: String, Codable, Sendable {
        case focusSignal = "focus_signal"
    }

    public struct SignalPayload: Codable, Sendable {
        public let explicitSignal: ExplicitSignal
        public let app: String?
        public let userIntent: String?
        public let connectedDevices: [String]?

        public enum ExplicitSignal: String, Codable, Sendable {
            case none                 = "none"
            case selfReportDistracted = "self_report_distracted"
            case focusStarted         = "focus_started"
        }

        public init(
            explicitSignal: ExplicitSignal = .none,
            app: String? = nil,
            userIntent: String? = nil,
            connectedDevices: [String]? = nil
        ) {
            self.explicitSignal    = explicitSignal
            self.app               = app
            self.userIntent        = userIntent
            self.connectedDevices  = connectedDevices
        }

        private enum CodingKeys: String, CodingKey {
            case explicitSignal   = "explicit_signal"
            case app
            case userIntent       = "user_intent"
            case connectedDevices = "connected_devices"
        }
    }

    // MARK: Init

    public init(
        eventID: String = UUID().uuidString,
        eventType: RelayEventType,
        userID: String,
        sessionID: String? = nil,
        signalPayload: SignalPayload? = nil
    ) {
        self.action        = "relay"
        self.eventID       = eventID
        self.eventType     = eventType
        self.timestamp     = Date().timeIntervalSince1970
        self.userID        = userID
        self.sessionID     = sessionID
        self.source        = "aura_watch"
        self.signalPayload = signalPayload
    }

    private enum CodingKeys: String, CodingKey {
        case action, timestamp, source
        case eventID       = "event_id"
        case eventType     = "event_type"
        case userID        = "user_id"
        case sessionID     = "session_id"
        case signalPayload = "signal_payload"
    }
}

// ---------------------------------------------------------------------------
// MARK: - Adaptive Intent Routine Models (watchOS ↔ iOS ↔ Backend)
// ---------------------------------------------------------------------------

/// Device action recommendation within an adaptive intent routine.
public struct RoutineDeviceAction: Codable, Sendable, Identifiable {
    public var id: String { "\(device):\(action)" }
    public let device: String
    public let action: String
    public let description: String?

    public init(device: String, action: String, description: String? = nil) {
        self.device = device
        self.action = action
        self.description = description
    }
}

/// Adaptive routine payload for companion synchronization.
public struct IntentRoutinePayload: Codable, Sendable, Identifiable {
    public var id: String { routineID ?? intent }
    public let routineID: String?
    public let intent: String
    public let recommendedAction: String
    public let deviceActions: [RoutineDeviceAction]
    public let rememberRoutine: Bool
    public let undoToken: String?
    public let emotionTone: String?

    public init(
        routineID: String? = nil,
        intent: String,
        recommendedAction: String = "request_pause",
        deviceActions: [RoutineDeviceAction] = [],
        rememberRoutine: Bool = false,
        undoToken: String? = nil,
        emotionTone: String? = "calm"
    ) {
        self.routineID         = routineID
        self.intent            = intent
        self.recommendedAction = recommendedAction
        self.deviceActions     = deviceActions
        self.rememberRoutine   = rememberRoutine
        self.undoToken         = undoToken
        self.emotionTone       = emotionTone
    }

    private enum CodingKeys: String, CodingKey {
        case routineID         = "routine_id"
        case intent
        case recommendedAction = "recommended_action"
        case deviceActions     = "device_actions"
        case rememberRoutine   = "remember_routine"
        case undoToken         = "undo_token"
        case emotionTone       = "emotion_tone"
    }
}
