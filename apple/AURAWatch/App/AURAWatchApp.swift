// apple/AURAWatch/App/AURAWatchApp.swift
import SwiftUI

@main
struct AURAWatchApp: App {
    @StateObject private var connectivity = WatchConnectivityManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connectivity)
        }
    }
}
