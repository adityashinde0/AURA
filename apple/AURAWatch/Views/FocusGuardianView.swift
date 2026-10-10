// apple/AURAWatch/Views/FocusGuardianView.swift
import SwiftUI

public struct FocusGuardianView: View {
    public let session: FocusSession
    @ObservedObject var connectivity: WatchConnectivityManager = .shared
    @Environment(\.dismiss) private var dismiss

    @State private var secondsRemaining: Int
    @State private var deepWorkDelta: Int
    @State private var showApprovalSheet: Bool = false
    @State private var suggestedAction: String = "Pause Slack Notifications"

    public init(session: FocusSession) {
        self.session = session
        _secondsRemaining = State(initialValue: session.durationMinutes * 60)
        _deepWorkDelta = State(initialValue: session.accumulatedPoints)
    }

    public var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Header
                Text("Focus Session")
                    .font(.headline)
                    .foregroundStyle(.indigo)

                // Countdown
                VStack(spacing: 2) {
                    Text(timeFormatted(secondsRemaining))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    Text("Deep Work Bank: +\(deepWorkDelta) pts")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
                .padding(.vertical, 4)

                Divider()

                // Actions
                VStack(spacing: 6) {
                    Button {
                        connectivity.sendCommand(.distractionReported, payload: [
                            "session_id": session.sessionId,
                            "reason": "self_reported"
                        ])
                        showApprovalSheet = true
                    } label: {
                        Label("I'm distracted", systemImage: "exclamationmark.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)

                    Button {
                        connectivity.sendCommand(.focusStop, payload: ["session_id": session.sessionId])
                        dismiss()
                    } label: {
                        Text("End Focus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
                }

                // Approval Card sub-view (§4.3)
                if showApprovalSheet {
                    Divider()
                    VStack(alignment: .leading, spacing: 4) {
                        Text("AURA Suggestion")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(suggestedAction)
                            .font(.caption)
                            .fontWeight(.semibold)

                        HStack(spacing: 4) {
                            Button("Yes") {
                                connectivity.sendCommand(.focusStart, payload: ["action": "approve", "proposal": suggestedAction])
                                showApprovalSheet = false
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)

                            Button("No") {
                                showApprovalSheet = false
                            }
                            .buttonStyle(.bordered)
                            .tint(.secondary)

                            Button("Always") {
                                connectivity.sendCommand(.focusStart, payload: ["action": "allow_always", "proposal": suggestedAction])
                                showApprovalSheet = false
                            }
                            .buttonStyle(.bordered)
                            .tint(.blue)
                        }
                    }
                    .padding(6)
                    .background(Color.gray.opacity(0.15))
                    .cornerRadius(8)
                }
            }
            .padding(.horizontal, 6)
        }
    }

    private func timeFormatted(_ totalSeconds: Int) -> String {
        let mins = totalSeconds / 60
        let secs = totalSeconds % 60
        return String(format: "%02d:%02d", mins, secs)
    }
}

#Preview {
    FocusGuardianView(session: FixtureData.sampleFocusSession)
}
