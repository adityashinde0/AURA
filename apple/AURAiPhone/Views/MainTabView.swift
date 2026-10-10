// apple/AURAiPhone/Views/MainTabView.swift
import SwiftUI

public struct MainTabView: View {
    @ObservedObject var auth = AuthService.shared

    public init() {}

    public var body: some View {
        if !auth.isAuthenticated {
            VStack(spacing: 20) {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                Text("Project AURA")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                Text("Privacy-first AI companion for focus, briefings, and safety.")
                    .font(.body)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                Button {
                    Task {
                        try? await auth.startPKCEAuthFlow()
                    }
                } label: {
                    Label("Sign in with OAuth 2.0 PKCE", systemImage: "key.fill")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 32)
            }
            .padding()
        } else {
            TabView {
                PreferencesView()
                    .tabItem {
                        Label("Preferences", systemImage: "gearshape")
                    }

                CalendarSelectionView()
                    .tabItem {
                        Label("Calendars", systemImage: "calendar")
                    }

                AuditTimelineView()
                    .tabItem {
                        Label("Audit Log", systemImage: "clock.arrow.circlepath")
                    }
            }
        }
    }
}

#Preview {
    MainTabView()
}
