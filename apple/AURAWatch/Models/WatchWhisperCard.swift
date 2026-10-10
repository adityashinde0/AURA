// apple/AURAWatch/Models/WatchWhisperCard.swift
import Foundation

public struct WatchWhisperCard: Codable, Identifiable, Sendable {
    public let id: String
    public let cardId: String
    public let calendarEventId: String
    public let userId: String
    public let meetingTitle: String
    public let startEpoch: Int
    public let prepSummary: String
    public let questions: [String]
    public let emotionTone: String
    public let evidenceSources: [String]
    public let actions: [String]
    public let createdAt: Double
    public let deliveredTo: String
    public let isQuietHours: Bool
    public let hapticEnabled: Bool

    public init(
        cardId: String = UUID().uuidString,
        calendarEventId: String,
        userId: String,
        meetingTitle: String,
        startEpoch: Int,
        prepSummary: String,
        questions: [String],
        emotionTone: String = "calm",
        evidenceSources: [String] = [],
        actions: [String] = ["Read", "Save", "Not useful", "Mute this event series"],
        createdAt: Double = Date().timeIntervalSince1970,
        deliveredTo: String = "bee_watch",
        isQuietHours: Bool = False,
        hapticEnabled: Bool = True
    ) {
        self.id = cardId
        self.cardId = cardId
        self.calendarEventId = calendarEventId
        self.userId = userId
        self.meetingTitle = meetingTitle
        self.startEpoch = startEpoch
        self.prepSummary = prepSummary
        self.questions = questions
        self.emotionTone = emotionTone
        self.evidenceSources = evidenceSources
        self.actions = actions
        self.createdAt = createdAt
        self.deliveredTo = deliveredTo
        self.isQuietHours = isQuietHours
        self.hapticEnabled = hapticEnabled
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case cardId = "card_id"
        case calendarEventId = "calendar_event_id"
        case userId = "user_id"
        case meetingTitle = "meeting_title"
        case startEpoch = "start_epoch"
        case prepSummary = "prep_summary"
        case questions
        case emotionTone = "emotion_tone"
        case evidenceSources = "evidence_sources"
        case actions
        case createdAt = "created_at"
        case deliveredTo = "delivered_to"
        case isQuietHours = "is_quiet_hours"
        case hapticEnabled = "haptic_enabled"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let cId = try container.decodeIfPresent(String.self, forKey: .cardId) ?? UUID().uuidString
        self.id = (try container.decodeIfPresent(String.self, forKey: .id)) ?? cId
        self.cardId = cId
        self.calendarEventId = try container.decode(String.self, forKey: .calendarEventId)
        self.userId = try container.decode(String.self, forKey: .userId)
        self.meetingTitle = try container.decode(String.self, forKey: .meetingTitle)
        self.startEpoch = try container.decode(Int.self, forKey: .startEpoch)
        self.prepSummary = try container.decode(String.self, forKey: .prepSummary)
        self.questions = try container.decode([String].self, forKey: .questions)
        self.emotionTone = try container.decodeIfPresent(String.self, forKey: .emotionTone) ?? "calm"
        self.evidenceSources = try container.decodeIfPresent([String].self, forKey: .evidenceSources) ?? []
        self.actions = try container.decodeIfPresent([String].self, forKey: .actions) ?? ["Read", "Save", "Not useful", "Mute this event series"]
        self.createdAt = try container.decodeIfPresent(Double.self, forKey: .createdAt) ?? Date().timeIntervalSince1970
        self.deliveredTo = try container.decodeIfPresent(String.self, forKey: .deliveredTo) ?? "bee_watch"
        self.isQuietHours = try container.decodeIfPresent(Bool.self, forKey: .isQuietHours) ?? false
        self.hapticEnabled = try container.decodeIfPresent(Bool.self, forKey: .hapticEnabled) ?? true
    }
}
