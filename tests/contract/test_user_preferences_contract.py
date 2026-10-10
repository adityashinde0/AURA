"""Contract tests for User Preferences schema — Sub-Task 10."""
from __future__ import annotations

import importlib
import json
from pathlib import Path

import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "websocket"

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_get_preferences = _cp.handle_get_preferences
handle_update_preferences = _cp.handle_update_preferences


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


class TestUserPreferencesContract:
    def test_schema_loads_correctly(self) -> None:
        schema = load_schema("user_preferences.json")
        assert schema["title"] == "UserPreferences"
        assert schema.get("additionalProperties") is False
        props = schema["properties"]["preferences"]["properties"]
        assert "pre_meeting_enabled" in props
        assert "notification_preview" in props
        assert "focus_action_scope" in props
        assert "slack_status_enabled" in props
        assert "safety_guardian_enabled" in props
        assert "location_in_sos" in props
        # Assert no sensitive fields permitted
        assert "contacts" not in props
        assert "phone_numbers" not in props

    def test_get_preferences_conforms_to_schema(self) -> None:
        schema = load_schema("user_preferences.json")
        store = InMemoryDataStore()
        resp = handle_get_preferences("usr_contract_pref_01", store=store)
        body = json.loads(resp["body"])
        validate(instance=body, schema=schema)
        assert body["preferences"]["notification_preview"] == "generic"

    def test_update_preferences_conforms_to_schema(self) -> None:
        schema = load_schema("user_preferences.json")
        store = InMemoryDataStore()
        resp = handle_update_preferences({
            "user_id": "usr_contract_pref_02",
            "preferences": {
                "pre_meeting_enabled": True,
                "notification_preview": "private_context",
                "focus_action_scope": "this_session",
            }
        }, store=store)
        body = json.loads(resp["body"])
        validate(instance=body, schema=schema)
        assert body["ok"] is True
        assert body["preferences"]["pre_meeting_enabled"] is True

    def test_rejects_leakage_of_sensitive_fields(self) -> None:
        schema = load_schema("user_preferences.json")
        leaked_payload = {
            "user_id": "usr_contract_pref_03",
            "preferences": {
                "pre_meeting_enabled": False,
                "notification_preview": "generic",
                "focus_action_scope": "ask_every_time",
                "slack_status_enabled": False,
                "safety_guardian_enabled": False,
                "location_in_sos": "ask_each_time",
                "emergency_contacts": ["+15551234567"],  # Prohibited!
            }
        }
        with pytest.raises(ValidationError):
            validate(instance=leaked_payload, schema=schema)
