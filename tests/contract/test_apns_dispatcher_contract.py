"""Contract tests for APNs dispatch result JSON schema — Sub-Task 1."""
from __future__ import annotations

import importlib
import json
import time
from pathlib import Path

import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "pre_meeting"


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Helpers (mirrors test_apns_dispatcher.py setup, no shared imports)
# ---------------------------------------------------------------------------

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
apns_dispatcher = importlib.import_module("lambda.apns_dispatcher")
dispatch = apns_dispatcher.dispatch


class _MockHttpClient:
    def post_apns(self, push_token: str, payload: dict) -> dict:
        return {"provider": "apns", "status": "delivered"}

    def post_fcm(self, push_token: str, payload: dict) -> dict:
        return {"provider": "fcm", "status": "delivered"}


def _store_with_grant(user_id: str = "usr_contract_01") -> _cp.InMemoryDataStore:
    import uuid

    store = InMemoryDataStore()
    store.wearable_bindings[user_id] = {
        "user_id": user_id,
        "device_id": "dev_watch_c01",
        "push_token": "tok_contract_apns",
        "platform": "watchos",
        "active": True,
        "registered_at": time.time(),
    }
    now = time.time()
    store.grants["grant_c01"] = {
        "grant_id": "grant_c01",
        "user_id": user_id,
        "tenant_id": "tenant_default",
        "action_type": "pre_meeting_briefing",
        "scope": "allow_session",
        "target_allowlist": [],
        "active": True,
        "created_at": now,
        "expires_at": now + 86400,
    }
    return store


def _detail(user_id: str = "usr_contract_01", **overrides) -> dict:
    base = {
        "calendar_event_id": "cal_evt_contract_01",
        "user_id": user_id,
        "start_epoch": int(time.time()) + 300,
        "idempotency_key": "idem_contract_001",
        "meeting_title": "Contract Meeting",
        "is_quiet_hours": False,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Contract tests
# ---------------------------------------------------------------------------

class TestApnsDispatchResultSchema:
    """Validate that runtime responses always conform to the JSON schema."""

    def test_schema_is_loadable(self) -> None:
        schema = load_schema("apns_dispatch_result.json")
        assert schema["title"] == "ApnsDispatchResult"

    def test_successful_delivery_conforms(self) -> None:
        schema = load_schema("apns_dispatch_result.json")
        store = _store_with_grant()
        result = dispatch(_detail(), store, http_client=_MockHttpClient())
        validate(instance=result, schema=schema)

    def test_quiet_hours_suppressed_conforms(self) -> None:
        schema = load_schema("apns_dispatch_result.json")
        store = _store_with_grant()
        result = dispatch(_detail(is_quiet_hours=True), store, http_client=_MockHttpClient())
        validate(instance=result, schema=schema)

    def test_no_binding_conforms(self) -> None:
        schema = load_schema("apns_dispatch_result.json")
        store = InMemoryDataStore()
        import uuid, time as _time
        now = _time.time()
        store.grants["grant_nb"] = {
            "grant_id": "grant_nb",
            "user_id": "usr_contract_01",
            "tenant_id": "tenant_default",
            "action_type": "pre_meeting_briefing",
            "scope": "allow_session",
            "target_allowlist": [],
            "active": True,
            "created_at": now,
            "expires_at": now + 86400,
        }
        result = dispatch(_detail(), store, http_client=_MockHttpClient())
        validate(instance=result, schema=schema)

    def test_blocked_no_consent_conforms(self) -> None:
        schema = load_schema("apns_dispatch_result.json")
        store = InMemoryDataStore()  # no grants
        store.wearable_bindings["usr_contract_01"] = {
            "user_id": "usr_contract_01",
            "device_id": "dev_01",
            "push_token": "tok_123",
            "platform": "ios",
            "active": True,
            "registered_at": time.time(),
        }
        result = dispatch(_detail(), store, http_client=_MockHttpClient())
        validate(instance=result, schema=schema)

    def test_policy_required_always_true(self) -> None:
        """policy_required must be True in every schema-validated response."""
        schema = load_schema("apns_dispatch_result.json")
        store = _store_with_grant()

        for case_detail in [
            _detail(),
            _detail(is_quiet_hours=True),
            {},
        ]:
            result = dispatch(case_detail, store, http_client=_MockHttpClient())
            validate(instance=result, schema=schema)
            assert result["policy_required"] is True

    def test_schema_rejects_missing_policy_required(self) -> None:
        """A response without policy_required must fail schema validation."""
        schema = load_schema("apns_dispatch_result.json")
        bad_result = {
            "statusCode": 200,
            "decision": "executed",
            # policy_required intentionally omitted
        }
        with pytest.raises(ValidationError):
            validate(instance=bad_result, schema=schema)

    def test_schema_rejects_unknown_decision(self) -> None:
        """Unknown decision enum values must fail schema validation."""
        schema = load_schema("apns_dispatch_result.json")
        bad_result = {
            "statusCode": 200,
            "policy_required": True,
            "decision": "invented_decision_value",
        }
        with pytest.raises(ValidationError):
            validate(instance=bad_result, schema=schema)
