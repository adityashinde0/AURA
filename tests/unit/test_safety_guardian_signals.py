"""Unit tests for Safety Guardian health signals (Apple Watch HK Events & Orbit BLE) — Sub-Task 9."""
from __future__ import annotations

import importlib
import json
import time
import pytest

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_safety_escalate = _cp.handle_safety_escalate
handle_safety_cancel = _cp.handle_safety_cancel


@pytest.fixture
def store_with_consent() -> InMemoryDataStore:
    store = InMemoryDataStore()
    store.grants["grant_sg_test"] = {
        "grant_id": "grant_sg_test",
        "user_id": "usr_safety_signal_01",
        "action_type": "safety_guardian",
        "scope": "allow_always",
        "active": True,
    }
    return store


def test_safety_checkin_timeout_triggers_escalation(store_with_consent: InMemoryDataStore) -> None:
    """When a check-in is unacknowledged after timeout, escalation is dispatched to contacts."""
    payload = {
        "user_id": "usr_safety_signal_01",
        "incident_id": "inc_timeout_01",
        "reason": "timeout_no_response",
        "timestamp": int(time.time()),
    }
    resp = handle_safety_escalate(payload, store=store_with_consent)
    assert resp["statusCode"] == 200
    data = json.loads(resp["body"])
    assert data["status"] == "escalated"
    assert data["contacts_notified"] is True

    # Audit record contains category + timestamp only; zero raw health metrics
    esc_records = [r for r in store_with_consent.audit_records if r.get("category") == "safety_escalation"]
    assert len(esc_records) == 1
    assert "bpm" not in esc_records[0]
    assert "heart_rate" not in esc_records[0]


def test_timely_im_ok_cancels_escalation(store_with_consent: InMemoryDataStore) -> None:
    """A timely 'I'm OK' response cancels the pending escalation within the window."""
    user_id = "usr_safety_signal_01"
    incident_id = "inc_timely_ok_01"

    # User taps "I'm OK"
    cancel_resp = handle_safety_cancel({"user_id": user_id, "incident_id": incident_id}, store=store_with_consent)
    assert cancel_resp["statusCode"] == 200
    cancel_data = json.loads(cancel_resp["body"])
    assert cancel_data["status"] == "cancelled"

    # Audit record appended for cancellation
    cancel_records = [r for r in store_with_consent.audit_records if r.get("category") == "escalation_cancelled"]
    assert len(cancel_records) == 1

    # Escalation is prevented
    esc_resp = handle_safety_escalate({
        "user_id": user_id,
        "incident_id": incident_id,
        "reason": "timeout_no_response",
    }, store=store_with_consent)
    assert esc_resp["statusCode"] == 200
    esc_data = json.loads(esc_resp["body"])
    assert esc_data["status"] == "cancelled"
    assert esc_data["contacts_notified"] is False


def test_raw_bpm_telemetry_prohibited(store_with_consent: InMemoryDataStore) -> None:
    """Attempting to inject raw BPM into safety escalation is completely stripped and never audited."""
    payload = {
        "user_id": "usr_safety_signal_01",
        "incident_id": "inc_raw_bpm_01",
        "reason": "high_heart_rate_event",
        "raw_bpm": 155,  # Prohibited continuous telemetry
        "bpm": 155,
    }
    resp = handle_safety_escalate(payload, store=store_with_consent)
    assert resp["statusCode"] == 200

    # Ensure no raw telemetry appears in the audit record
    last_record = store_with_consent.audit_records[-1]
    assert "raw_bpm" not in last_record
    assert "bpm" not in last_record
