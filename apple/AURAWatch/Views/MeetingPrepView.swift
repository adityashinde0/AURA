// apple/AURAWatch/Views/MeetingPrepView.swift
import SwiftUI

public struct MeetingPrepView: View {
    public let card: WatchWhisperCard
    @ObservedObject var connectivity: WatchConnectivityManager = .shared
    @Environment(\.dismiss) private var dismiss

    public init(card: WatchWhisperCard) {
        self.card = card
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                // Header
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.meetingTitle)
                        .font(.headline)
                        .lineLimit(2)
                    HStack {
                        Text("Tone: \(card.emotionTone.capitalized)")
                            .font(.caption2)
                            .foregroundStyle(.blue)
                        Spacer()
                        if card.isQuietHours {
                            Label("Quiet", systemImage: "moon.fill")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Divider()

                // Summary
                VStack(alignment: .leading, spacing: 2) {
                    Label("Prep Summary", systemImage: "text.alignleft")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(card.prepSummary)
                        .font(.footnote)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Divider()

                // 3 Questions
                VStack(alignment: .leading, spacing: 4) {
                    Label("Strategic Questions", systemImage: "questionmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    ForEach(Array(card.questions.prefix(3).enumerated()), id: \.offset) { index, q in
                        HStack(alignment: .top, spacing: 4) {
                            Text("\(index + 1).")
                                .font(.caption)
                                .fontWeight(.semibold)
                            Text(q)
                                .font(.caption)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 1)
                    }
                }

                Divider()

                // Action buttons
                VStack(spacing: 6) {
                    Button {
                        connectivity.sendCommand(.briefFeedback, payload: [
                            "card_id": card.cardId,
                            "calendar_event_id": card.calendarEventId,
                            "action": "Read"
                        ])
                        dismiss()
                    } label: {
                        Text("Open")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        connectivity.sendCommand(.briefFeedback, payload: [
                            "card_id": card.cardId,
                            "calendar_event_id": card.calendarEventId,
                            "action": "Not useful"
                        ])
                        dismiss()
                    } label: {
                        Text("Not useful")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)

                    Button {
                        connectivity.sendCommand(.briefFeedback, payload: [
                            "card_id": card.cardId,
                            "calendar_event_id": card.calendarEventId,
                            "action": "Mute this event series"
                        ])
                        dismiss()
                    } label: {
                        Text("Mute series")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }
            }
            .padding(.horizontal, 6)
        }
        .navigationTitle("Meeting Prep")
    }
}

#Preview {
    MeetingPrepView(card: FixtureData.sampleCard)
}
