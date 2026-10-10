// AURAWatch/Views/PreMeetingView.swift
// Displays the T-5 meeting briefing card on Apple Watch.
//
// Privacy rules enforced here:
//   • Never displays raw transcript text.
//   • Respects NotificationPrivacyLevel: if the user chose "generic", the
//     detailed content is not shown on the lock screen (handled by APNs payload;
//     this view is only presented after the user unlocks).
//   • Max 70 words of context per card (enforced upstream by the policy service).
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import SwiftUI

struct PreMeetingView: View {

    let card: PreMeetingCard

    @EnvironmentObject private var sessionManager: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {

                // MARK: Header
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.title)
                        .font(.headline)
                        .lineLimit(2)
                    Text("Starts in \(card.startsInMinutes) min")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Divider()

                // MARK: Last decision
                VStack(alignment: .leading, spacing: 2) {
                    Label("Last decision", systemImage: "checkmark.seal")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(card.lastDecision)
                        .font(.footnote)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // MARK: Tone
                VStack(alignment: .leading, spacing: 2) {
                    Label("Tone", systemImage: "waveform")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(card.tone.capitalized)
                        .font(.footnote)
                }

                Divider()

                // MARK: Strategic questions (always exactly 3)
                VStack(alignment: .leading, spacing: 6) {
                    Label("Ask", systemImage: "questionmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(Array(card.questions.enumerated()), id: \.offset) { index, question in
                        HStack(alignment: .top, spacing: 4) {
                            Text("\(index + 1).")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .frame(width: 14, alignment: .leading)
                            Text(question)
                                .font(.footnote)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                Divider()

                // MARK: Action buttons
                actionButtons
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Brief")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Action buttons

    private var actionButtons: some View {
        VStack(spacing: 6) {
            // Open: user wants to act on this brief
            Button {
                sessionManager.sendBriefFeedback(kind: .open, seriesID: card.seriesID)
                dismiss()
            } label: {
                Label("Open", systemImage: "arrow.up.right.square")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            // Not useful: negative signal fed back to the ranking model
            Button {
                sessionManager.sendBriefFeedback(kind: .notUseful, seriesID: card.seriesID)
                dismiss()
            } label: {
                Label("Not useful", systemImage: "hand.thumbsdown")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            // Mute series: stops future T-5 reminders for this event series
            Button(role: .destructive) {
                sessionManager.sendBriefFeedback(kind: .muteSeries, seriesID: card.seriesID)
                dismiss()
            } label: {
                Label("Mute series", systemImage: "bell.slash")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview {
    NavigationStack {
        PreMeetingView(card: PreMeetingCard(
            id: "preview-1",
            title: "Design Review",
            startsInMinutes: 5,
            lastDecision: "Validate the onboarding flow before Q3 launch.",
            tone: "confident",
            questions: [
                "What decision do we need today?",
                "Who owns the next test?",
                "What blocks release?"
            ],
            seriesID: "series-abc"
        ))
        .environmentObject(WatchSessionManager.shared)
    }
}
#endif
