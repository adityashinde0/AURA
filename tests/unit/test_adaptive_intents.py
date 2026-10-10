from __future__ import annotations

import importlib
import json
import uuid
import pytest

from standalone_agent.device_adapter import DeviceSimulatorAdapter
from standalone_agent.policy_engine import PolicyEngine, ConsentGrant

focus_guardian_mod = importlib.import_module("lambda.focus_guardian")
FocusRequest = focus_guardian_mod.FocusRequest
FocusProposal = focus_guardian_mod.FocusProposal
safe_fallback = focus_guardian_mod.safe_fallback
lambda_handler = focus_guardian_mod.lambda_handler

control_plane_mod = importlib.import_module("lambda.control_plane")
InMemoryDataStore = control_plane_mod.InMemoryDataStore
handle_focus_signal = control_plane_mod.handle_focus_signal
handle_get_routines = control_plane_mod.handle_get_routines
handle_create_routine = control_plane_mod.handle_create_routine
handle_revoke_routine = control_plane_mod.handle_revoke_routine
handle_update_routine = control_plane_mod.handle_update_routine


# ==============================================================================
# 1. FocusRequest & FocusProposal Schema Integrity
# ==============================================================================


def test_focus_request_adaptive_fields():
    req = FocusRequest(
        user_id="usr_test_01",
        session_id="sess_12345678",
        purpose="focus_guardian",
        user_intent="I feel exhausted, need sleep",
        connected_devices=["dev_firetv_living_room", "dev_smart_lights"],
    )
    assert req.user_intent == "I feel exhausted, need sleep"
    assert req.connected_devices == ["dev_firetv_living_room", "dev_smart_lights"]


def test_focus_proposal_contract_exact_keys():
    schema = FocusProposal.model_json_schema(by_alias=True)
    expected_keys = {
        "prep_summary",
        "3_questions",
        "emotion_tone",
        "is_distracted",
        "distraction_score",
        "deep_work_bank_delta",
        "evidence_ids",
        "recommended_action",
        "reason",
    }
    assert set(schema["properties"].keys()) == expected_keys


def test_focus_proposal_extra_device_actions():
    proposal_dict = {
        "prep_summary": "Wind down routine.",
        "3_questions": ["Q1?", "Q2?", "Q3?"],
        "emotion_tone": "calm",
        "is_distracted": False,
        "distraction_score": 0.2,
        "deep_work_bank_delta": 0,
        "evidence_ids": [],
        "recommended_action": "request_pause",
        "reason": "Resting.",
        "device_actions": [
            {"device": "dev_firetv_living_room", "action": "request_pause"},
            {"device": "dev_smart_lights", "action": "dim_lights"},
        ],
    }
    proposal = FocusProposal.model_validate(proposal_dict)
    assert proposal.recommended_action == "request_pause"
    assert getattr(proposal, "device_actions", None) is not None
    assert len(proposal.device_actions) == 2


# ==============================================================================
# 2. Focus Guardian Safe Fallback Adaptive Behavior
# ==============================================================================


def test_safe_fallback_tired_sleep_intent():
    req = FocusRequest(
        user_id="usr_test_01",
        session_id="sess_12345678",
        purpose="focus_guardian",
        user_intent="I am tired and want to sleep",
        connected_devices=["dev_firetv_living_room", "dev_smart_lights"],
    )
    proposal = safe_fallback(req)
    assert proposal.recommended_action == "request_pause"
    assert proposal.emotion_tone == "calm"
    assert "safe fallback" in proposal.reason
    assert hasattr(proposal, "device_actions")
    actions = getattr(proposal, "device_actions")
    assert any(a["action"] == "dim_lights" for a in actions)
    assert any(a["action"] == "request_pause" for a in actions)


def test_safe_fallback_quick_break_intent():
    req = FocusRequest(
        user_id="usr_test_01",
        session_id="sess_12345678",
        purpose="focus_guardian",
        user_intent="Need a quick break",
        connected_devices=["dev_firetv_living_room"],
    )
    proposal = safe_fallback(req)
    assert proposal.recommended_action == "request_pause"
    assert proposal.emotion_tone == "supportive"
    assert "safe fallback" in proposal.reason


def test_safe_fallback_custom_intent():
    req = FocusRequest(
        user_id="usr_test_01",
        session_id="sess_12345678",
        purpose="focus_guardian",
        user_intent="Severe headache, need silence",
        connected_devices=["dev_firetv_living_room"],
    )
    proposal = safe_fallback(req)
    assert "safe fallback" in proposal.reason
    assert "Severe headache, need silence" in proposal.prep_summary


def test_lambda_handler_includes_device_actions_in_response():
    event = {
        "user_id": "usr_test_01",
        "session_id": "sess_12345678",
        "purpose": "focus_guardian",
        "user_intent": "I want to sleep",
        "connected_devices": ["dev_firetv_living_room", "dev_smart_lights"],
    }
    resp = lambda_handler(event)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["policy_required"] is True
    assert "device_actions" in body
    assert len(body["device_actions"]) >= 1


# ==============================================================================
# 3. DeviceSimulatorAdapter Batch Execution & Undo Reversal
# ==============================================================================


def test_device_adapter_certified_devices_and_capabilities():
    adapter = DeviceSimulatorAdapter()
    devices = adapter.list_devices()
    device_ids = {d["device_id"] for d in devices}
    assert "dev_smart_lights" in device_ids
    assert "dev_orbit_wearable" in device_ids
    assert "dev_focus_hub" in device_ids


def test_device_adapter_dim_and_undo():
    adapter = DeviceSimulatorAdapter()
    res = adapter.execute_dim("dev_smart_lights", brightness_pct=20)
    assert res.success is True
    assert res.undo_token is not None

    # Undo restores original state
    undo_res = adapter.execute_undo(res.undo_token)
    assert undo_res.success is True
    assert undo_res.details["restored_brightness"] == 100


def test_device_adapter_batch_execution_and_batch_undo():
    adapter = DeviceSimulatorAdapter()
    commands = [
        {"device": "dev_firetv_living_room", "action": "request_pause"},
        {"device": "dev_smart_lights", "action": "dim_lights", "brightness_pct": 15},
    ]
    batch_res = adapter.execute_batch(commands)
    assert batch_res["success"] is True
    assert len(batch_res["results"]) == 2
    batch_undo_token = batch_res["batch_undo_token"]
    assert batch_undo_token is not None

    # Verify Fire TV is paused
    status_tv = adapter.get_device_status("dev_firetv_living_room")
    assert status_tv.playback_state == "paused"

    # Reversing batch undo token restores both devices
    undo_res = adapter.execute_undo(batch_undo_token)
    assert undo_res.success is True
    assert len(undo_res.details["reversals"]) == 2

    status_tv_after = adapter.get_device_status("dev_firetv_living_room")
    assert status_tv_after.playback_state == "playing"


# ==============================================================================
# 4. PolicyEngine Routine Learning & Consent Auto-Execution
# ==============================================================================


def test_policy_engine_remember_and_evaluate_routine():
    adapter = DeviceSimulatorAdapter()
    engine = PolicyEngine(device_adapter=adapter)

    # 1. Remember routine creates persistent grant
    grant = engine.remember_routine(
        user_id="usr_aditi",
        intent="I am tired, want to sleep",
        routine_actions=[
            {"device": "dev_firetv_living_room", "action": "request_pause"},
            {"device": "dev_smart_lights", "action": "dim_lights"},
        ],
        routine_name="Evening Sleep Routine",
    )
    assert grant.scope == "always"
    assert grant.intent_pattern == "i am tired, want to sleep"

    # 2. Subsequent trigger of same intent evaluates grant and executes automatically
    eval_res = engine.evaluate_routine(
        user_id="usr_aditi",
        session_id="sess_focus_01",
        intent="I am tired, want to sleep",
    )
    assert eval_res["decision"] == "executed_consent_rule"
    assert eval_res["executed"] is True
    undo_token = eval_res["undo_token"]
    assert undo_token is not None

    # 3. Undo reversal restores devices
    undo_result = engine.undo_action(undo_token, user_id="usr_aditi")
    assert undo_result.status == "undone"


def test_policy_engine_evaluates_unknown_intent_as_ask_user():
    adapter = DeviceSimulatorAdapter()
    engine = PolicyEngine(device_adapter=adapter)

    res = engine.evaluate_routine(
        user_id="usr_aditi",
        session_id="sess_01",
        intent="Completely new unregistered intent",
    )
    assert res["decision"] == "ask_user_confirmation"
    assert res["executed"] is False


# ==============================================================================
# 5. Control Plane Routines API Endpoints
# ==============================================================================


def test_control_plane_routines_crud():
    store = InMemoryDataStore()

    # 1. Get initial routines
    get_res = handle_get_routines("usr_marcus", store=store)
    assert get_res["statusCode"] == 200
    body = json.loads(get_res["body"])
    assert len(body["routines"]) >= 2

    # 2. Create routine
    create_payload = {
        "user_id": "usr_marcus",
        "intent": "Brain fog reset",
        "actions": [{"device": "dev_orbit_wearable", "action": "nudge"}],
        "name": "Brain Fog Reset",
        "scope": "always",
    }
    create_res = handle_create_routine(create_payload, store=store)
    assert create_res["statusCode"] == 201
    created = json.loads(create_res["body"])
    routine_id = created.get("routine_id") or created["routine"]["routine_id"]

    # 3. Update routine
    update_res = handle_update_routine(routine_id, {
        "user_id": "usr_marcus",
        "name": "Updated Brain Fog Reset",
        "scope": "always",
    }, store=store)
    assert update_res["statusCode"] == 200

    # 4. Revoke routine (routine_id, user_id, store)
    del_res = handle_revoke_routine(routine_id, "usr_marcus", store=store)
    assert del_res["statusCode"] == 200


def test_control_plane_focus_signal_with_learned_routine():
    store = InMemoryDataStore()
    payload = {
        "event_id": str(uuid.uuid4()),
        "user_id": "usr_marcus",
        "session_id": "sess_12345678",
        "timestamp": 1700000000.0,
        "explicit_signal": "none",
        "user_intent": "I am tired, want to sleep",
        "connected_devices": ["dev_firetv_living_room", "dev_smart_lights"],
        "idempotency_key": str(uuid.uuid4()),
    }
    resp = handle_focus_signal(payload, store=store)
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    # Seeded routine rtn_wind_down matches this intent
    assert body["decision"] in ("executed", "executed_consent_rule")
    assert body["undo_token"] is not None
    assert "device_actions" in body
