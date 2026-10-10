// apple/AURAiPhone/App/AURAiPhoneApp.swift
import SwiftUI

@main
struct AURAiPhoneApp: App {
    @StateObject private var auth = AuthService.shared
    @StateObject private var connectivity = iPhoneWatchConnectivityManager.shared

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environmentObject(auth)
                .environmentObject(connectivity)
        }
    }
}
