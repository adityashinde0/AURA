"""Contract tests for Slack OpenAPI 3.1 endpoints and DynamoDB SlackStatus entity in Project AURA (Phase 6).

Validates:
- OpenAPI 3.1 paths and JSON schema definitions for all Slack routes
- DynamoDB single-table key schema and TTL rules for SlackStatus
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
import yaml

OPENAPI_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "openapi.yaml"
DYNAMODB_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "dynamodb" / "table_schema.json"


@pytest.fixture(scope="module")
def openapi_spec() -> dict:
    with open(OPENAPI_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="module")
def dynamodb_spec() -> dict:
    with open(DYNAMODB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_openapi_slack_paths_defined(openapi_spec: dict) -> None:
    paths = openapi_spec.get("paths", {})
    assert "/api/v1/slack/oauth/authorize" in paths
    assert "/api/v1/slack/oauth/callback" in paths
    assert "/api/v1/slack/preview" in paths
    assert "/api/v1/slack/status" in paths
    assert "/api/v1/slack/workspaces" in paths
    assert "/api/v1/slack/admin-review" in paths

    # Verify HTTP methods
    assert "post" in paths["/api/v1/slack/oauth/authorize"]
    assert "post" in paths["/api/v1/slack/oauth/callback"]
    assert "get" in paths["/api/v1/slack/preview"]
    assert "post" in paths["/api/v1/slack/status"]
    assert "delete" in paths["/api/v1/slack/status"]
    assert "get" in paths["/api/v1/slack/workspaces"]
    assert "post" in paths["/api/v1/slack/admin-review"]


def test_openapi_slack_schemas_defined(openapi_spec: dict) -> None:
    schemas = openapi_spec.get("components", {}).get("schemas", {})
    assert "SlackOAuthAuthorizeResponse" in schemas
    assert "SlackOAuthCallbackRequest" in schemas
    assert "SlackOAuthCallbackResponse" in schemas
    assert "SlackPreviewResponse" in schemas
    assert "SlackStatusPublishRequest" in schemas
    assert "SlackStatusPublishResponse" in schemas
    assert "SlackAdminReviewRequest" in schemas


def test_slack_preview_response_schema(openapi_spec: dict) -> None:
    schema = openapi_spec["components"]["schemas"]["SlackPreviewResponse"]
    required = schema.get("required", [])
    assert "status_text" in required
    assert "status_emoji" in required
    assert "status_expiration" in required
    assert "zero_leakage_verified" in required
    assert "preview_rendered" in required


def test_slack_publish_response_schema(openapi_spec: dict) -> None:
    schema = openapi_spec["components"]["schemas"]["SlackStatusPublishResponse"]
    required = schema.get("required", [])
    assert "decision" in required
    assert "receipt_id" in required
    assert "undo_token" in required
    assert "target_channel" in required
    assert "zero_leakage_verified" in required


def test_dynamodb_slack_status_entity_schema(dynamodb_spec: dict) -> None:
    entities = dynamodb_spec.get("entities", {})
    assert "SlackStatus" in entities

    slack_spec = entities["SlackStatus"]
    pk_pattern = slack_spec["PK"]
    sk_pattern = slack_spec["SK"]

    pk_rendered = pk_pattern.format(workspace_id="T012345678", user_id="usr_marcus")
    sk_rendered = sk_pattern.format(timestamp="1791100000")

    assert pk_rendered == "WORKSPACE#T012345678#USER#usr_marcus"
    assert sk_rendered == "STATUS#1791100000"

    attrs = slack_spec["attributes"]
    assert "status_text" in attrs
    assert "status_emoji" in attrs
    assert "expires_at" in attrs
    assert "ttl" in attrs
