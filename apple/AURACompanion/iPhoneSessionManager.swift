// AURACompanion/iPhoneSessionManager.swift
// WatchConnectivity bridge on the iPhone side.
//
// Responsibilities:
//   • Activates WCSession.
//   • Receives CommandEnvelopes from the Apple Watch.
//   • Translates commands into RelayEnvelopes and forwards them to the AURA
//     API Gateway via AuraAPIClient.
//   • Pushes FocusState and PreMeetingCard updates back to the Watch.
//   • Registers and refreshes the APNs device token.
//
// Security:
//   • OAuth access token is kept in Keychain; only passed in Authorization
//     headers over TLS 1.3 — never logged or sent via WCSession.
//   • WCSession payloads contain minimum state; no raw health data.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import Foundation
import WatchConnectivity
import UIKit

@MainActor
public final class iPhoneSessionManager: NSObject, ObservableObject {

    // MARK: - Singleton

    public static let shared = iPhoneSessionManager()

    // MARK: - Dependencies

    private let apiClient: AuraAPIClient
    private let session: WCSession

    // MARK: - Published state

    /// Current signed-in user ID (set after OAuth completes).
    @Published public var userID: String? = nil
    /// Current active session ID from the backend.
    @Published public var sessionID: String? = nil
    /// Most recent focus state pushed from the backend.
    @Published public private(set) var focusState: FocusState = .idle
    /// APNs device token (hex string, registered with backend after OAuth).
    @Published public private(set) var apnsToken: String? = nil

    // MARK: - Init

    private init(apiClient: AuraAPIClient = .shared) {
        self.apiClient = apiClient
        self.session   = .default
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    // MARK: - APNs registration

    /// Call from AppDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)
    public func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        apnsToken = tokenString

        guard let userID, let sessionID else { return }

        Task {
            await apiClient.registerAPNsToken(
                token: tokenString,
                userID: userID,
                sessionID: sessionID
            )
        }
    }

    // MARK: - Push to Watch

    /// Sends the latest FocusState to the Watch.
    public func pushFocusState(_ state: FocusState) {
        focusState = state
        guard session.activationState == .activated else { return }

        do {
            let encoder = JSONEncoder()
            let data    = try encoder.encode(state)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

            let payload: [String: Any] = ["focusState": dict]

            if session.isReachable {
                session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            } else {
                session.transferUserInfo(payload)
            }
        } catch {
            // Encode error is a programmer mistake; log structured event only.
            debugLog(event: "push_focus_state_failed", error: error)
        }
    }

    /// Sends a PreMeetingCard to the Watch (called when backend APNs arrives).
    public func pushMeetingCard(_ card: PreMeetingCard) {
        guard session.activationState == .activated else { return }

        do {
            let encoder = JSONEncoder()
            let data    = try encoder.encode(card)
            guard let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

            let payload: [String: Any] = ["meetingCard": dict]

            if session.isReachable {
                session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            } else {
                session.transferUserInfo(payload)
            }
        } catch {
            debugLog(event: "push_meeting_card_failed", error: error)
        }
    }

    // MARK: - Command routing

    private func handleWatchCommand(_ payload: [String: Any]) {
        guard
            let uid = userID,
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let envelope = try? {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                return try decoder.decode(CommandEnvelope.self, from: data)
            }()
        else {
            debugLog(event: "invalid_watch_command")
            return
        }

        Task {
            await relay(envelope: envelope, userID: uid)
        }
    }

    private func relay(envelope: CommandEnvelope, userID: String) async {
        // Map the Watch command type to the schema's explicit_signal.
        let signal: RelayEnvelope.SignalPayload.ExplicitSignal
        switch envelope.commandType {
        case .focusStart:
            signal = .focusStarted
        case .distractionReported:
            signal = .selfReportDistracted
        default:
            signal = .none
        }

        let relayEnvelope = RelayEnvelope(
            eventType: .focusSignal,
            userID: userID,
            sessionID: sessionID,
            signalPayload: RelayEnvelope.SignalPayload(
                explicitSignal: signal,
                app: nil
            )
        )

        do {
            let response = try await apiClient.relay(envelope: relayEnvelope)
            // Process backend response (e.g. updated FocusState).
            if let updatedState = response.focusState {
                await MainActor.run { self.pushFocusState(updatedState) }
            }
        } catch {
            debugLog(event: "relay_failed", error: error)
        }
    }

    // MARK: - Structured log helper

    private func debugLog(event: String, error: Error? = nil) {
        var fields: [String: String] = [
            "service": "iPhoneSessionManager",
            "event": event
        ]
        if let error {
            fields["error"] = error.localizedDescription
        }
        // Build a minimal JSON line; no raw health data, no tokens, no meeting content.
        let pairs = fields.map { "\"\($0.key)\":\"\($0.value)\"" }.joined(separator: ",")
        print("{\(pairs)}")
    }
}

// MARK: - WCSessionDelegate

extension iPhoneSessionManager: WCSessionDelegate {

    public nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if let error {
            Task { @MainActor in self.debugLog(event: "wc_activation_failed", error: error) }
        }
    }

    public nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    public nonisolated func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate after Watch pairing change.
        session.activate()
    }

    /// Receives immediate commands from the Watch.
    public nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        Task { @MainActor in
            self.handleWatchCommand(message)
        }
    }

    /// Receives queued transferUserInfo deliveries.
    public nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:]
    ) {
        Task { @MainActor in
            self.handleWatchCommand(userInfo)
        }
    }
}

// MARK: - Backend response model (internal)

/// Minimal shape of the backend response after a relay call.
/// Only the fields the app uses are decoded; extra fields are ignored.
struct BackendRelayResponse: Decodable {
    let focusState: FocusState?

    private enum CodingKeys: String, CodingKey {
        case focusState = "focus_state"
    }
}

// AuraAPIClient relay response convenience
extension AuraAPIClient {
    func relay(envelope: RelayEnvelope) async throws -> BackendRelayResponse {
        try await postRelay(envelope: envelope)
    }
}
