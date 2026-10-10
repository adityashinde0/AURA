// AURAWatch/Views/FocusGuardianWatchView.swift
// Active focus session screen — countdown, distraction reporting, and
// 1-tap intervention sheet.
//
// Behaviour:
//   • Drives a local countdown timer; reconciles with backend state on resume.
//   • "I'm distracted" triggers an intervention sheet with the policy-service
//     suggestion and an Undo option.
//   • Never executes device actions directly — always sends a command to the
//     iPhone → backend policy engine.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import SwiftUI

struct FocusGuardianWatchView: View {

    @EnvironmentObject private var sessionManager: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    /// Controls the distraction intervention sheet.
    @State private var showInterventionSheet = false
    /// Whether the user has just sent a distraction command (enables Undo).
    @State private var distractionPending = false
    /// Local timer tick — the UI timer is driven from stored secondsRemaining
    /// and ticked locally to avoid requiring a live server connection every second.
    @State private var localSecondsRemaining: Int = 0
    /// The timer publisher.
    @State private var timerTask: Task<Void, Never>? = nil

    var body: some View {
        VStack(spacing: 10) {

            // MARK: Timer display
            countdownSection

            // MARK: Deep-work points
            Text("Deep Work Bank: +\(sessionManager.focusState.deepWorkPoints)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Divider()

            // MARK: Primary action buttons
            actionButtons
        }
        .padding(.horizontal, 4)
        .navigationTitle("Focus")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            syncLocalTimer()
            startLocalCountdown()
        }
        .onDisappear {
            timerTask?.cancel()
        }
        .onChange(of: sessionManager.focusState.secondsRemaining) { _, newValue in
            if let newValue {
                localSecondsRemaining = newValue
            }
        }
        .sheet(isPresented: $showInterventionSheet) {
            interventionSheet
        }
    }

    // MARK: - Countdown section

    @ViewBuilder
    private var countdownSection: some View {
        VStack(spacing: 2) {
            Text("Focus session")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(formattedTime(seconds: localSecondsRemaining))
                .font(.system(.title2, design: .monospaced, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(localSecondsRemaining < 60 ? .orange : .primary)
            Text("remaining")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Action buttons

    private var actionButtons: some View {
        VStack(spacing: 6) {
            Button {
                if distractionPending {
                    // Undo: clear the pending distraction, no further action needed.
                    distractionPending = false
                } else {
                    showInterventionSheet = true
                }
            } label: {
                Label(
                    distractionPending ? "Undo" : "I'm distracted",
                    systemImage: distractionPending ? "arrow.uturn.backward" : "exclamationmark.bubble"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(distractionPending ? .orange : .primary)

            Button(role: .destructive) {
                sessionManager.sendFocusStop()
                dismiss()
            } label: {
                Label("End Focus", systemImage: "stop.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    // MARK: - Intervention sheet

    private var interventionSheet: some View {
        VStack(spacing: 10) {
            Text("Focus check-in")
                .font(.headline)

            Text("You reported distraction.")
                .font(.footnote)
                .multilineTextAlignment(.center)

            if let suggestion = sessionManager.focusState.lastDistractionResponse {
                Text(suggestionLabel(for: suggestion))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            Divider()

            VStack(spacing: 6) {
                Button("Yes, once") {
                    sessionManager.sendDistractionReported()
                    distractionPending = true
                    showInterventionSheet = false
                }
                .buttonStyle(.borderedProminent)

                Button("No") {
                    showInterventionSheet = false
                }
                .buttonStyle(.bordered)

                Button("Always ask") {
                    // Preference stored server-side via the backend command.
                    let payload: [String: String] = ["distractionPreference": "always_ask"]
                    let cmd = CommandEnvelope(
                        commandType: .distractionReported,
                        payload: payload
                    )
                    sessionManager.send(cmd)
                    showInterventionSheet = false
                }
                .buttonStyle(.bordered)
            }
        }
        .padding()
    }

    // MARK: - Helpers

    private func syncLocalTimer() {
        localSecondsRemaining = sessionManager.focusState.secondsRemaining ?? 0
    }

    private func startLocalCountdown() {
        timerTask?.cancel()
        timerTask = Task {
            while !Task.isCancelled && localSecondsRemaining > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if !Task.isCancelled {
                    localSecondsRemaining = max(0, localSecondsRemaining - 1)
                }
            }
        }
    }

    private func formattedTime(seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%02d:%02d", m, s)
    }

    private func suggestionLabel(for kind: DistractionResponseKind) -> String {
        switch kind {
        case .nudge:
            return "Suggestion: take a breath and return to your task."
        case .openPhoneFocusSettings:
            return "Suggestion: open Focus settings on your iPhone?"
        case .requestPause:
            return "Suggestion: pause allowed media device?"
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    NavigationStack {
        FocusGuardianWatchView()
            .environmentObject(WatchSessionManager.shared)
    }
}
#endif
