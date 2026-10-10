// apple/AURAWatch/Services/HealthKitService.swift
import Foundation
import HealthKit
import Combine

/// Pre-classified HealthKit event categories (NEVER raw BPM samples).
public enum HealthKitEventCategory: String, Sendable {
    case highHeartRate = "high_heart_rate"
    case lowHeartRate = "low_heart_rate"
    case irregularHeartRhythm = "irregular_heart_rhythm"
}

@MainActor
public final class HealthKitService: NSObject, ObservableObject {
    public static let shared = HealthKitService()

    @Published public private(set) var isAuthorized: Bool = false
    @Published public private(set) var activeWarningEvent: HealthKitEventCategory? = nil

    private let healthStore = HKHealthStore()
    private var activeQueries: [HKObserverQuery] = []

    // Pre-classified category types only — NEVER HKQuantityTypeIdentifier.heartRate
    private let allowedCategoryTypes: [HKCategoryTypeIdentifier] = [
        .highHeartRateEvent,
        .lowHeartRateEvent,
        .irregularHeartRhythmEvent
    ]

    private override init() {
        super.init()
    }

    /// Request user authorization for pre-classified categories only.
    public func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else {
            return false
        }

        var typesToRead = Set<HKObjectType>()
        for typeId in allowedCategoryTypes {
            if let catType = HKObjectType.categoryType(forIdentifier: typeId) {
                typesToRead.insert(catType)
            }
        }

        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            isAuthorized = true
            await enableBackgroundDelivery()
            registerObserverQueries()
            return true
        } catch {
            print(#"{"level":"WARN","service":"HealthKitService","event":"auth_failed","error":"\#(error.localizedDescription)"}"#)
            return false
        }
    }

    /// Enable background delivery for each pre-classified event category.
    private func enableBackgroundDelivery() async {
        for typeId in allowedCategoryTypes {
            guard let catType = HKObjectType.categoryType(forIdentifier: typeId) else { continue }
            do {
                try await healthStore.enableBackgroundDelivery(for: catType, frequency: .immediate)
            } catch {
                print(#"{"level":"WARN","service":"HealthKitService","event":"background_delivery_failed","type":"\#(typeId.rawValue)"}"#)
            }
        }
    }

    /// Register HKObserverQuery to trigger safety check-in on event delivery.
    private func registerObserverQueries() {
        for typeId in allowedCategoryTypes {
            guard let catType = HKObjectType.categoryType(forIdentifier: typeId) else { continue }

            let query = HKObserverQuery(sampleType: catType, predicate: nil) { [weak self] _, completionHandler, error in
                guard error == nil else {
                    completionHandler()
                    return
                }

                Task { @MainActor [weak self] in
                    guard let self = self else {
                        completionHandler()
                        return
                    }

                    switch typeId {
                    case .highHeartRateEvent:
                        self.activeWarningEvent = .highHeartRate
                    case .lowHeartRateEvent:
                        self.activeWarningEvent = .lowHeartRate
                    case .irregularHeartRhythmEvent:
                        self.activeWarningEvent = .irregularHeartRhythm
                    default:
                        break
                    }
                    completionHandler()
                }
            }

            healthStore.execute(query)
            activeQueries.append(query)
        }
    }

    /// Guard check against accidental raw heart rate samples.
    /// Strictly rejects continuous BPM numbers to protect user privacy.
    public static func validateHealthPayloadDoesNotContainRawTelemetry(_ payload: [String: Any]) -> Bool {
        let prohibitedKeys = ["bpm", "heart_rate", "raw_samples", "continuous_hr", "samples"]
        for key in prohibitedKeys {
            if payload[key] != nil {
                print(#"{"level":"WARN","service":"HealthKitService","event":"raw_health_sample_rejected","key":"\#(key)"}"#)
                return false
            }
        }
        return true
    }

    public func dismissWarning() {
        activeWarningEvent = nil
    }
}
