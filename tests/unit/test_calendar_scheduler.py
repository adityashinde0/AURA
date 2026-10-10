"""Unit tests for Calendar Ingress, Normalization, and Scheduler in Project AURA."""
import time
import pytest
from standalone_agent.calendar_scheduler import (
    CalendarEvent,
    CalendarScheduler,
    calculate_trigger_epoch,
    generate_idempotency_key,
    is_in_quiet_hours,
    normalize_google_calendar_event,
    normalize_outlook_calendar_event,
    normalize_event,
    create_meeting_prep_event,
)


@pytest.fixture
def base_epoch():
    # 2026-10-04 14:00:00 UTC = 1791122400
    return 1791122400


def test_calendar_event_model_valid(base_epoch):
    event = CalendarEvent(
        calendar_event_id="evt_cal_001",
        user_id="usr_aditi_01",
        title="AWS System Design Mentoring",
        start_epoch=base_epoch,
        end_epoch=base_epoch + 1800,
        participants=["Aditi", "Marcus (Mentor)"],
        is_opted_in=True,
    )
    assert event.calendar_event_id == "evt_cal_001"
    assert event.end_epoch >= event.start_epoch


def test_calendar_event_model_invalid_end_before_start(base_epoch):
    with pytest.raises(ValueError):
        CalendarEvent(
            calendar_event_id="evt_cal_001",
            user_id="usr_aditi_01",
            title="AWS System Design Mentoring",
            start_epoch=base_epoch,
            end_epoch=base_epoch - 100,
        )


def test_normalize_google_calendar_event():
    google_payload = {
        "id": "gcal_abc123",
        "summary": "Placement Interview Review",
        "start": {"dateTime": "2026-10-05T10:00:00Z", "timeZone": "UTC"},
        "end": {"dateTime": "2026-10-05T10:45:00Z", "timeZone": "UTC"},
        "attendees": [
            {"displayName": "Mentor Dave", "email": "dave@example.com"},
            {"email": "aditi@university.edu"},
        ],
        "status": "confirmed",
        "recurringEventId": "series_placement_prep",
    }
    norm = normalize_google_calendar_event(google_payload, user_id="usr_aditi_01")
    assert norm.calendar_event_id == "gcal_abc123"
    assert norm.user_id == "usr_aditi_01"
    assert norm.title == "Placement Interview Review"
    assert "Mentor Dave" in norm.participants
    assert "aditi@university.edu" in norm.participants
    assert norm.series_id == "series_placement_prep"
    assert norm.status == "confirmed"


def test_normalize_outlook_calendar_event():
    outlook_payload = {
        "id": "outlook_xyz789",
        "subject": "Sprint Architecture Planning",
        "start": {"dateTime": "2026-10-05T14:00:00Z", "timeZone": "UTC"},
        "end": {"dateTime": "2026-10-05T15:00:00Z", "timeZone": "UTC"},
        "attendees": [
            {"emailAddress": {"name": "Marcus PM", "address": "marcus@company.com"}}
        ],
        "isCancelled": False,
        "seriesMasterId": "series_sprint_arch",
    }
    norm = normalize_outlook_calendar_event(outlook_payload, user_id="usr_marcus_01")
    assert norm.calendar_event_id == "outlook_xyz789"
    assert norm.title == "Sprint Architecture Planning"
    assert "Marcus PM" in norm.participants
    assert norm.series_id == "series_sprint_arch"
    assert norm.status == "confirmed"


def test_calculate_trigger_epoch_and_idempotency_key(base_epoch):
    event = CalendarEvent(
        calendar_event_id="evt_cal_002",
        user_id="usr_aditi_01",
        title="Weekly 1:1",
        start_epoch=base_epoch,
        end_epoch=base_epoch + 1800,
    )
    # T-5 trigger = start - 300s
    trigger = calculate_trigger_epoch(event, offset_seconds=300)
    assert trigger == base_epoch - 300

    idemp = generate_idempotency_key(event.user_id, event.calendar_event_id, event.start_epoch)
    assert idemp == f"usr_aditi_01:evt_cal_002:{base_epoch}"


def test_is_in_quiet_hours():
    # Quiet hours: 22:00 to 07:00 UTC (overnight / midnight-crossing)
    qh_utc = {"enabled": True, "start_time": "22:00", "end_time": "07:00", "timezone": "UTC"}

    # 23:30 UTC -> inside
    dt_2330 = 1791156600  # corresponds to 23:30 on a day
    assert is_in_quiet_hours(dt_2330, qh_utc) is True

    # 14:00 UTC -> outside
    dt_1400 = 1791122400
    assert is_in_quiet_hours(dt_1400, qh_utc) is False

    # Disabled quiet hours or None -> always False
    assert is_in_quiet_hours(dt_2330, {"enabled": False}) is False
    assert is_in_quiet_hours(dt_2330, None) is False


def test_is_in_quiet_hours_same_day_window():
    # Same-day daytime window: 13:00 to 15:00 UTC
    qh = {"enabled": True, "start_time": "13:00", "end_time": "15:00", "timezone": "UTC"}
    # 14:00 UTC -> inside
    assert is_in_quiet_hours(1791122400, qh) is True
    # 12:59 UTC -> outside
    assert is_in_quiet_hours(1791122400 - 3660, qh) is False
    # 15:01 UTC -> outside
    assert is_in_quiet_hours(1791122400 + 3660, qh) is False


def test_is_in_quiet_hours_named_timezone_and_dst():
    from zoneinfo import ZoneInfo
    import datetime

    # Quiet hours 22:00 to 07:00 in Europe/London
    qh_london = {"enabled": True, "start_time": "22:00", "end_time": "07:00", "timezone": "Europe/London"}

    # Summer date (BST = UTC+1): July 15, 2026
    # 21:30 UTC is 22:30 BST -> inside quiet hours
    summer_dt_utc = datetime.datetime(2026, 7, 15, 21, 30, tzinfo=datetime.timezone.utc)
    summer_epoch = int(summer_dt_utc.timestamp())
    assert is_in_quiet_hours(summer_epoch, qh_london) is True

    # In winter (GMT = UTC+0): January 15, 2026
    # 21:30 UTC is 21:30 GMT -> outside quiet hours
    winter_dt_utc = datetime.datetime(2026, 1, 15, 21, 30, tzinfo=datetime.timezone.utc)
    winter_epoch = int(winter_dt_utc.timestamp())
    assert is_in_quiet_hours(winter_epoch, qh_london) is False


def test_is_in_quiet_hours_invalid_timezone_fallback(capsys):
    # Unknown timezone should fallback to UTC and log warning
    qh_invalid = {"enabled": True, "start_time": "22:00", "end_time": "07:00", "timezone": "Invalid/Nonexistent_TZ"}
    dt_2330 = 1791156600  # 23:30 UTC -> inside
    assert is_in_quiet_hours(dt_2330, qh_invalid) is True

    captured = capsys.readouterr()
    assert "invalid_quiet_hours_timezone" in captured.out
    assert "Invalid/Nonexistent_TZ" in captured.out


def test_create_meeting_prep_event(base_epoch):
    event = CalendarEvent(
        calendar_event_id="evt_cal_003",
        user_id="usr_aditi_01",
        title="Cloud Architecture Defense",
        start_epoch=base_epoch,
        end_epoch=base_epoch + 3600,
    )
    eb_event = create_meeting_prep_event(event, evidence_ids=["evt_001", "evt_004"])
    assert eb_event["source"] == "aura.scheduler"
    assert eb_event["detail-type"] == "MeetingPrepTriggered"
    detail = eb_event["detail"]
    assert detail["calendar_event_id"] == "evt_cal_003"
    assert detail["user_id"] == "usr_aditi_01"
    assert detail["idempotency_key"] == f"usr_aditi_01:evt_cal_003:{base_epoch}"
    assert detail["evidence_ids"] == ["evt_001", "evt_004"]


def test_scheduler_lifecycle_and_boundaries(base_epoch):
    scheduler = CalendarScheduler()
    event = CalendarEvent(
        calendar_event_id="evt_cal_100",
        user_id="usr_aditi_01",
        title="Placement Mentoring",
        start_epoch=base_epoch,
        end_epoch=base_epoch + 1800,
        series_id="series_placement",
    )

    # 1. Before T-5: event scheduled, not triggered yet
    res = scheduler.schedule_event(event, now_epoch=base_epoch - 600)
    assert res["status"] == "scheduled"
    assert res["triggered"] is False

    # 2. At T-5: event triggers MeetingPrepTriggered
    res_t5 = scheduler.schedule_event(event, now_epoch=base_epoch - 300)
    assert res_t5["status"] == "triggered"
    assert res_t5["triggered"] is True
    assert res_t5["eventbridge_event"]["detail-type"] == "MeetingPrepTriggered"

    # 3. Duplicate trigger prevented
    res_dup = scheduler.schedule_event(event, now_epoch=base_epoch - 290)
    assert res_dup["status"] == "duplicate"
    assert res_dup["triggered"] is False

    # 4. Opted-out event ignored
    opt_out_event = event.model_copy(update={"is_opted_in": False, "calendar_event_id": "evt_cal_101"})
    res_opt_out = scheduler.schedule_event(opt_out_event, now_epoch=base_epoch - 300)
    assert res_opt_out["status"] == "ignored"

    # 5. Muted series ignored
    muted_event = event.model_copy(update={"calendar_event_id": "evt_cal_102"})
    user_prefs = {"muted_series": ["series_placement"], "pre_meeting_enabled": True}
    res_muted = scheduler.schedule_event(muted_event, user_preferences=user_prefs, now_epoch=base_epoch - 300)
    assert res_muted["status"] == "muted"

    # 6. Cancelled event removes from schedule
    res_cancel = scheduler.schedule_event(event.model_copy(update={"status": "cancelled"}))
    assert res_cancel["status"] == "cancelled"
