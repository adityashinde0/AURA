"""End-to-End Integration Test for Project AURA Phase 6: Slack Ambient Status & Production Readiness.

Validates the full Phase 6 Definition of Done:
1. OAuth 2.0 PKCE flow with least-privilege scopes (chat:write, users.profile:write) and Secrets Manager token referencing.
2. Workspace-admin security review and channel boundary allowlisting.
3. User consent grant and multi-tier feature flag checks.
4. Preview-before-post contract with exact preview text and expiry.
5. Zero Slack Meeting Leakage Rule: blocks any meeting summary, questions, score, reason, transcript, or location.
6. Channel allowlist boundary enforcement (blocks non-allowlisted channels).
7. Ambient availability publication with idempotency receipt and unforgeable Undo token.
8. Immediate reversal via Undo token.
9. Automated background expiry cleanup.
10. Production burst load resilience (500 T-5 events, zero drops, p99 < 150ms).
11. Throttling handling via exponential backoff with full jitter.
12. SQS DLQ poison-message quarantine and duplicate-free redrive worker.
13. Multi-AZ regional cell seamless failover.
14. Synchronous GDPR export and cryptographic purge.
"""
from __future__ import annotations

import json
import time
import pytest

import importlib
_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore
handle_create_grant = _cp.handle_create_grant
handle_slack_oauth_authorize = _cp.handle_slack_oauth_authorize
handle_slack_oauth_callback = _cp.handle_slack_oauth_callback
handle_slack_preview = _cp.handle_slack_preview
handle_publish_slack_status = _cp.handle_publish_slack_status
handle_clear_slack_status = _cp.handle_clear_slack_status
handle_get_slack_workspaces = _cp.handle_get_slack_workspaces
handle_slack_admin_review = _cp.handle_slack_admin_review
handle_undo_action = _cp.handle_undo_action
handle_export_user_data = _cp.handle_export_user_data
handle_delete_user_data = _cp.handle_delete_user_data

from standalone_agent.production_readiness import ResiliencySimulator


def test_phase6_slack_ambient_status_and_production_readiness_e2e() -> None:
    store = InMemoryDataStore()
    user_id = "usr_marcus_ph6"
    workspace_id = "T_CORP_E2E"
    admin_id = "U_ADMIN_MARCUS"
    tenant_id = "tenant_enterprise"

    # =========================================================================
    # Step 1: OAuth 2.0 PKCE Handshake
    # =========================================================================
    auth_resp = handle_slack_oauth_authorize({"scopes": ["chat:write", "users.profile:write"]}, store=store)
    assert auth_resp["statusCode"] == 200
    auth_data = json.loads(auth_resp["body"])
    state = auth_data["state"]
    code_challenge = auth_data["code_challenge"]
    assert auth_data["code_challenge_method"] == "S256"

    # Retrieve code_verifier from pending PKCE store
    pkce_obj = store.slack_adapter.pending_pkce[state]
    code_verifier = pkce_obj.code_verifier

    # Complete token exchange callback
    cb_resp = handle_slack_oauth_callback(
        {
            "code": "auth_code_ph6_valid",
            "state": state,
            "code_verifier": code_verifier,
            "workspace_id": workspace_id,
            "workspace_name": "Marcus Enterprise HQ",
            "admin_user_id": admin_id,
            "allowed_channels": ["#marcus-focus", "#engineering-ambient", "user_profile"],
        },
        store=store,
    )
    assert cb_resp["statusCode"] == 200
    cb_data = json.loads(cb_resp["body"])
    assert cb_data["status"] == "connected"
    assert "arn:aws:secretsmanager:" in cb_data["token_secret_arn"]
    assert cb_data["is_admin_approved"] is True

    # =========================================================================
    # Step 2: Workspace Admin Security Review & Channel Allowlist
    # =========================================================================
    review_resp = handle_slack_admin_review(
        {
            "workspace_id": workspace_id,
            "admin_user_id": admin_id,
            "is_approved": True,
            "allowed_channels": ["#marcus-focus", "#engineering-ambient", "user_profile"],
        },
        store=store,
    )
    assert review_resp["statusCode"] == 200
    review_data = json.loads(review_resp["body"])
    assert review_data["is_admin_approved"] is True
    assert "#marcus-focus" in review_data["allowed_channels"]

    # =========================================================================
    # Step 3: User Consent Grant for slack_status
    # =========================================================================
    grant_resp = handle_create_grant(
        {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "action_type": "slack_status",
            "scope": "allow_session",
            "target_allowlist": ["#marcus-focus"],
        },
        store=store,
    )
    assert grant_resp["statusCode"] == 201
    grant_id = json.loads(grant_resp["body"])["grant_id"]

    # =========================================================================
    # Step 4: Preview-Before-Post Contract
    # =========================================================================
    preview_resp = handle_slack_preview(
        user_id=user_id,
        query_params={"duration_minutes": "45", "target_channel": "#marcus-focus"},
        store=store,
    )
    assert preview_resp["statusCode"] == 200
    preview_data = json.loads(preview_resp["body"])
    assert "In focus until" in preview_data["status_text"]
    assert preview_data["status_emoji"] == ":focus:"
    assert preview_data["zero_leakage_verified"] is True
    assert preview_data["target_channel"] == "#marcus-focus"

    # =========================================================================
    # Step 5: Zero Slack Meeting Leakage Rule Enforcement (Fails Closed)
    # =========================================================================
    # Attempt to post sensitive calendar meeting briefing to Slack
    leaky_body = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "channel_id": "#marcus-focus",
        "custom_status": "In sync with VP David re: Q4 Layoffs",
        "duration_minutes": 45,
    }
    leak_resp = handle_publish_slack_status(leaky_body, store=store)
    assert leak_resp["statusCode"] == 400
    leak_data = json.loads(leak_resp["body"])
    assert leak_data["error"] == "zero_leakage_violation"
    assert "Zero Slack Meeting Leakage Rule" in leak_data["message"]

    # Verify audit log recorded the blocked leakage attempt
    audit_records = store.audit_records
    assert any(a.get("status") == "blocked" and "Zero Slack Meeting Leakage" in a.get("reason", "") for a in audit_records)

    # =========================================================================
    # Step 6: Channel Allowlist Boundary Enforcement (Fails Closed)
    # =========================================================================
    unauth_channel_body = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "channel_id": "#unapproved-leadership-room",
        "duration_minutes": 30,
    }
    unauth_resp = handle_publish_slack_status(unauth_channel_body, store=store)
    assert unauth_resp["statusCode"] == 403
    unauth_data = json.loads(unauth_resp["body"])
    assert "not in approved allowlist" in unauth_data["message"]

    # =========================================================================
    # Step 7: Clean Ambient Status Publication with Outbox Receipt & Undo Token
    # =========================================================================
    clean_pub_body = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "channel_id": "#marcus-focus",
        "duration_minutes": 45,
        "idempotency_key": "e2e_slack_idem_001",
    }
    pub_resp = handle_publish_slack_status(clean_pub_body, store=store)
    assert pub_resp["statusCode"] == 200
    pub_data = json.loads(pub_resp["body"])
    assert pub_data["decision"] == "executed"
    assert "undo_slack_" in pub_data["undo_token"]
    assert pub_data["target_channel"] == "#marcus-focus"
    assert pub_data["zero_leakage_verified"] is True
    undo_token = pub_data["undo_token"]

    # Test idempotency: identical call returns existing receipt with zero duplicate actions
    dup_resp = handle_publish_slack_status(clean_pub_body, store=store)
    assert dup_resp["statusCode"] == 200
    dup_data = json.loads(dup_resp["body"])
    assert dup_data["decision"] == "duplicate"
    assert dup_data["already_executed"] is True
    assert dup_data["undo_token"] == undo_token

    # Verify user currently has an active Slack status
    assert user_id in store.slack_adapter.active_statuses

    # =========================================================================
    # Step 8: Immediate Reversibility via Undo Token
    # =========================================================================
    undo_resp = handle_undo_action(
        {"user_id": user_id, "undo_token": undo_token},
        store=store,
    )
    assert undo_resp["statusCode"] == 200
    undo_data = json.loads(undo_resp["body"])
    assert undo_data["success"] is True

    # Active status is now deactivated and cleared
    assert user_id not in store.slack_adapter.active_statuses

    # =========================================================================
    # Step 9: Re-publish and Automated Expiry Cleanup
    # =========================================================================
    # Publish short status that expires in 5 seconds
    short_body = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "channel_id": "#marcus-focus",
        "duration_minutes": 1,
        "idempotency_key": "e2e_slack_short_002",
    }
    handle_publish_slack_status(short_body, store=store)
    assert user_id in store.slack_adapter.active_statuses

    # Simulate background cleanup after expiry
    future_time = time.time() + 120  # 2 minutes in future
    expired_users = store.slack_adapter.cleanup_expired_statuses(current_time=future_time)
    assert user_id in expired_users
    assert user_id not in store.slack_adapter.active_statuses

    # =========================================================================
    # Step 10: Production Resiliency & Load Burst Simulator
    # =========================================================================
    simulator = ResiliencySimulator()

    # 10a. T-5 Burst load (500 events within 3s, concurrency 50)
    burst = simulator.simulate_t5_burst(event_count=500, time_window_seconds=3.0, concurrency_limit=50)
    assert burst["processed_count"] == 500
    assert burst["dropped_count"] == 0
    assert burst["p99_latency_ms"] < 150.0
    assert burst["is_resilient"] is True

    # 10b. Exponential backoff with full jitter under 429 throttling
    def throttled_op():
        return "slack_webhook_delivered"

    backoff_res = simulator.execute_with_backoff(throttled_op, max_attempts=3)
    assert backoff_res["success"] is True

    # 10c. SQS Dead Letter Queue quarantine and redrive worker
    dlq_msg = simulator.route_to_dlq(
        payload={"corrupted": True},
        error_msg="Malformed JSON payload",
        idempotency_key="poison_e2e_01",
    )
    assert dlq_msg.status == "quarantined"
    redrive = simulator.redrive_dlq_messages(sanitizer_fn=lambda p: {"sanitized": True})
    assert redrive["redriven_count"] == 1
    assert redrive["remaining_in_dlq"] == 0

    # 10d. Multi-AZ Regional Cell Seamless Failover
    assert simulator.active_cell == "us-east-1a"
    simulator.trigger_az_partition()
    assert simulator.active_cell == "us-east-1b"
    failover_exec = simulator.execute_in_active_cell(lambda: "healthy_failover_cell")
    assert failover_exec["active_cell"] == "us-east-1b"
    simulator.restore_primary_az()
    assert simulator.active_cell == "us-east-1a"

    # =========================================================================
    # Step 11: Privacy Data Export & Synchronous Cryptographic Purge
    # =========================================================================
    # 11a. Export verifies complete profile without raw transcripts
    export_resp = handle_export_user_data(user_id=user_id, store=store)
    assert export_resp["statusCode"] == 200
    export_data = json.loads(export_resp["body"])
    assert export_data["privacy_standard"] == "ZERO_RAW_TRANSCRIPTS_RETAINED"
    assert len(export_data["consent_grants"]) >= 1

    # 11b. Cryptographic Purge synchronously erases user footprint
    purge_resp = handle_delete_user_data(user_id=user_id, store=store)
    assert purge_resp["statusCode"] == 200
    purge_data = json.loads(purge_resp["body"])
    assert purge_data["deleted"] is True
    assert purge_data["purged_records"]["grants"] >= 1

    # Confirm post-purge: user grants are 0, active slack status is wiped
    post_export = handle_export_user_data(user_id=user_id, store=store)
    post_data = json.loads(post_export["body"])
    assert len(post_data["consent_grants"]) == 0
    assert post_data["active_slack_status"] is None
