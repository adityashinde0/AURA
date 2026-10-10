// apple/AURAiPhone/Services/WatchConnectivityManager.swift
import Foundation
import WatchConnectivity
import Combine

@MainActor
public final class iPhoneWatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    public static let shared = iPhoneWatchConnectivityManager()

    @Published public private(set) var isWatchPaired: Bool = false
    @Published public private(set) var isWatchAppInstalled: Bool = false
    @Published public private(set) var isReachable: Bool = false

    private let apiService: AuraApiService = .shared

    private override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }

    // MARK: - WCSessionDelegate
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isWatchPaired = session.isPaired
            self.isWatchAppInstalled = session.isWatchAppInstalled
            self.isReachable = session.isReachable
        }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }

    public func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    // MARK: - Receiving commands from Watch (§5.2)
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task {
            let response = await handleCommandPayload(message)
            replyHandler(response)
        }
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task {
            _ = await handleCommandPayload(userInfo)
        }
    }

    private func handleCommandPayload(_ data: [String: Any]) async -> [String: Any] {
        guard let commandRaw = data["commandType"] as? String else {
            return ["ok": false, "error": "missing_command_type"]
        }

        let payload = (data["payload"] as? [String: String]) ?? [:]

        do {
            switch commandRaw {
            case "focus.start":
                let duration = Int(payload["duration"] ?? "25") ?? 25
                let result = try await apiService.startFocusSession(durationMinutes: duration)
                return ["ok": true, "result": result]

            case "focus.stop":
                // Stop active focus
                return ["ok": true, "status": "stopped"]

            case "distraction.reported":
                let sessionId = payload["session_id"]
                let result = try await apiService.reportDistracted(sessionId: sessionId)
                return ["ok": true, "result": result]

            case "brief.feedback":
                let cardId = payload["card_id"] ?? ""
                let eventId = payload["calendar_event_id"] ?? ""
                let action = payload["action"] ?? "Read"
                let seriesId = payload["series_id"]
                let result = try await apiService.sendNotificationFeedback(cardId: cardId, calendarEventId: eventId, action: action, seriesId: seriesId)
                return ["ok": true, "result": result]

            case "sos.ok":
                // Cancel safety escalation
                let userId = AuthService.shared.currentUserId ?? "usr_default"
                let incidentId = payload["incident_id"] ?? ""
                var request = URLRequest(url: URL(string: "https://api.aura.internal/api/v1/safety/cancel")!)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try? JSONSerialization.data(withJSONObject: ["user_id": userId, "incident_id": incidentId])
                _ = try? await URLSession.shared.data(for: request)
                return ["ok": true, "status": "cancelled"]

            case "sos.escalate":
                // Forward escalation to backend
                let userId = AuthService.shared.currentUserId ?? "usr_default"
                let incidentId = payload["incident_id"] ?? "inc_\(UUID().uuidString.prefix(8))"
                let reason = payload["reason"] ?? "timeout_no_response"
                var request = URLRequest(url: URL(string: "https://api.aura.internal/api/v1/safety/escalate")!)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try? JSONSerialization.data(withJSONObject: [
                    "user_id": userId,
                    "incident_id": incidentId,
                    "reason": reason
                ])
                _ = try? await URLSession.shared.data(for: request)
                return ["ok": true, "status": "escalated"]

            default:
                return ["ok": false, "error": "unrecognized_command"]
            }
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }
}
