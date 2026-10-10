// apple/AURAiPhone/Views/AuditTimelineView.swift
import SwiftUI

public struct AuditTimelineView: View {
    @State private var records: [AuditRecordItem] = []
    @State private var isLoading: Bool = false
    private let apiService: AuraApiService = .shared

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading audit log...")
                } else if records.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "list.clipboard")
                            .font(.system(size: 44))
                            .foregroundStyle(.secondary)
                        Text("No actions logged yet")
                            .font(.headline)
                        Text("All focus interventions, briefings, and safety checks are recorded to an immutable audit trail.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                } else {
                    List(records) { record in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(record.actionType ?? record.category ?? "Action")
                                    .font(.headline)
                                Spacer()
                                Text(dateFormatted(record.timestamp))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                Text("ID: \(record.actionId)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                if let status = record.status {
                                    Text(status)
                                        .font(.caption2)
                                        .foregroundStyle(status == "escalation_failed" ? .red : .blue)
                                }
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .navigationTitle("Audit Timeline")
            .task {
                await loadRecords()
            }
            .refreshable {
                await loadRecords()
            }
        }
    }

    private func loadRecords() async {
        isLoading = true
        defer { isLoading = false }
        do {
            records = try await apiService.getAuditRecords(limit: 20)
        } catch {
            records = []
        }
    }

    private func dateFormatted(_ epoch: Double) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: Date(timeIntervalSince1970: epoch))
    }
}

#Preview {
    AuditTimelineView()
}
