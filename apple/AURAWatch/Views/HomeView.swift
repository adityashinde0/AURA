// apple/AURAWatch/Views/HomeView.swift
import SwiftUI

public struct HomeView: View {
    @ObservedObject var connectivity: WatchConnectivityManager = .shared
    @State private var showPrepSheet: Bool = false
    @State private var showFocusActive: Bool = false
    @State private var showSafetySheet: Bool = false
    @State private var countdownMinutes: Int = 5

    public init() {}

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("AURA")
                        .font(.headline)
                        .foregroundStyle(.tint)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Next: Sprint Defense")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text("in \(countdownMinutes) min")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)

                    Divider()

                    VStack(spacing: 6) {
                        Button {
                            showPrepSheet = true
                        } label: {
                            Label("View Prep", systemImage: "doc.text.magnifyingglass")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.blue)

                        Button {
                            connectivity.sendCommand(.focusStart, payload: ["duration": "25"])
                            showFocusActive = true
                        } label: {
                            Label("Start Focus", systemImage: "brain.head.profile")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.indigo)

                        Button {
                            connectivity.sendCommand(.distractionReported, payload: ["reason": "self_report"])
                        } label: {
                            Label("I'm distracted", systemImage: "exclamationmark.triangle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.orange)
                    }
                }
                .padding(.horizontal, 6)
            }
            .navigationTitle("Home")
            .sheet(isPresented: $showPrepSheet) {
                if let card = connectivity.latestWhisperCard {
                    MeetingPrepView(card: card)
                } else {
                    MeetingPrepView(card: FixtureData.sampleCard)
                }
            }
            .sheet(isPresented: $showFocusActive) {
                FocusGuardianView(session: FixtureData.sampleFocusSession)
            }
            .fullScreenCover(isPresented: $showSafetySheet) {
                SafetyCheckinView()
            }
        }
    }
}

#Preview {
    HomeView()
}
