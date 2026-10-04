import importlib
import json
import pytest

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_create_grant = _cp.handle_create_grant
handle_focus_session = _cp.handle_focus_session
handle_get_grants = _cp.handle_get_grants
handle_query_audit = _cp.handle_query_audit
handle_revoke_grant = _cp.handle_revoke_grant
handle_undo_action = _cp.handle_undo_action
lambda_handler = _cp.lambda_handler


@pytest.fixture
def store() -> InMemoryDataStore:
    return InMemoryDataStore()


def test_create_and_get_consent_grant(store: InMemoryDataStore) -> None:
    body = {
        "user_id": "usr_aditi_01",
        "action_type": "request_pause",
        "scope": "allow_session",
        "target_allowlist": ["firetv_living_room"],
        "ttl_seconds": 3600,
    }
    create_resp = handle_create_grant(body, store=store)
    assert create_resp["statusCode"] == 201
    grant = json.loads(create_resp["body"])
    assert grant["user_id"] == "usr_aditi_01"
    assert grant["active"] is True
    grant_id = grant["grant_id"]

    # Get grants
    get_resp = handle_get_grants("usr_aditi_01", store=store)
    assert get_resp["statusCode"] == 200
    grants = json.loads(get_resp["body"])["grants"]
    assert len(grants) == 1
    assert grants[0]["grant_id"] == grant_id


def test_immediate_revocation(store: InMemoryDataStore) -> None:
    body = {
        "user_id": "usr_aditi_01",
        "action_type": "request_dnd",
        "scope": "allow_session",
    }
    create_resp = handle_create_grant(body, store=store)
    grant_id = json.loads(create_resp["body"])["grant_id"]

    revoke_resp = handle_revoke_grant(grant_id, "usr_aditi_01", store=store)
    assert revoke_resp["statusCode"] == 200
    revoked_body = json.loads(revoke_resp["body"])
    assert revoked_body["revoked"] is True

    # Active grants list is now empty (<60s effective revocation)
    get_resp = handle_get_grants("usr_aditi_01", store=store)
    grants = json.loads(get_resp["body"])["grants"]
    assert len(grants) == 0


def test_focus_session_lifecycle(store: InMemoryDataStore) -> None:
    start_body = {"user_id": "usr_aditi_01", "action": "start", "duration_minutes": 45}
    start_resp = handle_focus_session(start_body, store=store)
    assert start_resp["statusCode"] == 200
    session = json.loads(start_resp["body"])
    assert session["status"] == "active"
    session_id = session["session_id"]

    stop_body = {"user_id": "usr_aditi_01", "action": "stop", "session_id": session_id}
    stop_resp = handle_focus_session(stop_body, store=store)
    assert stop_resp["statusCode"] == 200
    stopped = json.loads(stop_resp["body"])
    assert stopped["status"] == "completed"


def test_undo_action_and_audit(store: InMemoryDataStore) -> None:
    # First record an action
    store.audit_records.append(
        {
            "action_id": "act_101",
            "user_id": "usr_aditi_01",
            "action_type": "request_pause",
            "target_device": "firetv_01",
            "status": "executed",
            "reason": "Paused video app",
            "undo_token": "token_reversal_123",
            "timestamp": 1791100000.0,
        }
    )

    undo_body = {"user_id": "usr_aditi_01", "undo_token": "token_reversal_123"}
    undo_resp = handle_undo_action(undo_body, store=store)
    assert undo_resp["statusCode"] == 200
    undo_data = json.loads(undo_resp["body"])
    assert undo_data["success"] is True

    # Check audit log shows the reversal
    audit_resp = handle_query_audit("usr_aditi_01", store=store)
    records = json.loads(audit_resp["body"])["records"]
    assert len(records) == 2
    assert any(r["status"] == "undone" for r in records)


def test_lambda_handler_http_routes(store: InMemoryDataStore) -> None:
    event = {
        "rawPath": "/api/v1/consent/grants",
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {"user_id": "usr_aditi_01"},
    }
    resp = lambda_handler(event, store_override=store)
    assert resp["statusCode"] == 200
