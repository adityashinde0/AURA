"""Unit tests for WhisperAdapter in Project AURA."""
import importlib
import pytest

fg = importlib.import_module("lambda.focus_guardian")
FocusProposal = fg.FocusProposal
from standalone_agent.whisper_adapter import WhisperAdapter, WatchWhisperCard, MobileNotification


@pytest.fixture
def proposal():
    return FocusProposal(
        prep_summary="You have an upcoming placement mentoring session on AWS system design.",
        questions=[
            "What distributed architecture trade-offs should be prioritized?",
            "How do your scalability and recovery targets compare to requirements?",
            "What concrete interview gap do you want guidance on today?",
        ],
        emotion_tone="confident",
        is_distracted=False,
        distraction_score=0.0,
        deep_work_bank_delta=0,
        evidence_ids=["evt_001", "evt_004"],
        recommended_action="none",
        reason="Briefing generated from approved Bee memory snippets.",
    )


def test_deliver_briefing_to_bee_watch(proposal):
    adapter = WhisperAdapter(watch_connected=True)
    res = adapter.deliver_briefing(
        user_id="usr_aditi_01",
        calendar_event_id="evt_cal_001",
        meeting_title="Placement Mentoring",
        start_epoch=1791122400,
        proposal=proposal,
        is_quiet_hours=False,
    )
    assert res["delivery_channel"] == "bee_watch"
    assert res["delivered"] is True
    card = res["card"]
    assert card["meeting_title"] == "Placement Mentoring"
    assert card["emotion_tone"] == "confident"
    assert len(card["questions"]) == 3
    assert "Mute this event series" in card["actions"]
    assert card["haptic_enabled"] is True


def test_deliver_briefing_watch_quiet_hours_silences_haptic(proposal):
    adapter = WhisperAdapter(watch_connected=True)
    res = adapter.deliver_briefing(
        user_id="usr_aditi_01",
        calendar_event_id="evt_cal_001",
        meeting_title="Late Night Planning",
        start_epoch=1791156600,
        proposal=proposal,
        is_quiet_hours=True,
    )
    assert res["delivery_channel"] == "bee_watch"
    card = res["card"]
    assert card["is_quiet_hours"] is True
    assert card["haptic_enabled"] is False


def test_deliver_briefing_mobile_fallback_when_watch_disconnected(proposal):
    adapter = WhisperAdapter(watch_connected=False)
    res = adapter.deliver_briefing(
        user_id="usr_aditi_01",
        calendar_event_id="evt_cal_001",
        meeting_title="Placement Mentoring",
        start_epoch=1791122400,
        proposal=proposal,
        is_quiet_hours=False,
    )
    assert res["delivery_channel"] == "mobile_fallback"
    assert res["delivered"] is True
    notif = res["notification"]
    assert "AURA: Prep for Placement Mentoring" in notif["title"]
    assert "aura://meeting-prep/evt_cal_001" in notif["deep_link"]
    assert notif["sound_enabled"] is True


def test_record_feedback_mute_series_and_preference_update():
    adapter = WhisperAdapter()
    user_id = "usr_aditi_01"

    # 1. Record 'Not useful'
    res1 = adapter.record_feedback(
        user_id=user_id,
        feedback_action="Not useful",
        calendar_event_id="evt_cal_001",
        series_id="series_placement",
    )
    assert res1["status"] == "feedback_recorded"
    assert "never used for shared model retraining" in res1["privacy_guarantee"]

    # 2. Record 'Mute this event series'
    res2 = adapter.record_feedback(
        user_id=user_id,
        feedback_action="Mute this event series",
        calendar_event_id="evt_cal_001",
        series_id="series_placement",
    )
    assert res2["muted_series_count"] == 1

    prefs = adapter.get_user_preferences(user_id)
    assert "series_placement" in prefs["muted_series"]
    assert len(prefs["feedback_history"]) == 2
