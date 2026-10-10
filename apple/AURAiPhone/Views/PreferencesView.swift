// apple/AURAiPhone/Views/PreferencesView.swift
import SwiftUI

public struct PreferencesView: View {
    @State private var meetingBriefEnabled: Bool = false
    @State private var notificationPreview: String = "generic"
    @State private var focusActionScope: String = "ask_every_time"
    @State private var slackStatusEnabled: Bool = false
    @State private var safetyGuardianEnabled: Bool = false
    @State private var locationInSos: String = "ask_each_time"

    @State private var isSaving: Bool = false
    private let apiService: AuraApiService = .shared

    public init() {}

    public var body: some View {
        NavigationStack {
            Form {
                // Section 1: Pre-Meeting Briefs
                Section("Meeting Briefings") {
                    Toggle("Meeting Briefs (T-5)", isOn: $meetingBriefEnabled)
                        .onChange(of: meetingBriefEnabled) { _, _ in savePreferences() }

                    NavigationLink("Opt-in Calendars") {
                        CalendarSelectionView()
                    }
                }

                // Section 2: Watch Notification Preview
                Section("Watch Notification Preview") {
                    Picker("Preview Mode", selection: $notificationPreview) {
                        Text("Generic").tag("generic")
                        Text("Private Context").tag("private_context")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: notificationPreview) { _, _ in savePreferences() }
                }

                // Section 3: Focus Actions Scope
                Section("Focus Actions Consent") {
                    Picker("Interventions", selection: $focusActionScope) {
                        Text("Ask every time").tag("ask_every_time")
                        Text("This session").tag("this_session")
                        Text("Never").tag("never")
                    }
                    .pickerStyle(.menu)
                    .onChange(of: focusActionScope) { _, _ in savePreferences() }
                }

                // Section 4: Slack Status
                Section("Slack Status") {
                    Toggle("Sync Ambient Focus Status", isOn: $slackStatusEnabled)
                        .onChange(of: slackStatusEnabled) { _, _ in savePreferences() }
                }

                // Section 5: Safety Guardian
                Section("Safety Guardian") {
                    Toggle("Safety Guardian Check-Ins", isOn: $safetyGuardianEnabled)
                        .onChange(of: safetyGuardianEnabled) { _, _ in savePreferences() }

                    Picker("Location in SOS", selection: $locationInSos) {
                        Text("Off").tag("off")
                        Text("Ask each time").tag("ask_each_time")
                        Text("Approved contacts").tag("approved_contacts_only")
                    }
                    .pickerStyle(.menu)
                    .onChange(of: locationInSos) { _, _ in savePreferences() }
                }
            }
            .navigationTitle("Preferences")
            .task {
                await loadPreferences()
            }
        }
    }

    private func loadPreferences() async {
        do {
            let prefs = try await apiService.getPreferences()
            if let p = prefs["preferences"] as? [String: Any] {
                self.meetingBriefEnabled = p["pre_meeting_enabled"] as? Bool ?? false
                self.notificationPreview = p["notification_preview"] as? String ?? "generic"
                self.focusActionScope = p["focus_action_scope"] as? String ?? "ask_every_time"
                self.slackStatusEnabled = p["slack_status_enabled"] as? Bool ?? false
                self.safetyGuardianEnabled = p["safety_guardian_enabled"] as? Bool ?? false
                self.locationInSos = p["location_in_sos"] as? String ?? "ask_each_time"
            }
        } catch {
            // Keep defaults
        }
    }

    private func savePreferences() {
        Task {
            isSaving = true
            defer { isSaving = false }
            let patch: [String: Any] = [
                "pre_meeting_enabled": meetingBriefEnabled,
                "notification_preview": notificationPreview,
                "focus_action_scope": focusActionScope,
                "slack_status_enabled": slackStatusEnabled,
                "safety_guardian_enabled": safetyGuardianEnabled,
                "location_in_sos": locationInSos
            ]
            _ = try? await apiService.updatePreferences(patch: patch)
        }
    }
}

#Preview {
    PreferencesView()
}
