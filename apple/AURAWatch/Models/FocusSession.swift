// apple/AURAWatch/Models/FocusSession.swift
import Foundation

public struct FocusSession: Codable, Identifiable, Sendable {
    public let id: String
    public let sessionId: String
    public let userId: String
    public var status: String // "active", "completed", "paused"
    public let durationMinutes: Int
    public let startedAt: Double
    public let targetEndAt: Double
    public var distractionScore: Double
    public var accumulatedPoints: Int

    public init(
        sessionId: String = UUID().uuidString,
        userId: String,
        status: String = "active",
        durationMinutes: Int = 25,
        startedAt: Double = Date().timeIntervalSince1970,
        targetEndAt: Double? = nil,
        distractionScore: Double = 0.0,
        accumulatedPoints: Int = 5
    ) {
        self.id = sessionId
        self.sessionId = sessionId
        self.userId = userId
        self.status = status
        self.durationMinutes = durationMinutes
        self.startedAt = startedAt
        self.targetEndAt = targetEndAt ?? (startedAt + Double(durationMinutes * 60))
        self.distractionScore = distractionScore
        self.accumulatedPoints = accumulatedPoints
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "session_id"
        case userId = "user_id"
        case status
        case durationMinutes = "duration_minutes"
        case startedAt = "started_at"
        case targetEndAt = "target_end_at"
        case distractionScore = "distraction_score"
        case accumulatedPoints = "accumulated_points"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let sId = try container.decodeIfPresent(String.self, forKey: .sessionId) ?? UUID().uuidString
        self.id = (try container.decodeIfPresent(String.self, forKey: .id)) ?? sId
        self.sessionId = sId
        self.userId = try container.decode(String.self, forKey: .userId)
        self.status = try container.decodeIfPresent(String.self, forKey: .status) ?? "active"
        self.durationMinutes = try container.decodeIfPresent(Int.self, forKey: .durationMinutes) ?? 25
        self.startedAt = try container.decodeIfPresent(Double.self, forKey: .startedAt) ?? Date().timeIntervalSince1970
        self.targetEndAt = try container.decodeIfPresent(Double.self, forKey: .targetEndAt) ?? (self.startedAt + Double(self.durationMinutes * 60))
        self.distractionScore = try container.decodeIfPresent(Double.self, forKey: .distractionScore) ?? 0.0
        self.accumulatedPoints = try container.decodeIfPresent(Int.self, forKey: .accumulatedPoints) ?? 5
    }
}
