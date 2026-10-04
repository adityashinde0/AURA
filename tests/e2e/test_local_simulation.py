"""End-to-end integration and simulation test for Phase 1 (Local Simulation & Core Foundation).

Exercises:
1. Replaying Bee stream fixtures through BeeMonitor.
2. Confirming zero external data leakage in default local-only mode.
3. Local redactor stripping sensitive identifiers (email, phone, secrets).
4. Generating FocusProposal via Focus Guardian handler.
5. Deterministic PolicyEngine evaluation:
   - Authorized device action execution.
   - Audit trail creation with idempotency key and undo token.
   - Action reversal via undo token.
   - Unauthorized device action failing closed (blocked).
"""
import importlib
import json
from pathlib import Path
import pytest

from standalone_agent.bee_classifier import FocusSignal, score_distraction
from standalone_agent.bee_monitor import BeeMonitor, LocalOutbox
from standalone_agent.policy_engine import ConsentGrant, PolicyEngine

fg = importlib.import_module("lambda.focus_guardian")
lambda_handler = fg.lambda_handler


def test_phase1_full_local_simulation():
    # 1. Setup local-only monitor and outbox
    outbox = LocalOutbox(":memory:")
    # relay_fn=None guarantees no data leaves the local boundary
    monitor = BeeMonitor(outbox=outbox, relay_fn=None)

    fixture_path = Path(__file__).resolve().parent.parent / "fixtures" / "bee_stream_sample.jsonl"
    ingested_count = monitor.replay_fixture(fixture_path)
    assert ingested_count == 5

    # 2. Verify all 5 events are quarantined locally in outbox
    pending = outbox.get_pending()
    assert len(pending) == 5

    # Confirm redaction occurred at ingestion boundary
    aditi_event = next(e for e in pending if e["id"] == "evt_002")
    assert "[EMAIL_REDACTED]" in aditi_event["payload"]["evidence"][0]["snippet"]
    assert "[PHONE_REDACTED]" in aditi_event["payload"]["evidence"][0]["snippet"]
    assert "aditi@university.edu" not in aditi_event["payload"]["evidence"][0]["snippet"]

    # 3. Simulate explicit self-report distraction signal
    signals = [FocusSignal(signal_type="self_report_distracted", user_enabled=True)]
    score, reasons = score_distraction(signals)
    assert score == 0.80

    # 4. Invoke Focus Guardian Lambda handler with minimized envelope
    focus_request = {
        "user_id": "usr_aditi_01",
        "session_id": "sess_placement_prep",
        "purpose": "focus_guardian",
        "explicit_signal": "self_report_distracted",
        "evidence": [
            {
                "id": "evt_001",
                "text": "Aditi: We need to prepare for tomorrow's placement mentoring session on AWS system design.",
            }
        ],
        "consented_signal_score": score,
    }

    def mock_bedrock_invoker(_prompt: str) -> dict:
        return {
            "prep_summary": "Placement mentoring session on AWS system design in progress.",
            "3_questions": [
                "What AWS storage tiers are needed?",
                "What are the latency requirements?",
                "How will regional failover be handled?",
            ],
            "emotion_tone": "cautious",
            "is_distracted": True,
            "distraction_score": 0.8,
            "deep_work_bank_delta": -1,
            "evidence_ids": ["evt_001"],
            "recommended_action": "request_pause",
            "reason": "Self-reported distraction; recommend pausing background Fire TV playback.",
        }

    lambda_resp = lambda_handler(focus_request, invoker=mock_bedrock_invoker)
    assert lambda_resp["statusCode"] == 200
    resp_body = json.loads(lambda_resp["body"])
    assert resp_body["policy_required"] is True
    proposal = resp_body["proposal"]
    assert proposal["recommended_action"] == "request_pause"

    # 5. Policy Engine evaluation - Test 1: Action without consent fails closed
    policy_engine = PolicyEngine(allowed_devices={"fire_tv_living_room"})
    decision_unauthorized = policy_engine.evaluate_and_execute(
        user_id="usr_aditi_01",
        proposal_action=proposal["recommended_action"],
        target_device_id="fire_tv_living_room",
        reason=proposal["reason"],
        idempotency_key="idemp_sess_001",
    )
    # Blocked because no grant exists yet!
    assert decision_unauthorized["executed"] is False
    assert decision_unauthorized["decision"] == "blocked"

    # 6. Policy Engine evaluation - Test 2: User grants "allow_for_session"
    session_grant = ConsentGrant(
        tenant_id="tenant_univ_01",
        user_id="usr_aditi_01",
        action_type="request_pause",
        scope="allow_for_session",
        target_device_id="fire_tv_living_room",
    )
    policy_engine.set_grant(session_grant)

    decision_authorized = policy_engine.evaluate_and_execute(
        user_id="usr_aditi_01",
        proposal_action=proposal["recommended_action"],
        target_device_id="fire_tv_living_room",
        reason=proposal["reason"],
        idempotency_key="idemp_sess_002",
    )
    assert decision_authorized["executed"] is True
    assert decision_authorized["decision"] == "executed"
    undo_token = decision_authorized["undo_token"]
    assert undo_token is not None

    # 7. Test Undo: user clicks Stop / Undo
    assert policy_engine.execute_undo(undo_token) is True
    last_audit = policy_engine.audit_log[-1]
    assert last_audit.status == "undone"
    assert last_audit.undone is True

    # 8. Test unallowlisted device fails closed
    decision_bad_device = policy_engine.evaluate_and_execute(
        user_id="usr_aditi_01",
        proposal_action="request_pause",
        target_device_id="unknown_smart_tv",
        reason="Pause unauthorized device",
        idempotency_key="idemp_sess_003",
    )
    assert decision_bad_device["executed"] is False
    assert decision_bad_device["decision"] == "blocked"
    assert "not in approved allowlist" in decision_bad_device["reason"]
    outbox.close()
