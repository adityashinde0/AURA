// apple/AURAWatch/Views/SafetyCheckinView.swift
import SwiftUI
import WatchKit

public struct SafetyCheckinView: View {
    @ObservedObject var connectivity: WatchConnectivityManager = .shared
    @Environment(\.dismiss) private var dismiss

    @State private var secondsRemaining: Int = 30
    @State private var timerTask: Task<Void, Never>? = nil
    @State private var hasEscalated: Bool = false

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                // Header & Icon
                Image(systemName: "heart.text.square.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.red)

                Text("Are you okay?")
                    .font(.headline)
                    .fontWeight(.bold)

                // Mandatory Regulatory Notice (§6.1)
                Text("Safety Guardian is an opt-in check-in service. It is not a medical device, does not diagnose emergencies, and does not replace Emergency SOS.")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 4)

                Text("Powered by Apple HealthKit — not a medical device.")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 2)

                // Countdown badge
                Text("Auto-escalating in \(secondsRemaining)s")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(secondsRemaining < 10 ? .red : .orange)

                Divider()

                // Actions
                VStack(spacing: 6) {
                    // I'm OK
                    Button {
                        timerTask?.cancel()
                        connectivity.sendCommand(.sosOK, payload: ["status": "ok"])
                        dismiss()
                    } label: {
                        Text("I'm OK")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)

                    // Notify Contacts (Escalate)
                    Button {
                        triggerEscalation()
                    } label: {
                        Text("Notify Contacts")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.orange)

                    // Call Emergency SOS
                    Button {
                        WKInterfaceDevice.current().play(.notification)
                        // Trigger Apple native SOS handoff
                        if let url = URL(string: "tel://911"), WKExtension.shared().canOpenURL(url) {
                            WKExtension.shared().openSystemURL(url)
                        }
                    } label: {
                        Text("Call Emergency")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
            }
            .padding(.horizontal, 6)
        }
        .onAppear {
            WKInterfaceDevice.current().play(.failure)
            startCountdown()
        }
        .onDisappear {
            timerTask?.cancel()
        }
    }

    private func startCountdown() {
        timerTask = Task {
            while secondsRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if Task.isCancelled { break }
                secondsRemaining -= 1
            }
            if secondsRemaining == 0 && !hasEscalated {
                triggerEscalation()
            }
        }
    }

    private func triggerEscalation() {
        hasEscalated = true
        timerTask?.cancel()
        WKInterfaceDevice.current().play(.directionUp)
        connectivity.sendCommand(.sosEscalate, payload: [
            "reason": "timeout_no_response",
            "timestamp": "\(Int(Date().timeIntervalSince1970))"
        ])
    }
}

#Preview {
    SafetyCheckinView()
}
