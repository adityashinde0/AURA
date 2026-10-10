// apple/AURAWatch/Services/WatchConnectivityManager.swift
import Foundation
import WatchConnectivity
import Combine

@MainActor
public final class WatchConnectivityManager: NSObject, ObservableObject, WCSessionDelegate {
    public static let shared = WatchConnectivityManager()

    @Published public private(set) var isReachable: Bool = false
    @Published public private(set) var activeFocusSession: FocusSession? = nil
    @Published public private(set) var latestWhisperCard: WatchWhisperCard? = nil

    private override init() {
        super.init()
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }

    // MARK: - Command Sender
    public func sendCommand(
        _ commandType: CommandType,
        payload: [String: String]? = nil,
        completion: ((Result<[String: Any], Error>) -> Void)? = nil
    ) {
        guard WCSession.isSupported() else {
            completion?(.failure(NSError(domain: "AURAWatch", code: -1, userInfo: [NSLocalizedDescriptionKey: "WCSession not supported"])))
            return
        }

        let envelope = CommandEnvelope(
            commandType: commandType,
            commandID: UUID().uuidString,
            issuedAt: Date(),
            payload: payload
        )

        do {
            let messageDict = try envelope.wcPayload()
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(messageDict, replyHandler: { reply in
                    completion?(.success(reply))
                }, errorHandler: { error in
                    completion?(.failure(error))
                })
            } else {
                WCSession.default.transferUserInfo(messageDict)
                completion?(.success(["status": "queued"]))
            }
        } catch {
            completion?(.failure(error))
        }
    }

    // MARK: - WCSessionDelegate
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    public func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
        }
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        handleIncomingMessage(message)
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        handleIncomingMessage(userInfo)
    }

    private func handleIncomingMessage(_ data: [String: Any]) {
        // Inspect for card or focus session updates
        if let cardData = data["whisper_card"] as? [String: Any],
           let jsonData = try? JSONSerialization.data(withJSONObject: cardData),
           let card = try? JSONDecoder().decode(WatchWhisperCard.self, from: jsonData) {
            Task { @MainActor in
                self.latestWhisperCard = card
            }
        }
    }
}
