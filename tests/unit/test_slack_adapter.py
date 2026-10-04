"""Unit tests for Slack capability adapter in Project AURA (Phase 6).

Validates:
- RFC 7636 PKCE code generation and S256 verification
- Least-privilege OAuth scopes enforcement
- AWS Secrets Manager ARN referencing (no plaintext token storage)
- Workspace-admin review and approval gating
- Channel allowlisting and recipient boundaries
- Preview generation and exact preview contract
- Zero Slack Meeting Leakage Rule enforcement (blocks summaries, scores, transcripts, locations)
- Idempotency receipts and unforgeable Undo token generation
- Immediate Undo reversal and automated expiry cleanup
"""
from __future__ import annotations

import time
import pytest

from standalone_agent.slack_adapter import (
    SlackAdapter,
    generate_pkce_challenge,
    verify_pkce_response,
    ZeroLeakageViolationError,
    ChannelNotAllowlistedError,
    WorkspaceNotApprovedError,
)


@pytest.fixture
def slack_adapter() -> SlackAdapter:
    return SlackAdapter()


def test_pkce_generation_and_verification() -> None:
    pkce = generate_pkce_challenge()
    assert len(pkce.code_verifier) >= 43
    assert len(pkce.code_challenge) > 20
    assert pkce.code_challenge_method == "S256"
    assert pkce.is_valid()

    # Valid verifier matches challenge
    assert verify_pkce_response(pkce.code_verifier, pkce.code_challenge) is True

    # Tampered verifier fails
    assert verify_pkce_response(pkce.code_verifier + "tamper", pkce.code_challenge) is False


def test_oauth_start_flow_least_privilege(slack_adapter: SlackAdapter) -> None:
    flow = slack_adapter.start_oauth_flow()
    assert "https://slack.com/oauth/v2/authorize" in flow["authorization_url"]
    assert "scope=chat%3Awrite%2Cusers.profile%3Awrite" in flow["authorization_url"] or "scope=chat:write,users.profile:write" in flow["authorization_url"]
    assert flow["scopes"] == ["chat:write", "users.profile:write"]
    assert flow["code_challenge_method"] == "S256"
    assert flow["state"] in slack_adapter.pending_pkce


def test_oauth_start_flow_rejects_broad_scopes(slack_adapter: SlackAdapter) -> None:
    with pytest.raises(ValueError, match="violates least-privilege security policy"):
        slack_adapter.start_oauth_flow(requested_scopes=["chat:write", "channels:history"])


def test_oauth_callback_verifies_pkce_and_stores_secret_arn(slack_adapter: SlackAdapter) -> None:
    flow = slack_adapter.start_oauth_flow()
    state = flow["state"]
    pkce = slack_adapter.pending_pkce[state]

    callback_res = slack_adapter.complete_oauth_callback(
        code="auth_code_xyz123",
        state=state,
        code_verifier=pkce.code_verifier,
        workspace_id="T_NEW_CORP",
        workspace_name="New Corp HQ",
        admin_user_id="U_ADMIN_01",
        allowed_channels=["#focus-channel", "user_profile"],
    )

    assert callback_res["status"] == "connected"
    assert callback_res["workspace_id"] == "T_NEW_CORP"
    assert "arn:aws:secretsmanager:" in callback_res["token_secret_arn"]
    assert callback_res["is_admin_approved"] is True
    assert callback_res["allowed_channels"] == ["#focus-channel", "user_profile"]

    # State is purged to prevent replay attacks
    assert state not in slack_adapter.pending_pkce


def test_oauth_callback_rejects_tampered_verifier(slack_adapter: SlackAdapter) -> None:
    flow = slack_adapter.start_oauth_flow()
    state = flow["state"]

    with pytest.raises(ValueError, match="PKCE code_verifier verification failed"):
        slack_adapter.complete_oauth_callback(
            code="auth_code_xyz123",
            state=state,
            code_verifier="wrong_verifier_string_value",
            workspace_id="T_TAMPER",
            workspace_name="Tamper Corp",
            admin_user_id="U_ADMIN_01",
        )


def test_workspace_admin_review(slack_adapter: SlackAdapter) -> None:
    # Review existing workspace
    review = slack_adapter.register_workspace_admin_review(
        workspace_id="T012345678",
        admin_user_id="U_CHIEF_SECURITY",
        is_approved=True,
        allowed_channels=["#deep-work", "user_profile"],
    )
    assert review["is_admin_approved"] is True
    assert review["allowed_channels"] == ["#deep-work", "user_profile"]
    assert slack_adapter.workspaces["T012345678"].allowed_channels == ["#deep-work", "user_profile"]


def test_channel_allowlist_enforcement(slack_adapter: SlackAdapter) -> None:
    user_id = "usr_marcus"
    preview = slack_adapter.generate_preview(user_id=user_id, duration_minutes=30)

    # Allowed channel succeeds
    pub = slack_adapter.publish_status(
        user_id=user_id,
        workspace_id="T012345678",
        channel_id="#marcus-focus",
        preview_payload=preview,
        idempotency_key="key_allowlisted_01",
    )
    assert pub["decision"] == "executed"
    assert pub["target_channel"] == "#marcus-focus"

    # Non-allowlisted channel fails closed
    with pytest.raises(ChannelNotAllowlistedError, match="not in approved allowlist"):
        slack_adapter.publish_status(
            user_id=user_id,
            workspace_id="T012345678",
            channel_id="#unapproved-executive-room",
            preview_payload=preview,
            idempotency_key="key_unauthorized_02",
        )


def test_preview_generation_clean_ambient_status(slack_adapter: SlackAdapter) -> None:
    preview = slack_adapter.generate_preview(
        user_id="usr_marcus",
        duration_minutes=45,
        target_channel="user_profile",
    )
    assert preview["user_id"] == "usr_marcus"
    assert "In focus until" in preview["status_text"]
    assert preview["status_emoji"] == ":focus:"
    assert preview["zero_leakage_verified"] is True
    assert "privacy_notice" in preview


def test_preview_rejects_leakage_in_custom_text(slack_adapter: SlackAdapter) -> None:
    with pytest.raises(ZeroLeakageViolationError, match="Zero Slack Meeting Leakage Rule"):
        slack_adapter.generate_preview(
            user_id="usr_marcus",
            duration_minutes=45,
            custom_status="In meeting re: Q3 OKR with David",
        )


def test_publish_status_idempotency_and_undo_token(slack_adapter: SlackAdapter) -> None:
    user_id = "usr_marcus"
    preview = slack_adapter.generate_preview(user_id=user_id, duration_minutes=30)
    idem_key = "slack_unique_tx_101"

    # First attempt: executed
    res1 = slack_adapter.publish_status(
        user_id=user_id,
        workspace_id="T012345678",
        channel_id="#marcus-focus",
        preview_payload=preview,
        idempotency_key=idem_key,
    )
    assert res1["decision"] == "executed"
    assert "undo_slack_" in res1["undo_token"]
    assert res1["status_text"] == preview["status_text"]

    # Second attempt with same key: returns duplicate without republishing
    res2 = slack_adapter.publish_status(
        user_id=user_id,
        workspace_id="T012345678",
        channel_id="#marcus-focus",
        preview_payload=preview,
        idempotency_key=idem_key,
    )
    assert res2["decision"] == "duplicate"
    assert res2["undo_token"] == res1["undo_token"]
    assert res2["already_executed"] is True


def test_undo_reversal_clears_active_status(slack_adapter: SlackAdapter) -> None:
    user_id = "usr_marcus"
    preview = slack_adapter.generate_preview(user_id=user_id, duration_minutes=25)

    pub = slack_adapter.publish_status(
        user_id=user_id,
        workspace_id="T012345678",
        channel_id="#marcus-focus",
        preview_payload=preview,
        idempotency_key="slack_tx_undo_01",
    )
    undo_token = pub["undo_token"]
    assert user_id in slack_adapter.active_statuses

    # Reverse via undo token
    undo_success = slack_adapter.execute_undo(undo_token)
    assert undo_success is True

    # Active status is removed
    assert user_id not in slack_adapter.active_statuses

    # Duplicate undo returns False (already undone)
    assert slack_adapter.execute_undo(undo_token) is False


def test_auto_expiry_cleanup(slack_adapter: SlackAdapter) -> None:
    user_id = "usr_marcus"
    now = time.time()
    # Create status with explicit short expiry
    preview = {
        "status_text": "In focus until short",
        "status_emoji": ":focus:",
        "status_expiration": now + 5,  # Expires in 5 seconds
        "duration_minutes": 1,
    }

    slack_adapter.publish_status(
        user_id=user_id,
        workspace_id="T012345678",
        channel_id="#marcus-focus",
        preview_payload=preview,
        idempotency_key="slack_tx_expiry_01",
    )
    assert user_id in slack_adapter.active_statuses

    # Cleanup before expiry does nothing
    expired = slack_adapter.cleanup_expired_statuses(current_time=now + 2)
    assert len(expired) == 0
    assert user_id in slack_adapter.active_statuses

    # Cleanup after expiry purges status
    expired = slack_adapter.cleanup_expired_statuses(current_time=now + 10)
    assert user_id in expired
    assert user_id not in slack_adapter.active_statuses


def test_zero_slack_meeting_leakage_rule_blocks_all_prohibited_fields(slack_adapter: SlackAdapter) -> None:
    prohibited_samples = [
        {"meeting_summary": "Architecture sync re: Q4 roadmap"},
        {"prep_summary": "Sync with David"},
        {"3_questions": ["What is blocker?", "Who owns it?", "Next steps?"]},
        {"distraction_score": 0.82},
        {"transcript": "Hello this is Marcus on the call"},
        {"reason": "User was checking YouTube"},
        {"location": "Room 402, Building 3"},
        {"attendees": ["marcus@corp.com", "david@corp.com"]},
    ]

    for sample in prohibited_samples:
        with pytest.raises(ZeroLeakageViolationError, match="Zero Slack Meeting Leakage Rule violation"):
            slack_adapter.validate_zero_leakage(sample)
