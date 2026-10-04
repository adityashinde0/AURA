"""Contract tests for DynamoDB single-table schema in Project AURA.

Validates single-table key structures, TTL attributes, and entity models
documented in schemas/dynamodb/table_schema.json.
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest

SCHEMA_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "dynamodb" / "table_schema.json"


@pytest.fixture(scope="module")
def table_spec() -> dict:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_dynamodb_entities_defined(table_spec: dict) -> None:
    entities = table_spec.get("entities", {})
    assert "ConsentGrant" in entities
    assert "MeetingContext" in entities
    assert "GraphEdge" in entities
    assert "FocusSession" in entities
    assert "ActionAudit" in entities
    assert "SlackStatus" in entities


def test_consent_grant_key_pattern(table_spec: dict) -> None:
    grant_spec = table_spec["entities"]["ConsentGrant"]
    tenant_id = "tenant_xyz"
    user_id = "usr_001"
    action_type = "request_pause"

    pk = grant_spec["PK"].format(tenant_id=tenant_id, user_id=user_id)
    sk = grant_spec["SK"].format(action_type=action_type)

    assert pk == "TENANT#tenant_xyz#USER#usr_001"
    assert sk == "GRANT#request_pause"


def test_meeting_context_ttl_pattern(table_spec: dict) -> None:
    meeting_spec = table_spec["entities"]["MeetingContext"]
    user_id = "usr_001"
    calendar_event_id = "cal_99"
    version = "1"

    pk = meeting_spec["PK"].format(user_id=user_id)
    sk = meeting_spec["SK"].format(calendar_event_id=calendar_event_id, version=version)

    assert pk == "USER#usr_001"
    assert sk == "EVENT#cal_99#V#1"
    assert "ttl" in meeting_spec["attributes"]


def test_action_audit_key_pattern(table_spec: dict) -> None:
    audit_spec = table_spec["entities"]["ActionAudit"]
    pk = audit_spec["PK"].format(tenant_id="tenant_01", user_id="usr_001")
    sk = audit_spec["SK"].format(timestamp="1791100000", action_id="act_01")
    gsi1pk = audit_spec["GSI1PK"].format(user_id="usr_001", action_type="request_pause")
    gsi1sk = audit_spec["GSI1SK"].format(timestamp="1791100000")

    assert pk == "TENANT#tenant_01#USER#usr_001"
    assert sk == "AUDIT#1791100000#act_01"
    assert gsi1pk == "USER#usr_001#ACTION_TYPE#request_pause"
    assert gsi1sk == "AUDIT#1791100000"
