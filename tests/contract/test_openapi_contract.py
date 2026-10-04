"""Contract tests for Project AURA Cloud Intake OpenAPI specification.

Validates that schemas/openapi.yaml is well-formed and that sample API
requests and responses conform strictly to the defined component schemas.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
import yaml
from jsonschema import validate, ValidationError

OPENAPI_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "openapi.yaml"


@pytest.fixture(scope="module")
def openapi_spec() -> dict:
    with open(OPENAPI_PATH, "r", encoding="utf-8") as f:
        spec = yaml.safe_load(f)
    return spec


def test_openapi_spec_structure(openapi_spec: dict) -> None:
    assert openapi_spec.get("openapi") == "3.1.0"
    assert "info" in openapi_spec
    assert "paths" in openapi_spec
    assert "components" in openapi_spec
    paths = openapi_spec["paths"]
    assert "/api/v1/focus/signal" in paths
    assert "/api/v1/focus/session" in paths
    assert "/api/v1/consent/grants" in paths
    assert "/api/v1/consent/grants/{grantId}" in paths
    assert "/api/v1/audit/actions" in paths
    assert "/api/v1/actions/undo" in paths
    assert "/api/v1/calendar/events" in paths


def test_focus_signal_request_schema(openapi_spec: dict) -> None:
    schema = openapi_spec["components"]["schemas"]["FocusSignalRequest"]
    valid_payload = {
        "user_id": "usr_aditi_01",
        "session_id": "sess_20261004",
        "purpose": "focus_guardian",
        "explicit_signal": "self_report_distracted",
        "evidence": [{"id": "evt_001", "snippet": "Studying AWS system design"}],
        "consented_signal_score": 0.85,
    }
    validate(instance=valid_payload, schema=schema)

    # Missing user_id should fail
    invalid_payload = dict(valid_payload)
    del invalid_payload["user_id"]
    with pytest.raises(ValidationError):
        validate(instance=invalid_payload, schema=schema)


def test_focus_proposal_contract(openapi_spec: dict) -> None:
    schema = openapi_spec["components"]["schemas"]["FocusProposal"]
    valid_proposal = {
        "prep_summary": "Placement mentoring session on AWS system design starts in 5 minutes.",
        "3_questions": [
            "What architecture topic needs clarification?",
            "What are your key gaps?",
            "What is the follow-up goal?",
        ],
        "emotion_tone": "confident",
        "is_distracted": False,
        "distraction_score": 0.1,
        "deep_work_bank_delta": 2,
        "evidence_ids": ["evt_001"],
        "recommended_action": "none",
        "reason": "Clear intention established with no conflicting distractions.",
    }
    validate(instance=valid_proposal, schema=schema)

    # Invalid emotion tone should fail
    invalid_proposal = dict(valid_proposal)
    invalid_proposal["emotion_tone"] = "panicked"
    with pytest.raises(ValidationError):
        validate(instance=invalid_proposal, schema=schema)


def test_consent_grant_schemas(openapi_spec: dict) -> None:
    req_schema = openapi_spec["components"]["schemas"]["CreateConsentGrantRequest"]
    grant_schema = openapi_spec["components"]["schemas"]["ConsentGrant"]

    create_req = {
        "user_id": "usr_marcus_02",
        "action_type": "request_pause",
        "scope": "allow_session",
        "target_allowlist": ["firetv_living_room"],
        "ttl_seconds": 3600,
    }
    validate(instance=create_req, schema=req_schema)

    grant = {
        "grant_id": "grant_abc123",
        "user_id": "usr_marcus_02",
        "tenant_id": "tenant_default",
        "action_type": "request_pause",
        "scope": "allow_session",
        "target_allowlist": ["firetv_living_room"],
        "active": True,
        "created_at": 1791100000.0,
        "expires_at": 1791103600.0,
    }
    validate(instance=grant, schema=grant_schema)


def test_audit_record_schema(openapi_spec: dict) -> None:
    schema = openapi_spec["components"]["schemas"]["AuditRecord"]
    audit_record = {
        "action_id": "act_99182",
        "user_id": "usr_aditi_01",
        "action_type": "request_pause",
        "target_device": "firetv_study",
        "status": "executed",
        "reason": "Paused video app upon explicit user distraction report",
        "undo_token": "undo_token_secret_xyz",
        "timestamp": 1791100200.0,
    }
    validate(instance=audit_record, schema=schema)
