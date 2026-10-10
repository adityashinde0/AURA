"""Contract tests for Safety Escalation Result schema — Sub-Task 6 & Sub-Task 9."""
from __future__ import annotations

import importlib
import json
import time
from pathlib import Path

import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "eventbridge"

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_safety_escalate = _cp.handle_safety_escalate
handle_safety_cancel = _cp.handle_safety_cancel


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


class TestSafetyEscalationResultSchema:
    def test_schema_loads_and_has_no_raw_bpm(self) -> None:
        schema = load_schema("safety_escalation_result.json")
        assert schema["title"] == "AuraSafetyEscalationResult"
        # Assert NO field for raw BPM / heart rate values exists
        properties = schema.get("properties", {})
        assert "bpm" not in properties
        assert "heart_rate" not in properties
        assert "raw_bpm" not in properties
        assert "telemetry" not in properties
        assert schema.get("additionalProperties") is False

    def test_successful_escalation_conforms(self) -> None:
        schema = load_schema("safety_escalation_result.json")
        store = InMemoryDataStore()
        store.grants["grant_sg_test"] = {
            "grant_id": "grant_sg_test",
            "user_id": "usr_contract_sg",
            "action_type": "safety_guardian",
            "scope": "allow_always",
            "active": True,
        }
        resp = handle_safety_escalate({
            "user_id": "usr_contract_sg",
            "incident_id": "inc_contract_01",
            "reason": "sos",
        }, store=store)
        body = json.loads(resp["body"])
        validate(instance=body, schema=schema)
        assert body["status"] == "escalated"
        assert body["contacts_notified"] is True

    def test_cancelled_escalation_conforms(self) -> None:
        schema = load_schema("safety_escalation_result.json")
        store = InMemoryDataStore()
        store.grants["grant_sg_test"] = {
            "grant_id": "grant_sg_test",
            "user_id": "usr_contract_sg",
            "action_type": "safety_guardian",
            "scope": "allow_always",
            "active": True,
        }
        # Cancel first
        handle_safety_cancel({
            "user_id": "usr_contract_sg",
            "incident_id": "inc_contract_02",
        }, store=store)

        resp = handle_safety_escalate({
            "user_id": "usr_contract_sg",
            "incident_id": "inc_contract_02",
            "reason": "timeout",
        }, store=store)
        body = json.loads(resp["body"])
        validate(instance=body, schema=schema)
        assert body["status"] == "cancelled"
        assert body["contacts_notified"] is False

    def test_rate_limited_escalation_conforms(self) -> None:
        schema = load_schema("safety_escalation_result.json")
        store = InMemoryDataStore()
        store.grants["grant_sg_test"] = {
            "grant_id": "grant_sg_test",
            "user_id": "usr_contract_sg",
            "action_type": "safety_guardian",
            "scope": "allow_always",
            "active": True,
        }
        # First
        handle_safety_escalate({
            "user_id": "usr_contract_sg",
            "incident_id": "inc_contract_03",
            "reason": "sos",
        }, store=store)
        # Second within rate-limit
        resp = handle_safety_escalate({
            "user_id": "usr_contract_sg",
            "incident_id": "inc_contract_03",
            "reason": "sos",
        }, store=store)
        body = json.loads(resp["body"])
        validate(instance=body, schema=schema)
        assert body["status"] == "escalated"
        assert body.get("rate_limited") is True

    def test_rejects_raw_bpm_injection(self) -> None:
        schema = load_schema("safety_escalation_result.json")
        bad_payload = {
            "status": "escalated",
            "incident_id": "inc_contract_04",
            "contacts_notified": True,
            "raw_bpm": 142,  # prohibited by policy & schema
        }
        with pytest.raises(ValidationError):
            validate(instance=bad_payload, schema=schema)
