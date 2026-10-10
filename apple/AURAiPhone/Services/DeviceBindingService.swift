// apple/AURAiPhone/Services/DeviceBindingService.swift
import Foundation
import UIKit

@MainActor
public final class DeviceBindingService: ObservableObject {
    public static let shared = DeviceBindingService()

    @Published public private(set) var isRegistered: Bool = false
    @Published public private(set) var activeDeviceId: String? = nil

    private let deviceIdKey = "com.aura.device.id"
    private let apiService: AuraApiService = .shared

    private init() {
        self.activeDeviceId = UserDefaults.standard.string(forKey: deviceIdKey)
    }

    public func registerDeviceBinding(apnsToken: String) async throws {
        let deviceId = activeDeviceId ?? "dev_\(UUID().uuidString.prefix(12))"
        UserDefaults.standard.set(deviceId, forKey: deviceIdKey)
        self.activeDeviceId = deviceId

        let result = try await apiService.registerDevice(
            deviceType: "apple_watch",
            pushToken: apnsToken,
            deviceId: deviceId
        )

        if let registered = result["registered"] as? Bool, registered {
            self.isRegistered = true
        }
    }
}
