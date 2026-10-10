// AURACompanion/Views/CompanionSettingsView.swift
// iPhone settings screen for AURA Companion.
//
// Sections:
//   1. Calendar connections — which calendars feed T-5 briefs.
//   2. Notification privacy level — generic vs contextual.
//   3. Safety Guardian — opt-in toggle, timeout, emergency contacts.
//   4. Account — sign-in / sign-out.
//
// Privacy guarantees:
//   • Safety Guardian is OFF by default.
//   • Emergency contacts are never logged or forwarded to Slack.
//   • Raw health data is never stored or shown here.
//
// Copyright © 2024 Project AURA. All rights reserved.
// Author: Aditya Shinde

import SwiftUI

public struct CompanionSettingsView: View {

    @EnvironmentObject private var apiClient: AuraAPIClient
    @EnvironmentObject private var sessionManager: iPhoneSessionManager

    // MARK: Persisted preferences (App Group UserDefaults)

    @AppStorage("notificationPrivacyLevel") private var privacyLevelRaw: String = NotificationPrivacyLevel.generic.rawValue
    @AppStorage("enabledCalendars")         private var enabledCalendarsData: Data = Data()
    @AppStorage("safetyEnabled")            private var safetyEnabled: Bool = false
    @AppStorage("safetyTimeout")            private var safetyTimeoutSeconds: Int = 30
    @AppStorage("shareLocation")            private var shareLocation: Bool = false

    // MARK: Computed helpers

    private var privacyLevel: NotificationPrivacyLevel {
        get { NotificationPrivacyLevel(rawValue: privacyLevelRaw) ?? .generic }
        nonmutating set { privacyLevelRaw = newValue.rawValue }
    }

    // MARK: Local state

    @State private var connectedCalendars: [CalendarItem] = CalendarItem.sampleCalendars
    @State private var emergencyContacts: [EmergencyContactItem] = []
    @State private var showAddContactSheet: Bool = false
    @State private var newContactName: String = ""
    @State private var newContactHandle: String = ""
    @State private var showSignOutConfirmation: Bool = false
    @State private var presentationAnchor: UIWindow? = nil

    public var body: some View {
        NavigationStack {
            Form {
                calendarSection
                notificationPrivacySection
                safetyGuardianSection
                emergencyContactsSection
                accountSection
            }
            .navigationTitle("AURA Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $showAddContactSheet) {
            addContactSheet
        }
    }

    // MARK: - Calendar section

    private var calendarSection: some View {
        Section {
            ForEach($connectedCalendars) { $calendar in
                Toggle(isOn: $calendar.isEnabled) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(calendar.name)
                            .font(.body)
                        Text(calendar.accountEmail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                // Opens OAuth calendar connection flow (future: Google / Outlook scope).
            } label: {
                Label("Connect calendar", systemImage: "calendar.badge.plus")
            }
        } header: {
            Text("Connected Calendars")
        } footer: {
            Text("Only selected calendars generate T-5 meeting briefs. No calendar data is sent to Slack.")
                .font(.caption)
        }
    }

    // MARK: - Notification privacy section

    private var notificationPrivacySection: some View {
        Section {
            Picker("Notification preview", selection: Binding(
                get: { privacyLevel },
                set: { privacyLevelRaw = $0.rawValue }
            )) {
                Text("Generic (no detail on lock screen)")
                    .tag(NotificationPrivacyLevel.generic)
                Text("Context (title + questions on lock screen)")
                    .tag(NotificationPrivacyLevel.privateContext)
            }
            .pickerStyle(.inline)
        } header: {
            Text("Notification Privacy")
        } footer: {
            Text("\"Generic\" shows only \"AURA notification\" until you unlock your device.")
                .font(.caption)
        }
    }

    // MARK: - Safety Guardian section

    private var safetyGuardianSection: some View {
        Section {
            Toggle("Safety Guardian", isOn: $safetyEnabled)

            if safetyEnabled {
                Stepper(
                    "Check-in window: \(safetyTimeoutSeconds)s",
                    value: $safetyTimeoutSeconds,
                    in: 10...60,
                    step: 5
                )

                Toggle("Share location with contacts", isOn: $shareLocation)
                    .disabled(!safetyEnabled)
            }
        } header: {
            Text("Safety Guardian")
        } footer: {
            // Non-negotiable disclaimer text from the implementation plan.
            Text("Safety Guardian is an opt-in check-in service. It responds to Apple-authorized HealthKit warning events and notifies approved contacts if you do not respond. It is NOT a medical device, does not diagnose emergencies, and does not replace Emergency SOS or professional medical care.")
                .font(.caption)
        }
    }

    // MARK: - Emergency contacts section

    private var emergencyContactsSection: some View {
        Section {
            if emergencyContacts.isEmpty {
                Text("No contacts added")
                    .foregroundStyle(.secondary)
                    .font(.footnote)
            } else {
                ForEach(emergencyContacts) { contact in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(contact.displayName)
                            .font(.body)
                        Text(contact.notificationHandle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .onDelete { indexSet in
                    emergencyContacts.remove(atOffsets: indexSet)
                }
            }

            Button {
                showAddContactSheet = true
            } label: {
                Label("Add emergency contact", systemImage: "person.crop.circle.badge.plus")
            }
            .disabled(!safetyEnabled)
        } header: {
            Text("Emergency Contacts")
        } footer: {
            Text("Contacts receive one check-in message per event. They are never stored in logs or sent to Slack.")
                .font(.caption)
        }
    }

    // MARK: - Account section

    private var accountSection: some View {
        Section {
            if apiClient.isSignedIn {
                if let uid = apiClient.userID {
                    LabeledContent("Signed in as", value: uid)
                        .font(.footnote)
                }

                Button(role: .destructive) {
                    showSignOutConfirmation = true
                } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .confirmationDialog(
                    "Sign out of AURA?",
                    isPresented: $showSignOutConfirmation,
                    titleVisibility: .visible
                ) {
                    Button("Sign out", role: .destructive) {
                        apiClient.signOut()
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("Your preferences are stored on-device and will not be lost.")
                }

            } else {
                Button {
                    guard let scene = UIApplication.shared.connectedScenes
                        .compactMap({ $0 as? UIWindowScene }).first,
                          let anchor = scene.windows.first(where: { $0.isKeyWindow })
                    else { return }

                    Task {
                        try? await apiClient.signIn(presentationAnchor: anchor)
                    }
                } label: {
                    Label("Sign in", systemImage: "person.badge.key")
                }
                .buttonStyle(.borderedProminent)
            }
        } header: {
            Text("Account")
        }
    }

    // MARK: - Add contact sheet

    private var addContactSheet: some View {
        NavigationStack {
            Form {
                Section("Contact details") {
                    TextField("Name", text: $newContactName)
                        .autocorrectionDisabled()

                    TextField("Phone / email / identifier", text: $newContactHandle)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .autocapitalization(.none)
                }

                Section {
                    // Privacy notice inline in the form.
                    Text("This contact will receive a single check-in SMS or push notification if AURA Safety Guardian cannot reach you. They are notified in advance that you added them.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Add Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        newContactName   = ""
                        newContactHandle = ""
                        showAddContactSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        guard !newContactName.isEmpty, !newContactHandle.isEmpty else { return }
                        let item = EmergencyContactItem(
                            displayName: newContactName,
                            notificationHandle: newContactHandle
                        )
                        emergencyContacts.append(item)
                        newContactName   = ""
                        newContactHandle = ""
                        showAddContactSheet = false
                    }
                    .disabled(newContactName.isEmpty || newContactHandle.isEmpty)
                }
            }
        }
    }
}

// MARK: - Supporting models (local UI only)

struct CalendarItem: Identifiable {
    let id: String
    var name: String
    var accountEmail: String
    var isEnabled: Bool

    static let sampleCalendars: [CalendarItem] = [
        CalendarItem(id: "cal-1", name: "Work", accountEmail: "user@company.com", isEnabled: true),
        CalendarItem(id: "cal-2", name: "Personal", accountEmail: "user@icloud.com", isEnabled: false)
    ]
}

struct EmergencyContactItem: Identifiable {
    let id: String = UUID().uuidString
    var displayName: String
    var notificationHandle: String
}

// MARK: - Preview

#if DEBUG
#Preview {
    CompanionSettingsView()
        .environmentObject(AuraAPIClient.shared)
        .environmentObject(iPhoneSessionManager.shared)
}
#endif
