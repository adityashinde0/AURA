"""Contract tests for WebSocket schemas in Project AURA.

Validates that WebSocket connect, relay, ack, and error payloads strictly conform
to their JSON schema specifications and that non-minimized or prohibited data is rejected.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "websocket"


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def test_websocket_connect_schema() -> None:
    schema = load_schema("connect_request.json")
    valid_payload = {
        "user_id": "usr_aditi_01",
        "tenant_id": "tenant_default",
        "device_id": "bee_pioneer_01",
        "auth_token": "token_bearer_valid_32_chars_long",
    }
    validate(instance=valid_payload, schema=schema)

    # Token too short must fail
    short_token = dict(valid_payload, auth_token="short")
    with pytest.raises(ValidationError):
        validate(instance=short_token, schema=schema)


def test_websocket_relay_envelope_schema() -> None:
    schema = load_schema("relay_envelope.json")
    valid_envelope = {
        "action": "relay",
        "event_id": "evt_bee_123",
        "event_type": "focus_signal",
        "timestamp": 1791100000.0,
        "user_id": "usr_aditi_01",
        "session_id": "sess_001",
        "source": "bee_local",
        "evidence": [{"id": "evt_001", "snippet": "Studying AWS system design"}],
        "signal_payload": {
            "explicit_signal": "self_report_distracted",
            "consented_signal_score": 0.8,
            "app": "YouTube",
        },
    }
    validate(instance=valid_envelope, schema=schema)

    # Missing action must fail
    invalid_envelope = dict(valid_envelope)
    del invalid_envelope["action"]
    with pytest.raises(ValidationError):
        validate(instance=invalid_envelope, schema=schema)

    # Evidence overflow (>5 items) must fail
    overflow = dict(valid_envelope)
    overflow["evidence"] = [{"id": f"e{i}", "snippet": "s"} for i in range(6)]
    with pytest.raises(ValidationError):
        validate(instance=overflow, schema=schema)


def test_websocket_relay_acknowledgement_schema() -> None:
    schema = load_schema("relay_acknowledgement.json")
    valid_ack = {
        "ack_id": "ack_991823ab",
        "event_id": "evt_bee_123",
        "status": "accepted",
        "bus_message_id": "msg_001",
        "timestamp": 1791100001.0,
    }
    validate(instance=valid_ack, schema=schema)

    # Unknown status must fail
    invalid_ack = dict(valid_ack, status="pending")
    with pytest.raises(ValidationError):
        validate(instance=invalid_ack, schema=schema)


def test_websocket_error_response_schema() -> None:
    schema = load_schema("error_response.json")
    valid_error = {
        "error": "privacy_violation",
        "message": "Raw audio blob detected. Local redaction required.",
        "event_id": "evt_bad_01",
        "details": [{"field": "audio_blob", "issue": "prohibited_field"}],
        "timestamp": 1791100002.0,
    }
    validate(instance=valid_error, schema=schema)
