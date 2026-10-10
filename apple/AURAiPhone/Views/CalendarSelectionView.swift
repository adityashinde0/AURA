// apple/AURAiPhone/Views/CalendarSelectionView.swift
import SwiftUI

public struct ConnectedCalendar: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let source: String
    public var isOptedIn: Bool
}

public struct CalendarSelectionView: View {
    @State private var calendars: [ConnectedCalendar] = [
        ConnectedCalendar(id: "cal_work", name: "Work Calendar (Google)", source: "Google Workspace", isOptedIn: true),
        ConnectedCalendar(id: "cal_team", name: "Engineering Sprint (Outlook)", source: "Microsoft 365", isOptedIn: true),
        ConnectedCalendar(id: "cal_personal", name: "Personal (Apple Calendar)", source: "iCloud", isOptedIn: false)
    ]

    public init() {}

    public var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Pre-meeting briefing cards (T-5) are generated only for events from calendars you explicitly opt into here.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Connected Calendars") {
                    ForEach($calendars) { $cal in
                        Toggle(isOn: $cal.isOptedIn) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(cal.name)
                                    .font(.body)
                                Text(cal.source)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Calendar Access")
        }
    }
}

#Preview {
    CalendarSelectionView()
}
