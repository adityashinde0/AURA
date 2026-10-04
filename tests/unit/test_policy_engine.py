"""Unit tests for deterministic PolicyEngine."""
import time
import pytest
from standalone_agent.policy_engine import ConsentGrant, PolicyEngine


@pytest.fixture
def engine():
    return PolicyEngine(allowed_devices={"fire_tv_living_room", "echo_dot_study"})


def test_action_none_is_suggested_only(engine):
    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="none",
        target_device_id=None,
        reason="No action needed",
        idempotency_key="key_001",
    )
    assert res["decision"] == "none"
    assert res["executed"] is False


def test_nudge_is_executed_without_device(engine):
    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="nudge",
        target_device_id=None,
        reason="Suggest short breathing break",
        idempotency_key="key_002",
    )
    assert res["decision"] == "nudge"
    assert res["executed"] is True


def test_device_action_without_grant_is_blocked_or_ask_user(engine):
    # No grant present
    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="fire_tv_living_room",
        reason="Distraction detected",
        idempotency_key="key_003",
    )
    assert res["decision"] == "blocked"
    assert res["executed"] is False


def test_device_action_with_valid_session_grant_executes_and_provides_undo(engine):
    grant = ConsentGrant(
        tenant_id="ten_01",
        user_id="usr_01",
        action_type="request_pause",
        scope="allow_for_session",
    )
    engine.set_grant(grant)

    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="fire_tv_living_room",
        reason="Pause playback for focus",
        idempotency_key="key_004",
    )
    assert res["decision"] == "executed"
    assert res["executed"] is True
    assert "undo_token" in res

    # Test undo
    undo_success = engine.execute_undo(res["undo_token"])
    assert undo_success is True

    # Undoing again should return False
    assert engine.execute_undo(res["undo_token"]) is False


def test_device_action_with_unauthorized_device_fails(engine):
    grant = ConsentGrant(
        tenant_id="ten_01",
        user_id="usr_01",
        action_type="request_pause",
        scope="always",
    )
    engine.set_grant(grant)

    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="unauthorized_device_xyz",
        reason="Attempt remote pause",
        idempotency_key="key_005",
    )
    assert res["decision"] == "blocked"
    assert res["executed"] is False
    assert "not in approved allowlist" in res["reason"]


def test_revocation_stops_execution_immediately(engine):
    grant = ConsentGrant(
        tenant_id="ten_01",
        user_id="usr_01",
        action_type="request_pause",
        scope="always",
    )
    engine.set_grant(grant)
    # Revoke grant
    engine.revoke_grant(user_id="usr_01", action_type="request_pause")

    res = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="fire_tv_living_room",
        reason="Attempt remote pause after revoke",
        idempotency_key="key_006",
    )
    assert res["decision"] == "blocked"
    assert res["executed"] is False


def test_idempotency_prevents_duplicate_execution(engine):
    grant = ConsentGrant(
        tenant_id="ten_01",
        user_id="usr_01",
        action_type="request_pause",
        scope="always",
    )
    engine.set_grant(grant)

    res1 = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="fire_tv_living_room",
        reason="Pause playback",
        idempotency_key="key_duplicate_test",
    )
    assert res1["decision"] == "executed"

    res2 = engine.evaluate_and_execute(
        user_id="usr_01",
        proposal_action="request_pause",
        target_device_id="fire_tv_living_room",
        reason="Pause playback again",
        idempotency_key="key_duplicate_test",
    )
    assert res2["decision"] == "duplicate"
    assert res2["executed"] is False
