"""Contract tests for EventBridge schemas in Project AURA.

Validates that events emitted to aura-event-bus (FocusSignalDetected and MeetingPrepTriggered)
conform strictly to JSON schemas and uphold least-privilege data containment.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "eventbridge"


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def test_focus_signal_eventbridge_schema() -> None:
    schema = load_schema("focus_signal_event.json")
    valid_event = {
        "source": "aura.companion",
        "detail-type": "FocusSignalDetected",
        "resources": ["arn:aws:events:us-east-1:123456789012:event-bus/aura-event-bus"],
        "detail": {
            "event_id": "evt_focus_01",
            "user_id": "usr_aditi_01",
            "session_id": "sess_morning_prep",
            "timestamp": 1791100000.0,
            "explicit_signal": "self_report_distracted",
            "consented_signal_score": 0.8,
            "evidence": [{"id": "evt_001", "snippet": "Aditi: AWS system design session"}],
            "idempotency_key": "usr_aditi_01:evt_focus_01",
        },
    }
    validate(instance=valid_event, schema=schema)

    # Wrong source must fail
    invalid_event = dict(valid_event, source="unknown.source")
    with pytest.raises(ValidationError):
        validate(instance=invalid_event, schema=schema)


def test_meeting_prep_eventbridge_schema() -> None:
    schema = load_schema("meeting_prep_event.json")
    valid_event = {
        "source": "aura.scheduler",
        "detail-type": "MeetingPrepTriggered",
        "detail": {
            "calendar_event_id": "cal_evt_77281",
            "user_id": "usr_aditi_01",
            "start_epoch": 1791103600,
            "idempotency_key": "usr_aditi_01:cal_evt_77281:1791103600",
            "meeting_title_hash": "sha256_ab90c128e",
            "evidence_ids": ["evt_001", "evt_004"],
        },
    }
    validate(instance=valid_event, schema=schema)

    # Missing idempotency_key must fail
    invalid_detail = dict(valid_event["detail"])
    del invalid_detail["idempotency_key"]
    invalid_event = dict(valid_event, detail=invalid_detail)
    with pytest.raises(ValidationError):
        validate(instance=invalid_event, schema=schema)
