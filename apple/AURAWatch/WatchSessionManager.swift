// AURAWatch/WatchSessionManager.swift
// Manages the WatchConnectivity session on the Watch side.
//
// Responsibilities:
//   • Activates WCSession on app launch.
//   • Sends CommandEnvelopes to the paired iPhone via sendMessage (when reachable)
//     or transferUserInfo (offline queuing for guaranteed delivery).
//   • Receives FocusState and PreMeetingCard pushes from the iPhone and publishes
//     them to SwiftUI views via @Published properties.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import Foundation
import WatchConnectivity
import Combine

@MainActor
public final class WatchSessionManager: NSObject, ObservableObject {

    // MARK: - Singleton

    public static let shared = WatchSessionManager()

    // MARK: - Published state

    /// Current focus session state received from the iPhone.
    @Published public private(set) var focusState: FocusState = .idle

    /// Incoming pre-meeting card pushed by the iPhone (nil when none active).
    @Published public private(set) var pendingMeetingCard: PreMeetingCard? = nil

    /// Whether the paired iPhone is currently reachable.
    @Published public private(set) var isPhoneReachable: Bool = false

    // MARK: - Private

    private let session: WCSession

    private override init() {
        self.session = .default
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
    }

    // MARK: - Public command API

    /// Send a command envelope to the paired iPhone.
    ///
    /// Uses `sendMessage` when the iPhone is reachable for immediate delivery;
    /// falls back to `transferUserInfo` which guarantees delivery even when the
    /// iPhone is unreachable or the Watch loses connectivity.
    public func send(_ command: CommandEnvelope) {
        guard WCSession.isSupported() else { return }

        do {
            let payload = try command.wcPayload()

            if session.isReachable {
                session.sendMessage(payload, replyHandler: nil) { [weak self] error in
                    // Reachable send failed — fall back to queued transfer.
                    self?.queueTransfer(payload)
                }
            } else {
                queueTransfer(payload)
            }
        } catch {
            // Encoding error is a programmer mistake; log via structured output.
            print(#"{"level":"error","service":"WatchSessionManager","event":"encode_failed","error":"\#(error.localizedDescription)"}"#)
        }
    }

    /// Convenience: fire-and-forget focus start command.
    public func sendFocusStart(durationSeconds: Int) {
        let payload: [String: String] = ["durationSeconds": String(durationSeconds)]
        send(CommandEnvelope(commandType: .focusStart, payload: payload))
    }

    /// Convenience: fire-and-forget focus stop command.
    public func sendFocusStop() {
        send(CommandEnvelope(commandType: .focusStop))
    }

    /// Convenience: report a distraction.
    public func sendDistractionReported() {
        send(CommandEnvelope(commandType: .distractionReported))
    }

    /// Convenience: SOS check-in acknowledged by user.
    public func sendSOSOK() {
        send(CommandEnvelope(commandType: .sosOK))
    }

    /// Convenience: SOS escalation triggered.
    public func sendSOSEscalate() {
        send(CommandEnvelope(commandType: .sosEscalate))
    }

    /// Convenience: brief feedback (open / not useful / mute series).
    public func sendBriefFeedback(kind: BriefFeedbackKind, seriesID: String) {
        let payload: [String: String] = [
            "feedbackKind": kind.rawValue,
            "seriesID": seriesID
        ]
        send(CommandEnvelope(commandType: .briefFeedback, payload: payload))
    }

    // MARK: - Private helpers

    private func queueTransfer(_ payload: [String: Any]) {
        guard session.activationState == .activated else { return }
        session.transferUserInfo(payload)
    }

    private func handleIncomingMessage(_ message: [String: Any]) {
        if let focusData = try? JSONSerialization.data(withJSONObject: message["focusState"] as Any),
           let state = try? JSONDecoder().decode(FocusState.self, from: focusData) {
            self.focusState = state
        }
        if let cardData = try? JSONSerialization.data(withJSONObject: message["meetingCard"] as Any),
           let card = try? JSONDecoder().decode(PreMeetingCard.self, from: cardData) {
            self.pendingMeetingCard = card
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {

    public nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isPhoneReachable = reachable
        }
        if let error {
            print(#"{"level":"error","service":"WatchSessionManager","event":"activation_failed","error":"\#(error.localizedDescription)"}"#)
        }
    }

    public nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isPhoneReachable = reachable
        }
    }

    /// Receives immediate messages from the iPhone (when both sides are foreground-active).
    public nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any]
    ) {
        Task { @MainActor in
            self.handleIncomingMessage(message)
        }
    }

    /// Receives queued `transferUserInfo` payloads.
    public nonisolated func session(
        _ session: WCSession,
        didReceiveUserInfo userInfo: [String: Any] = [:]
    ) {
        Task { @MainActor in
            self.handleIncomingMessage(userInfo)
        }
    }
}
