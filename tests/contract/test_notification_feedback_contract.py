"""Contract tests for the notification_feedback JSON schema — Sub-Task 3."""
from __future__ import annotations

import importlib
import json
import time
from pathlib import Path

import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "websocket"

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_notification_feedback = _cp.handle_notification_feedback


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _valid_request(action: str = "Read", **overrides) -> dict:
    base = {
        "user_id": "usr_contract_fb",
        "card_id": "card_contract_01",
        "calendar_event_id": "cal_evt_contract_01",
        "action": action,
    }
    base.update(overrides)
    return base


def _feedback_response(action: str = "Read", series_id: str | None = None) -> dict:
    store = InMemoryDataStore()
    body = _valid_request(action=action)
    if series_id:
        body["series_id"] = series_id
    resp = handle_notification_feedback(body, store=store)
    return json.loads(resp["body"])


# ---------------------------------------------------------------------------
# Schema loading
# ---------------------------------------------------------------------------

class TestNotificationFeedbackSchemaLoads:
    def test_schema_is_loadable(self) -> None:
        schema = load_schema("notification_feedback.json")
        assert schema["title"] == "NotificationFeedback"
        assert "definitions" in schema


# ---------------------------------------------------------------------------
# Request schema validation
# ---------------------------------------------------------------------------

class TestNotificationFeedbackRequestSchema:
    def test_valid_read_request_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        validate(instance=_valid_request("Read"), schema=schema)

    def test_valid_save_request_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        validate(instance=_valid_request("Save"), schema=schema)

    def test_valid_not_useful_request_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        validate(instance=_valid_request("Not useful"), schema=schema)

    def test_valid_mute_with_series_id_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        validate(
            instance=_valid_request("Mute this event series", series_id="series_01"),
            schema=schema,
        )

    def test_rejects_unknown_action(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        with pytest.raises(ValidationError):
            validate(instance=_valid_request("Dismiss"), schema=schema)

    def test_rejects_missing_user_id(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        body = _valid_request()
        del body["user_id"]
        with pytest.raises(ValidationError):
            validate(instance=body, schema=schema)

    def test_rejects_missing_card_id(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        body = _valid_request()
        del body["card_id"]
        with pytest.raises(ValidationError):
            validate(instance=body, schema=schema)

    def test_rejects_additional_properties(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["request"]
        body = _valid_request()
        body["unknown_field"] = "should_fail"
        with pytest.raises(ValidationError):
            validate(instance=body, schema=schema)


# ---------------------------------------------------------------------------
# Response schema validation
# ---------------------------------------------------------------------------

class TestNotificationFeedbackResponseSchema:
    def test_read_response_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        result = _feedback_response("Read")
        validate(instance=result, schema=schema)

    def test_save_response_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        result = _feedback_response("Save")
        validate(instance=result, schema=schema)

    def test_mute_response_conforms(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        result = _feedback_response("Mute this event series", series_id="series_contract_01")
        validate(instance=result, schema=schema)
        assert result["muted_series_count"] == 1

    def test_response_ok_is_always_true(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        for action in ("Read", "Save", "Not useful"):
            result = _feedback_response(action)
            validate(instance=result, schema=schema)
            assert result["ok"] is True

    def test_response_rejects_ok_false(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        bad = {
            "ok": False,
            "user_id": "usr",
            "card_id": "c",
            "action": "Read",
            "muted_series_count": 0,
            "audit_id": "fb_abc",
        }
        with pytest.raises(ValidationError):
            validate(instance=bad, schema=schema)

    def test_response_rejects_additional_properties(self) -> None:
        schema = load_schema("notification_feedback.json")["definitions"]["response"]
        result = _feedback_response("Read")
        result["extra_field"] = "should_fail"
        with pytest.raises(ValidationError):
            validate(instance=result, schema=schema)
