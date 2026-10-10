"""Unit tests for lambda/apns_dispatcher.py — Sub-Task 1.

All tests use InMemoryDataStore from lambda/control_plane.py.
No boto3 calls; network I/O is replaced by a MockHttpClient.
"""
from __future__ import annotations

import importlib
import time
from typing import Any
from unittest.mock import MagicMock

import pytest

# Import via importlib because 'lambda' is a Python keyword
apns_dispatcher = importlib.import_module("lambda.apns_dispatcher")
dispatch = apns_dispatcher.dispatch
lambda_handler = apns_dispatcher.lambda_handler

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class MockHttpClient:
    """Minimal HTTP mock that records push calls and returns configurable status."""

    def __init__(self, apns_status: str = "delivered", fcm_status: str = "delivered") -> None:
        self.apns_calls: list[tuple[str, dict]] = []
        self.fcm_calls: list[tuple[str, dict]] = []
        self._apns_status = apns_status
        self._fcm_status = fcm_status

    def post_apns(self, push_token: str, payload: dict) -> dict[str, Any]:
        self.apns_calls.append((push_token, payload))
        return {"provider": "apns", "status": self._apns_status}

    def post_fcm(self, push_token: str, payload: dict) -> dict[str, Any]:
        self.fcm_calls.append((push_token, payload))
        return {"provider": "fcm", "status": self._fcm_status}


def _store_with_grant(user_id: str = "usr_test_01") -> InMemoryDataStore:
    """Return a store pre-loaded with a wearable binding and a valid pre_meeting grant."""
    store = InMemoryDataStore()
    # Register wearable binding
    store.wearable_bindings[user_id] = {
        "user_id": user_id,
        "device_id": "dev_watch_01",
        "push_token": "tok_apns_abc123",
        "platform": "watchos",
        "active": True,
        "registered_at": time.time(),
    }
    # Add a valid consent grant for pre_meeting_briefing with allow_for_session scope
    import uuid
    now = time.time()
    store.grants[f"grant_{uuid.uuid4().hex[:8]}"] = {
        "grant_id": f"grant_{uuid.uuid4().hex[:8]}",
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


def _minimal_detail(user_id: str = "usr_test_01") -> dict[str, Any]:
    return {
        "calendar_event_id": "cal_evt_test_01",
        "user_id": user_id,
        "start_epoch": int(time.time()) + 300,
        "idempotency_key": "idem_test_001",
        "meeting_title": "Test Meeting",
        "is_quiet_hours": False,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestDispatchPolicyGate:
    """policy_required must be True in every response path."""

    def test_successful_delivery_returns_policy_required(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient()
        result = dispatch(_minimal_detail(), store, http_client=client)

        assert result["policy_required"] is True

    def test_blocked_no_consent_returns_policy_required(self) -> None:
        store = InMemoryDataStore()
        store.wearable_bindings["usr_test_01"] = {
            "user_id": "usr_test_01",
            "device_id": "dev_01",
            "push_token": "tok_123",
            "platform": "ios",
            "active": True,
            "registered_at": time.time(),
        }
        result = dispatch(_minimal_detail(), store, http_client=MockHttpClient())
        assert result["policy_required"] is True

    def test_quiet_hours_returns_policy_required(self) -> None:
        store = _store_with_grant()
        detail = _minimal_detail()
        detail["is_quiet_hours"] = True
        result = dispatch(detail, store, http_client=MockHttpClient())
        assert result["policy_required"] is True

    def test_invalid_input_returns_policy_required(self) -> None:
        store = InMemoryDataStore()
        result = dispatch({}, store)
        assert result["policy_required"] is True


class TestDispatchDelivery:
    """Tests for the happy-path delivery flow."""

    def test_delivers_to_watch_with_valid_grant(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient()
        result = dispatch(_minimal_detail(), store, http_client=client)

        assert result["decision"] == "executed"
        assert result["delivered"] is True
        assert result["platform"] == "watchos"
        assert len(client.apns_calls) == 1

    def test_push_token_used_correctly(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient()
        dispatch(_minimal_detail(), store, http_client=client)

        token_used, _ = client.apns_calls[0]
        assert token_used == "tok_apns_abc123"

    def test_android_fcm_path(self) -> None:
        store = _store_with_grant()
        # Override binding platform to android
        store.wearable_bindings["usr_test_01"]["platform"] = "android"
        client = MockHttpClient()
        result = dispatch(_minimal_detail(), store, http_client=client)

        assert result["platform"] == "android"
        assert len(client.fcm_calls) == 1
        assert len(client.apns_calls) == 0


class TestDispatchAuditRecord:
    """Audit entries must be appended for every outcome."""

    def test_successful_delivery_appends_audit(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient()
        result = dispatch(_minimal_detail(), store, http_client=client)

        audit = [r for r in store.audit_records if r.get("action_type") == "pre_meeting_briefing"]
        assert len(audit) >= 1
        latest = audit[-1]
        assert latest["user_id"] == "usr_test_01"
        assert latest["status"] == "delivered"
        # Store records use "action_id"; the returned result dict uses "audit_id"
        assert latest["action_id"] == result["audit_id"]

    def test_quiet_hours_suppressed_appends_audit(self) -> None:
        store = _store_with_grant()
        detail = _minimal_detail()
        detail["is_quiet_hours"] = True
        dispatch(detail, store, http_client=MockHttpClient())

        audit = [r for r in store.audit_records if r.get("status") == "quiet_hours_suppressed"]
        assert len(audit) == 1

    def test_no_binding_appends_audit(self) -> None:
        store = InMemoryDataStore()
        # Grant exists but no binding
        import uuid
        now = time.time()
        store.grants["g1"] = {
            "grant_id": "g1",
            "user_id": "usr_test_01",
            "tenant_id": "tenant_default",
            "action_type": "pre_meeting_briefing",
            "scope": "allow_session",
            "target_allowlist": [],
            "active": True,
            "created_at": now,
            "expires_at": now + 86400,
        }
        dispatch(_minimal_detail(), store, http_client=MockHttpClient())

        audit = [r for r in store.audit_records if r.get("status") == "no_device_binding"]
        assert len(audit) == 1

    def test_provider_failure_audit_status_delivery_failed(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient(apns_status="failed")
        result = dispatch(_minimal_detail(), store, http_client=client)

        assert result["delivered"] is False
        audit = [r for r in store.audit_records if r.get("action_type") == "pre_meeting_briefing"]
        assert audit[-1]["status"] == "delivery_failed"


class TestDispatchQuietHours:
    """Quiet hours suppression behaviour."""

    def test_quiet_hours_suppresses_delivery(self) -> None:
        store = _store_with_grant()
        detail = _minimal_detail()
        detail["is_quiet_hours"] = True
        client = MockHttpClient()
        result = dispatch(detail, store, http_client=client)

        assert result["decision"] == "quiet_hours_suppressed"
        assert result["delivered"] is False
        assert len(client.apns_calls) == 0

    def test_override_quiet_hours_delivers(self) -> None:
        store = _store_with_grant()
        detail = _minimal_detail()
        detail["is_quiet_hours"] = True
        detail["override_quiet_hours"] = True
        client = MockHttpClient()
        result = dispatch(detail, store, http_client=client)

        assert result["decision"] == "executed"
        assert result["delivered"] is True


class TestLambdaHandler:
    """lambda_handler wrapper tests."""

    def test_eventbridge_envelope_parsed(self) -> None:
        store = _store_with_grant()
        client = MockHttpClient()
        event = {
            "source": "aura.scheduler",
            "detail-type": "MeetingPrepTriggered",
            "detail": _minimal_detail(),
        }
        result = lambda_handler(event, store=store, http_client=client)
        assert result["policy_required"] is True
        assert result["decision"] == "executed"

    def test_invalid_json_body_returns_400(self) -> None:
        store = InMemoryDataStore()
        event = {"body": "not-valid-json{{{"}
        result = lambda_handler(event, store=store)
        assert result["statusCode"] == 400
        assert result["policy_required"] is True

    def test_missing_required_fields_returns_400(self) -> None:
        store = InMemoryDataStore()
        event = {"detail": {"user_id": "usr_01"}}  # missing calendar_event_id + start_epoch
        result = lambda_handler(event, store=store)
        assert result["statusCode"] == 400
        assert result["policy_required"] is True
