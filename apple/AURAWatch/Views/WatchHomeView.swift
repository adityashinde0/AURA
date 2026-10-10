// AURAWatch/Views/WatchHomeView.swift
// Glanceable Watch home screen — one glance, three actions.
//
// Layout matches the spec:
//   AURA
//   Next: <title>
//   in <N> min
//   [ View Prep ]
//   [ Start Focus ]
//   [ I'm distracted ]
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import SwiftUI

struct WatchHomeView: View {

    @EnvironmentObject private var sessionManager: WatchSessionManager
    @EnvironmentObject private var healthKit: HealthKitManager

    /// Controls presentation of the focus duration picker sheet.
    @State private var showFocusPicker = false
    /// Controls presentation of the pre-meeting brief sheet.
    @State private var showMeetingCard = false
    /// Chosen focus duration in minutes.
    @State private var focusDurationMinutes: Int = 25

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {

                    // MARK: App title
                    Text("AURA")
                        .font(.headline)
                        .foregroundStyle(.primary)

                    // MARK: Next meeting summary
                    nextMeetingSection

                    Divider()

                    // MARK: Actions
                    actionButtons
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        // Safety check-in overlay — takes full screen priority.
        .fullScreenCover(isPresented: Binding(
            get: { healthKit.pendingSafetyEvent != nil },
            set: { if !$0 { healthKit.resolveCheckIn() } }
        )) {
            SafetyCheckInView()
                .environmentObject(healthKit)
        }
        // Pre-meeting brief sheet.
        .sheet(isPresented: $showMeetingCard) {
            if let card = sessionManager.pendingMeetingCard {
                PreMeetingView(card: card)
                    .environmentObject(sessionManager)
            }
        }
        // Focus duration picker sheet.
        .sheet(isPresented: $showFocusPicker) {
            focusDurationSheet
        }
    }

    // MARK: - Next meeting section

    @ViewBuilder
    private var nextMeetingSection: some View {
        if let card = sessionManager.pendingMeetingCard {
            VStack(alignment: .leading, spacing: 2) {
                Text("Next: \(card.title)")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                Text("in \(card.startsInMinutes) min")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } else {
            Text("No upcoming meetings")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Action buttons

    private var actionButtons: some View {
        VStack(spacing: 6) {

            // View Prep — only active when a card exists
            Button {
                showMeetingCard = true
            } label: {
                Label("View Prep", systemImage: "doc.text")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(sessionManager.pendingMeetingCard == nil)

            // Start Focus
            Button {
                showFocusPicker = true
            } label: {
                Label("Start Focus", systemImage: "timer")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(sessionManager.focusState.isActive)

            // I'm distracted
            Button {
                sessionManager.sendDistractionReported()
            } label: {
                Label("I'm distracted", systemImage: "exclamationmark.bubble")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .disabled(!sessionManager.focusState.isActive)

            // Navigate to active focus session when one is running
            if sessionManager.focusState.isActive {
                NavigationLink {
                    FocusGuardianWatchView()
                        .environmentObject(sessionManager)
                } label: {
                    Label("Focus session", systemImage: "arrow.right.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    // MARK: - Focus duration picker sheet

    private var focusDurationSheet: some View {
        VStack(spacing: 12) {
            Text("Focus duration")
                .font(.headline)

            Picker("Minutes", selection: $focusDurationMinutes) {
                ForEach([15, 25, 45, 60, 90], id: \.self) { min in
                    Text("\(min) min").tag(min)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 80)

            Button("Start") {
                sessionManager.sendFocusStart(durationSeconds: focusDurationMinutes * 60)
                showFocusPicker = false
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    WatchHomeView()
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(HealthKitManager.shared)
}
#endif
