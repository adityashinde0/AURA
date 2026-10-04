"""Contract tests for Pre-Meeting JSON Schemas in Project AURA."""
import json
from pathlib import Path
import pytest
from jsonschema import validate, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "schemas" / "pre_meeting"


def load_schema(name: str) -> dict:
    with open(SCHEMAS_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def test_calendar_event_schema():
    schema = load_schema("calendar_event.json")
    valid_event = {
        "calendar_event_id": "cal_evt_123",
        "user_id": "usr_aditi_01",
        "title": "AWS Mentoring",
        "start_epoch": 1791122400,
        "end_epoch": 1791126000,
        "participants": ["Aditi", "Mentor Dave"],
        "is_opted_in": True,
        "status": "confirmed",
        "timezone": "UTC",
        "series_id": "series_placement",
    }
    validate(instance=valid_event, schema=schema)

    # Invalid event missing title
    invalid_event = dict(valid_event)
    del invalid_event["title"]
    with pytest.raises(ValidationError):
        validate(instance=invalid_event, schema=schema)


def test_watch_whisper_card_schema():
    schema = load_schema("watch_whisper_card.json")
    valid_card = {
        "card_id": "card_abc123",
        "calendar_event_id": "cal_evt_123",
        "user_id": "usr_aditi_01",
        "meeting_title": "AWS Mentoring",
        "start_epoch": 1791122400,
        "prep_summary": "Mentoring session to review distributed architecture and portfolio deployment.",
        "questions": ["Q1?", "Q2?", "Q3?"],
        "emotion_tone": "confident",
        "evidence_sources": ["Source: evt_001"],
        "actions": ["Read", "Save", "Not useful", "Mute this event series"],
        "created_at": 1791122100.0,
        "delivered_to": "bee_watch",
        "is_quiet_hours": False,
        "haptic_enabled": True,
    }
    validate(instance=valid_card, schema=schema)

    # Invalid card with only 2 questions
    invalid_card = dict(valid_card, questions=["Q1?", "Q2?"])
    with pytest.raises(ValidationError):
        validate(instance=invalid_card, schema=schema)


def test_mobile_notification_schema():
    schema = load_schema("mobile_notification.json")
    valid_notif = {
        "notification_id": "notif_xyz789",
        "user_id": "usr_aditi_01",
        "calendar_event_id": "cal_evt_123",
        "title": "AURA: Prep for AWS Mentoring",
        "subtitle": "Tone: Confident",
        "body": "Briefing ready: review distributed caching architecture before call.",
        "deep_link": "aura://meeting-prep/cal_evt_123?epoch=1791122400",
        "action_categories": ["READ", "SAVE", "NOT_USEFUL", "MUTE_SERIES"],
        "sound_enabled": True,
        "created_at": 1791122100.0,
        "is_quiet_hours": False,
    }
    validate(instance=valid_notif, schema=schema)


def test_user_preferences_schema():
    schema = load_schema("user_preferences.json")
    valid_prefs = {
        "user_id": "usr_aditi_01",
        "pre_meeting_enabled": True,
        "quiet_hours": {
            "enabled": True,
            "start_time": "22:00",
            "end_time": "07:00",
            "timezone": "UTC",
        },
        "muted_series": ["series_placement"],
        "preferred_tone": "supportive",
        "feedback_history": [
            {
                "action": "not_useful",
                "calendar_event_id": "cal_evt_123",
                "timestamp": 1791122500.0,
            }
        ],
        "updated_at": 1791122500.0,
    }
    validate(instance=valid_prefs, schema=schema)
