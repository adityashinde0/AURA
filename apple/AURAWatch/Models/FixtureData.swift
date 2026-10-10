// apple/AURAWatch/Models/FixtureData.swift
import Foundation

public enum FixtureData {
    public static let sampleCard = WatchWhisperCard(
        cardId: "card_fixture_01",
        calendarEventId: "evt_arch_review",
        userId: "usr_aditi_01",
        meetingTitle: "Sprint Architecture Defense",
        startEpoch: Int(Date().timeIntervalSince1970) + 300,
        prepSummary: "Review Cloud Intake data residency boundaries and zero-ambient retention guarantees before mentor presentation.",
        questions: [
            "How is DynamoDB PII minimization enforced?",
            "What triggers safe fallback in Bedrock adapter?",
            "How does Orbit firmware gate sensor telemetry?"
        ],
        emotionTone: "confident",
        evidenceSources: ["calendar", "confluence", "slack"],
        actions: ["Open", "Save", "Not useful", "Mute series"],
        createdAt: Date().timeIntervalSince1970,
        deliveredTo: "bee_watch",
        isQuietHours: false,
        hapticEnabled: true
    )

    public static let sampleFocusSession = FocusSession(
        sessionId: "sess_fixture_01",
        userId: "usr_aditi_01",
        status: "active",
        durationMinutes: 45,
        startedAt: Date().timeIntervalSince1970,
        distractionScore: 0.12,
        accumulatedPoints: 8
    )

    public static let samplePreMeetingCard = PreMeetingCard(
        id: "card_pre_01",
        title: "Sprint Architecture Defense",
        startsInMinutes: 5,
        lastDecision: "Adopted append-only audit trail and zero raw health telemetry.",
        tone: "confident",
        questions: [
            "How is DynamoDB PII minimization enforced?",
            "What triggers safe fallback in Bedrock adapter?",
            "How does Orbit firmware gate sensor telemetry?"
        ],
        seriesID: "series_arch_defense"
    )
}
