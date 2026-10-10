// AURAWatch/HealthKitManager.swift
// Manages HealthKit authorisation and background delivery of warning events.
//
// Safety statement (non-negotiable):
//   AURA Safety Guardian is an opt-in check-in service. It reacts to
//   Apple-authorized HealthKit warning events (high/low heart rate, irregular
//   rhythm, fall detection) and triggers a 30-second check-in prompt. It is NOT
//   a medical device, does NOT diagnose emergencies, and does NOT replace
//   Emergency SOS or professional medical care.
//
// Zero-ambient-storage guarantee:
//   No raw health samples are written to disk or sent to any log. Only the
//   event category and timestamp are used; they are discarded after the
//   check-in resolves.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import Foundation
import HealthKit

/// Events that trigger the Safety Guardian check-in prompt.
public enum SafetyHealthEvent: Sendable {
    case highHeartRate
    case lowHeartRate
    case irregularRhythm
    case fall
}

@MainActor
public final class HealthKitManager: ObservableObject {

    // MARK: - Singleton

    public static let shared = HealthKitManager()

    // MARK: - Published state

    /// Non-nil when a warning event has fired and the check-in is pending user response.
    @Published public private(set) var pendingSafetyEvent: SafetyHealthEvent? = nil

    /// Whether HealthKit authorization has been granted for the required types.
    @Published public private(set) var isAuthorized: Bool = false

    // MARK: - Private

    private let store = HKHealthStore()

    private let readTypes: Set<HKObjectType> = {
        var types = Set<HKObjectType>()
        // Heart rate (used to detect high/low alert categories)
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) {
            types.insert(hr)
        }
        // Category samples written by Apple Watch for high/low heart rate events
        if let highHR = HKObjectType.categoryType(forIdentifier: .highHeartRateEvent) {
            types.insert(highHR)
        }
        if let lowHR = HKObjectType.categoryType(forIdentifier: .lowHeartRateEvent) {
            types.insert(lowHR)
        }
        // Irregular heart rhythm notification
        if let irr = HKObjectType.categoryType(forIdentifier: .irregularHeartRhythmEvent) {
            types.insert(irr)
        }
        // Number of times fallen (watchOS 6+, requires entitlement)
        if let fall = HKObjectType.quantityType(forIdentifier: .numberOfTimesFallen) {
            types.insert(fall)
        }
        return types
    }()

    private init() {}

    // MARK: - Authorisation

    /// Requests HealthKit authorisation for safety-relevant types.
    /// Must be called from a user-visible interaction (e.g. Safety Guardian onboarding).
    public func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
            await enableBackgroundDelivery()
        } catch {
            // Authorization denied or unavailable — log event only (no health data logged).
            print(#"{"level":"warn","service":"HealthKitManager","event":"authorization_failed","error":"\#(error.localizedDescription)"}"#)
        }
    }

    // MARK: - Background delivery

    /// Enables background delivery for each supported warning-event type.
    /// Apple delivers several of these immediately on watchOS.
    private func enableBackgroundDelivery() async {
        let categoryTypeIDs: [HKCategoryTypeIdentifier] = [
            .highHeartRateEvent,
            .lowHeartRateEvent,
            .irregularHeartRhythmEvent
        ]
        for typeID in categoryTypeIDs {
            guard let type = HKObjectType.categoryType(forIdentifier: typeID) else { continue }
            do {
                try await store.enableBackgroundDelivery(for: type, frequency: .immediate)
                startObserver(for: type)
            } catch {
                print(#"{"level":"warn","service":"HealthKitManager","event":"bg_delivery_failed","type":"\#(typeID.rawValue)","error":"\#(error.localizedDescription)"}"#)
            }
        }
        // Fall detection via numberOfTimesFallen quantity
        if let fallType = HKObjectType.quantityType(forIdentifier: .numberOfTimesFallen) {
            do {
                try await store.enableBackgroundDelivery(for: fallType, frequency: .immediate)
                startQuantityObserver(for: fallType)
            } catch {
                print(#"{"level":"warn","service":"HealthKitManager","event":"bg_delivery_failed","type":"numberOfTimesFallen","error":"\#(error.localizedDescription)"}"#)
            }
        }
    }

    // MARK: - Observers

    private func startObserver(for type: HKCategoryType) {
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            // Zero-ambient-storage guarantee: this handler receives only a
            // wake-up signal — no raw samples are accessed or stored here.
            // The completionHandler MUST be called in every code path so
            // HealthKit can reschedule background delivery correctly.
            defer { completionHandler() }

            // Do-catch wrapper: any unexpected throw from the event mapping
            // must not propagate out of this background-delivered closure.
            // Logging the error category only — no health data, no user IDs.
            do {
                guard error == nil else {
                    // HealthKit delivery error — log category only, drop event.
                    print(#"{"level":"warn","service":"HealthKitManager","event":"observer_delivery_error","type":"\#(type.identifier)"}"#)
                    return
                }

                let event: SafetyHealthEvent
                switch type.identifier {
                case HKCategoryTypeIdentifier.highHeartRateEvent.rawValue:
                    event = .highHeartRate
                case HKCategoryTypeIdentifier.lowHeartRateEvent.rawValue:
                    event = .lowHeartRate
                case HKCategoryTypeIdentifier.irregularHeartRhythmEvent.rawValue:
                    event = .irregularRhythm
                default:
                    // Unknown type — do not surface; no raw data retained.
                    return
                }

                // Capture the event value before crossing into the MainActor
                // task so that no HealthKit object reference escapes this scope.
                let capturedEvent = event
                Task { @MainActor [weak self] in
                    // Drop the event immediately if a check-in is already
                    // pending; triggerCheckIn() deduplicates, but we also
                    // ensure the captured value is not held alive past the
                    // point where it is consumed.
                    self?.triggerCheckIn(event: capturedEvent)
                }
            } catch {
                // Defensive catch — Swift's type system makes this unreachable
                // today, but keeps the handler safe against future refactoring.
                print(#"{"level":"error","service":"HealthKitManager","event":"observer_unexpected_error","type":"\#(type.identifier)"}"#)
            }
        }
        store.execute(query)
    }

    private func startQuantityObserver(for type: HKQuantityType) {
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            // Zero-ambient-storage guarantee: no quantity sample values are
            // read or stored. The handler only signals that a fall was detected.
            defer { completionHandler() }

            do {
                guard error == nil else {
                    print(#"{"level":"warn","service":"HealthKitManager","event":"observer_delivery_error","type":"\#(type.identifier)"}"#)
                    return
                }

                Task { @MainActor [weak self] in
                    self?.triggerCheckIn(event: .fall)
                }
            } catch {
                print(#"{"level":"error","service":"HealthKitManager","event":"observer_unexpected_error","type":"\#(type.identifier)"}"#)
            }
        }
        store.execute(query)
    }

    // MARK: - Check-in lifecycle

    /// Called when a warning event fires. Sets `pendingSafetyEvent` so the
    /// SafetyCheckInView can present itself. Raw health samples are never stored.
    private func triggerCheckIn(event: SafetyHealthEvent) {
        // Deduplicate: ignore if a check-in is already pending.
        guard pendingSafetyEvent == nil else { return }
        pendingSafetyEvent = event
    }

    /// Called by SafetyCheckInView when the user taps "I'm OK".
    public func resolveCheckIn() {
        pendingSafetyEvent = nil
    }

    /// Called by SafetyCheckInView when the 30-second timeout elapses without response
    /// or the user taps "Escalate". Clears the local event and drops all sample
    /// references; iPhone handles escalation.
    ///
    /// Zero-ambient-storage: `pendingSafetyEvent` holds only an enum case
    /// (no raw biometric data). Setting it to nil here ensures no health
    /// information is retained after the check-in resolves.
    public func escalateCheckIn() {
        pendingSafetyEvent = nil   // drop all retained event state immediately
        WatchSessionManager.shared.sendSOSEscalate()
    }
}
