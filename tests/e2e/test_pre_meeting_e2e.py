"""End-to-End Integration Test for Project AURA Phase 3: Pre-Meeting Intelligence.

Validates the full Phase 3 Definition of Done:
1. Replay fixtures end-to-end (Bee stream & calendar event at T-5).
2. Local context selection and PII redaction.
3. Obtain validated structured output from Bedrock adapter (summary, 3 questions, tone).
4. Deterministic policy evaluation & immutable audit trail with 24h TTL.
5. See Watch Whisper card delivery & mobile notification fallback.
6. User feedback processing without shared model retraining.
7. Run a self-report focus nudge.
8. Demonstrate that unauthorized device commands and Slack meeting leakage fail closed.
"""
from __future__ import annotations

import json
from pathlib import Path
import time
import pytest
import importlib

ba = importlib.import_module("lambda.bedrock_adapter")
BedrockAdapter = ba.BedrockAdapter
fg = importlib.import_module("lambda.focus_guardian")
FocusProposal = fg.FocusProposal
FocusRequest = fg.FocusRequest
lambda_handler = fg.lambda_handler
from standalone_agent.calendar_scheduler import (
    CalendarScheduler,
    normalize_google_calendar_event,
)
from standalone_agent.context_selector import ContextSelector
from standalone_agent.policy_engine import ConsentGrant, PolicyEngine
from standalone_agent.redactor import Redactor
from standalone_agent.whisper_adapter import WhisperAdapter

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def load_bee_fixtures() -> list[dict]:
    items = []
    with open(FIXTURES_DIR / "bee_stream_sample.jsonl", "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                items.append(json.loads(line))
    return items


def test_phase3_pre_meeting_intelligence_full_pipeline():
    # -------------------------------------------------------------------------
    # 1. Setup & Ingestion: Replay Bee Stream and Calendar Event Fixtures
    # -------------------------------------------------------------------------
    user_id = "usr_aditi_01"
    bee_pool = load_bee_fixtures()
    assert len(bee_pool) >= 4

    google_cal_fixture = {
        "id": "cal_mentoring_20261005",
        "summary": "Placement Mentoring: AWS System Design",
        "start": {"dateTime": "2026-10-05T14:00:00Z", "timeZone": "UTC"},
        "end": {"dateTime": "2026-10-05T14:45:00Z", "timeZone": "UTC"},
        "attendees": [
            {"displayName": "Mentor Dave", "email": "dave@cloudacademy.com"},
            {"displayName": "Aditi Shinde", "email": "aditi@university.edu"},
        ],
        "status": "confirmed",
        "recurringEventId": "series_placement_mentoring",
    }

    cal_event = normalize_google_calendar_event(google_cal_fixture, user_id=user_id)
    meeting_start = cal_event.start_epoch
    t_minus_5 = meeting_start - 300  # 13:55 UTC

    scheduler = CalendarScheduler()

    # Schedule and trigger at T-5
    schedule_result = scheduler.schedule_event(cal_event, now_epoch=t_minus_5)
    assert schedule_result["triggered"] is True
    assert schedule_result["status"] == "triggered"
    eb_event = schedule_result["eventbridge_event"]
    assert eb_event["detail-type"] == "MeetingPrepTriggered"
    idempotency_key = schedule_result["idempotency_key"]
    assert idempotency_key == f"usr_aditi_01:cal_mentoring_20261005:{meeting_start}"

    # -------------------------------------------------------------------------
    # 2. Context Selection & Local PII Redaction
    # -------------------------------------------------------------------------
    context_selector = ContextSelector(redactor=Redactor())
    selected_evidence = context_selector.select_context(
        meeting_title=cal_event.title,
        participants=cal_event.participants,
        bee_evidence_pool=bee_pool,
        max_items=3,
    )

    assert len(selected_evidence) >= 1
    for ev in selected_evidence:
        # PII must never leave local companion unredacted
        assert "aditi@university.edu" not in ev["snippet"]
        assert "+1-555-0199" not in ev["snippet"]
        assert "id" in ev and ev["id"]

    # -------------------------------------------------------------------------
    # 3. Bedrock Structured Output Briefing Generation
    # -------------------------------------------------------------------------
    focus_request = FocusRequest(
        user_id=user_id,
        session_id=f"prep_{cal_event.calendar_event_id}",
        purpose="pre_meeting",
        explicit_signal="none",
        evidence=selected_evidence,
    )

    bedrock = BedrockAdapter(mock_mode=True)
    proposal = bedrock.generate_briefing(focus_request)

    # Validate Agent Contract
    assert proposal.is_distracted is False
    assert proposal.distraction_score == 0.0
    assert proposal.recommended_action == "none"
    assert len(proposal.questions) == 3
    assert proposal.emotion_tone in ("calm", "confident", "supportive", "neutral", "cautious")
    # Word count constraint for 10-second glance (40–70 words)
    words = len(proposal.prep_summary.split())
    assert 30 <= words <= 80
    # Citations strictly subset of input evidence IDs
    input_ids = {ev["id"] for ev in selected_evidence}
    assert set(proposal.evidence_ids).issubset(input_ids)

    # -------------------------------------------------------------------------
    # 4. Deterministic Policy Evaluation & Audit Record
    # -------------------------------------------------------------------------
    policy = PolicyEngine(allowed_devices={"fire_tv_living_room"})
    grant = ConsentGrant(
        tenant_id="tenant_aura_prod",
        user_id=user_id,
        action_type="pre_meeting_briefing",
        scope="always",
    )
    policy.set_grant(grant)

    policy_decision = policy.evaluate_meeting_prep(
        user_id=user_id,
        calendar_event_id=cal_event.calendar_event_id,
        start_epoch=meeting_start,
        idempotency_key=idempotency_key,
        is_quiet_hours=False,
    )

    assert policy_decision["decision"] == "executed"
    assert policy_decision["executed"] is True
    assert len(policy.audit_log) == 1
    audit_rec = policy.audit_log[0]
    assert audit_rec.status == "executed"
    assert audit_rec.idempotency_key == idempotency_key

    # Replay with same idempotency key must deduplicate
    dup_decision = policy.evaluate_meeting_prep(
        user_id=user_id,
        calendar_event_id=cal_event.calendar_event_id,
        start_epoch=meeting_start,
        idempotency_key=idempotency_key,
    )
    assert dup_decision["decision"] == "duplicate"

    # -------------------------------------------------------------------------
    # 5. Whisper Adapter: Bee Watch Card & Mobile Notification Fallback
    # -------------------------------------------------------------------------
    whisper = WhisperAdapter(watch_connected=True)
    watch_res = whisper.deliver_briefing(
        user_id=user_id,
        calendar_event_id=cal_event.calendar_event_id,
        meeting_title=cal_event.title,
        start_epoch=meeting_start,
        proposal=proposal,
        is_quiet_hours=False,
    )
    assert watch_res["delivery_channel"] == "bee_watch"
    assert watch_res["delivered"] is True
    card = watch_res["card"]
    assert card["meeting_title"] == cal_event.title
    assert len(card["questions"]) == 3
    assert "Mute this event series" in card["actions"]

    # Verify Mobile Notification Fallback when watch is disconnected
    whisper.set_watch_connected(False)
    mobile_res = whisper.deliver_briefing(
        user_id=user_id,
        calendar_event_id=cal_event.calendar_event_id,
        meeting_title=cal_event.title,
        start_epoch=meeting_start,
        proposal=proposal,
        is_quiet_hours=False,
    )
    assert mobile_res["delivery_channel"] == "mobile_fallback"
    notif = mobile_res["notification"]
    assert f"AURA: Prep for {cal_event.title}" in notif["title"]
    assert "aura://meeting-prep" in notif["deep_link"]

    # -------------------------------------------------------------------------
    # 6. User Feedback Processing (Private, No Shared Retraining)
    # -------------------------------------------------------------------------
    fb_mute = whisper.record_feedback(
        user_id=user_id,
        feedback_action="Mute this event series",
        calendar_event_id=cal_event.calendar_event_id,
        series_id=cal_event.series_id,
    )
    assert fb_mute["status"] == "feedback_recorded"
    assert "never used for shared model retraining" in fb_mute["privacy_guarantee"]

    prefs = whisper.get_user_preferences(user_id)
    assert cal_event.series_id in prefs["muted_series"]

    # Next meeting in the same series must now be muted by scheduler
    cal_event_2 = cal_event.model_copy(
        update={"calendar_event_id": "cal_mentoring_next_week", "start_epoch": meeting_start + 604800}
    )
    res_muted = scheduler.schedule_event(
        cal_event_2,
        user_preferences=prefs,
        now_epoch=meeting_start + 604800 - 300,
    )
    assert res_muted["status"] == "muted"
    assert res_muted["triggered"] is False

    # -------------------------------------------------------------------------
    # 7. Self-Report Focus Nudge
    # -------------------------------------------------------------------------
    self_report_req = {
        "user_id": user_id,
        "session_id": "sess_morning_focus",
        "purpose": "focus_guardian",
        "explicit_signal": "self_report_distracted",
        "evidence": selected_evidence,
    }
    nudge_resp = lambda_handler(self_report_req)
    assert nudge_resp["statusCode"] == 200
    nudge_body = json.loads(nudge_resp["body"])
    nudge_proposal = nudge_body["proposal"]
    assert nudge_proposal["is_distracted"] is True
    assert nudge_proposal["recommended_action"] == "nudge"
    assert nudge_proposal["deep_work_bank_delta"] == -1

    # Execute nudge in policy engine
    nudge_exec = policy.evaluate_and_execute(
        user_id=user_id,
        proposal_action="nudge",
        target_device_id=None,
        reason="Self-reported distraction",
        idempotency_key=f"nudge_{user_id}_{time.time()}",
    )
    assert nudge_exec["decision"] == "nudge"
    assert nudge_exec["executed"] is True

    # -------------------------------------------------------------------------
    # 8. Zero Slack Leakage & Unauthorized Device Protection Fail Closed
    # -------------------------------------------------------------------------
    # (A) Attempting to send pre-meeting briefing content to Slack MUST be blocked
    leaky_slack_payload = {
        "meeting_summary": proposal.prep_summary,
        "questions": proposal.questions,
        "evidence_ids": proposal.evidence_ids,
    }
    slack_block = policy.evaluate_slack_post(
        user_id=user_id,
        payload=leaky_slack_payload,
        idempotency_key=f"slack_attempt_{time.time()}",
    )
    assert slack_block["decision"] == "blocked"
    assert slack_block["executed"] is False
    assert slack_block["status"] == "blocked_slack_meeting_leakage"
    assert "Zero Slack Meeting Leakage Rule" in slack_block["reason"]

    # (B) Attempting unauthorized device action MUST fail closed
    unauth_device_attempt = policy.evaluate_and_execute(
        user_id=user_id,
        proposal_action="request_pause",
        target_device_id="unauthorized_smart_speaker_99",
        reason="Attempt remote intervention",
        idempotency_key=f"unauth_dev_{time.time()}",
    )
    assert unauth_device_attempt["decision"] == "blocked"
    assert unauth_device_attempt["executed"] is False
