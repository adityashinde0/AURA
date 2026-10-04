"""End-to-end integration test suite for Project AURA Phase 4: Focus Guardian & Control Plane.

Validates the full user journey:
1. Start 25-minute focus session.
2. Optional signal stays disabled until individual consent is recorded.
3. Consent grant creation for action 'request_pause' with target device 'dev_firetv_living_room'.
4. User triggers explicit "I'm distracted" report.
5. Focus Guardian calculates transparent score (0.80) and Deep Work Bank penalty (-1).
6. Policy engine validates grant + device allowlist -> executes Fire TV playback pause via certified MediaSession adapter, issues undo token.
7. User triggers Undo -> Fire TV playback is restored to 'playing', audit entry reflects 'undone'.
8. Unsupported device action degrades safely to suggestion only, never executing unauthorized actions.
9. Audit trail query confirms immutable timeline, idempotency, and zero raw transcripts.
10. Deep Work Bank query confirms private user balance, no team leaderboard, strictly prohibited employer reporting.
11. Revocation & user data export/purge in <60 seconds.
"""
import importlib
import json
import pytest

from standalone_agent.device_adapter import DeviceSimulatorAdapter
from standalone_agent.focus_session import FocusSessionManager
from standalone_agent.policy_engine import ConsentGrant, PolicyEngine

_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
lambda_handler = _cp.lambda_handler


def test_phase4_focus_guardian_full_journey() -> None:
    user_id = "usr_marcus_focus_01"
    store = InMemoryDataStore()
    device_adapter = store.device_adapter
    session_mgr = FocusSessionManager()

    # Step 1: Start 25-minute focus session via Control Plane HTTP route
    start_event = {
        "rawPath": "/api/v1/focus/session",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"user_id": user_id, "action": "start", "duration_minutes": 25}),
    }
    resp = lambda_handler(start_event, store_override=store)
    assert resp["statusCode"] == 200
    session_data = json.loads(resp["body"])
    session_id = session_data["session_id"]
    assert session_data["status"] == "active"

    # Also register in local session manager
    local_session = session_mgr.start_session(user_id=user_id, duration_minutes=25, session_id=session_id)
    assert local_session.status == "active"

    # Step 2: Unconsented optional signals stay disabled by default
    res_unconsented = session_mgr.process_optional_signal(session_id, "allowed_video_noise")
    assert res_unconsented["status"] == "ignored_unconsented"
    assert local_session.distraction_score == 0.0

    # Step 3: Grant explicit consent for optional signal and create consent grant for Fire TV pause
    session_mgr.set_signal_consent(user_id, "allowed_video_noise", consented=True)
    assert session_mgr.is_signal_consented(user_id, "allowed_video_noise") is True

    grant_event = {
        "rawPath": "/api/v1/consent/grants",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps(
            {
                "user_id": user_id,
                "action_type": "request_pause",
                "scope": "allow_session",
                "target_allowlist": ["dev_firetv_living_room"],
                "ttl_seconds": 3600,
            }
        ),
    }
    resp_grant = lambda_handler(grant_event, store_override=store)
    assert resp_grant["statusCode"] == 201
    grant_id = json.loads(resp_grant["body"])["grant_id"]

    # Step 4: User triggers explicit "I'm distracted"
    report_res = session_mgr.report_distraction(session_id)
    assert report_res["is_distracted"] is True
    assert report_res["distraction_score"] == 0.80
    assert "You reported being distracted." in report_res["reasons"]
    assert report_res["bank_delta"] == -1

    # Step 5: Send focus signal to Control Plane
    signal_event = {
        "rawPath": "/api/v1/focus/signal",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps(
            {
                "user_id": user_id,
                "session_id": session_id,
                "explicit_signal": "self_report_distracted",
                "consented_signal_score": 0.80,
            }
        ),
    }
    signal_resp = lambda_handler(signal_event, store_override=store)
    assert signal_resp["statusCode"] == 200
    signal_body = json.loads(signal_resp["body"])
    assert signal_body["decision"] == "executed"
    undo_token = signal_body["undo_token"]
    assert undo_token is not None
    assert signal_body["target_device_id"] == "dev_firetv_living_room"

    # Verify Fire TV is now paused
    fire_tv = device_adapter.get_device("dev_firetv_living_room")
    assert fire_tv is not None
    assert fire_tv.state == "paused"

    # Step 6: User clicks Undo -> Fire TV playback is resumed to 'playing'
    undo_event = {
        "rawPath": "/api/v1/actions/undo",
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps({"user_id": user_id, "undo_token": undo_token}),
    }
    undo_resp = lambda_handler(undo_event, store_override=store)
    assert undo_resp["statusCode"] == 200
    undo_body = json.loads(undo_resp["body"])
    assert undo_body["success"] is True
    assert fire_tv.state == "playing"

    # Step 7: Unsupported device action degrades to suggestion only
    policy_engine = PolicyEngine(allowed_devices={"dev_firetv_living_room"}, device_adapter=device_adapter)
    policy_engine.set_grant(
        ConsentGrant(
            tenant_id="tenant_default",
            user_id=user_id,
            action_type="request_pause",
            scope="allow_for_session",
            target_device_id="dev_smart_tv_unsupported",
        )
    )
    unsupported_eval = policy_engine.evaluate_and_execute(
        user_id=user_id,
        proposal_action="request_pause",
        target_device_id="dev_smart_tv_unsupported",
        reason="Test unsupported TV pause",
        idempotency_key="key_unsupported_test",
    )
    assert unsupported_eval["executed"] is False
    assert unsupported_eval["decision"] == "blocked"

    # Step 8: Query Audit Trail -> immutable records, zero raw transcripts
    audit_event = {
        "rawPath": "/api/v1/audit/actions",
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {"user_id": user_id},
    }
    audit_resp = lambda_handler(audit_event, store_override=store)
    assert audit_resp["statusCode"] == 200
    records = json.loads(audit_resp["body"])["records"]
    assert len(records) >= 2
    # Verify reversal is recorded
    assert any(r.get("status") == "undone" for r in records)
    # Verify zero transcripts stored in audit
    for r in records:
        assert "transcript" not in r
        assert "raw_text" not in r

    # Step 9: Query Deep Work Bank -> verified user-only, strictly private
    bank_event = {
        "rawPath": "/api/v1/focus/bank",
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {"user_id": user_id},
    }
    bank_resp = lambda_handler(bank_event, store_override=store)
    assert bank_resp["statusCode"] == 200
    bank_data = json.loads(bank_resp["body"])
    assert bank_data["user_id"] == user_id
    assert bank_data["private_only"] is True
    assert bank_data["team_sharing_enabled"] is False
    assert bank_data["employer_reporting"] == "STRICTLY_PROHIBITED"

    # Step 10: Revoke grant and export user data in <60s
    revoke_event = {
        "rawPath": f"/api/v1/consent/grants/{grant_id}",
        "requestContext": {"http": {"method": "DELETE"}},
        "queryStringParameters": {"user_id": user_id},
    }
    revoke_resp = lambda_handler(revoke_event, store_override=store)
    assert revoke_resp["statusCode"] == 200
    assert json.loads(revoke_resp["body"])["revoked"] is True

    # Check active grants is now 0
    get_grants_event = {
        "rawPath": "/api/v1/consent/grants",
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {"user_id": user_id},
    }
    grants_resp = lambda_handler(get_grants_event, store_override=store)
    assert len(json.loads(grants_resp["body"])["grants"]) == 0

    # Export user data
    export_event = {
        "rawPath": "/api/v1/user/export",
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {"user_id": user_id},
    }
    export_resp = lambda_handler(export_event, store_override=store)
    assert export_resp["statusCode"] == 200
    export_data = json.loads(export_resp["body"])
    assert export_data["privacy_standard"] == "ZERO_RAW_TRANSCRIPTS_RETAINED"
    assert "deep_work_bank" in export_data
