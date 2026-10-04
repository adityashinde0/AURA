"""Calendar ingress, normalization, and EventBridge T-5 scheduler for Project AURA.

Handles calendar event normalization from Google Calendar, Microsoft Outlook, and
generic AURA webhooks. Enforces user opt-in, timezone awareness, quiet hours boundaries,
cancellations, rescheduling, and emits privacy-safe MeetingPrepTriggered events.
"""
from __future__ import annotations

import datetime
import hashlib
import time
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CalendarEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    calendar_event_id: str = Field(min_length=1, max_length=256)
    user_id: str = Field(min_length=3, max_length=128)
    title: str = Field(min_length=1, max_length=256)
    start_epoch: int = Field(ge=0)
    end_epoch: int = Field(ge=0)
    participants: list[str] = Field(default_factory=list)
    is_opted_in: bool = True
    status: Literal["confirmed", "tentative", "cancelled"] = "confirmed"
    timezone: str = "UTC"
    recurrence_id: str | None = None
    series_id: str | None = None
    location: str | None = None

    @field_validator("end_epoch")
    @classmethod
    def end_epoch_must_be_after_start(cls, value: int, info: Any) -> int:
        start = info.data.get("start_epoch")
        if start is not None and value < start:
            raise ValueError("end_epoch must be greater than or equal to start_epoch")
        return value


def _parse_iso_or_epoch(val: Any, tz_str: str = "UTC") -> int:
    """Parse ISO 8601 string or integer timestamp to epoch integer."""
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        # Clean up ISO string
        iso_str = val.replace("Z", "+00:00")
        try:
            dt = datetime.datetime.fromisoformat(iso_str)
            if dt.tzinfo is None:
                try:
                    dt = dt.replace(tzinfo=ZoneInfo(tz_str))
                except Exception:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
            return int(dt.timestamp())
        except ValueError:
            return int(float(val))
    raise ValueError(f"Cannot parse timestamp from {val}")


def normalize_google_calendar_event(payload: dict[str, Any], user_id: str) -> CalendarEvent:
    """Normalize Google Calendar event resource format."""
    event_id = payload.get("id") or payload.get("calendar_event_id")
    if not event_id:
        raise ValueError("Google calendar event missing 'id'")

    summary = payload.get("summary", "Untitled Meeting")
    start_obj = payload.get("start", {})
    end_obj = payload.get("end", {})

    tz = start_obj.get("timeZone", payload.get("timezone", "UTC"))
    start_val = start_obj.get("dateTime", start_obj.get("date", payload.get("start_epoch")))
    end_val = end_obj.get("dateTime", end_obj.get("date", payload.get("end_epoch")))

    start_epoch = _parse_iso_or_epoch(start_val, tz)
    end_epoch = _parse_iso_or_epoch(end_val, tz) if end_val else start_epoch + 1800

    raw_attendees = payload.get("attendees", [])
    participants: list[str] = []
    for att in raw_attendees:
        if isinstance(att, dict) and "email" in att:
            displayName = att.get("displayName")
            participants.append(displayName or att["email"])
        elif isinstance(att, str):
            participants.append(att)

    raw_status = payload.get("status", "confirmed")
    status: Literal["confirmed", "tentative", "cancelled"] = "cancelled" if raw_status == "cancelled" else "confirmed"

    return CalendarEvent(
        calendar_event_id=str(event_id),
        user_id=user_id,
        title=summary,
        start_epoch=start_epoch,
        end_epoch=end_epoch,
        participants=participants,
        is_opted_in=payload.get("is_opted_in", True),
        status=status,
        timezone=tz,
        recurrence_id=payload.get("recurringEventId"),
        series_id=payload.get("recurringEventId"),
        location=payload.get("location"),
    )


def normalize_outlook_calendar_event(payload: dict[str, Any], user_id: str) -> CalendarEvent:
    """Normalize Microsoft Graph Outlook event resource format."""
    event_id = payload.get("id") or payload.get("calendar_event_id")
    if not event_id:
        raise ValueError("Outlook calendar event missing 'id'")

    subject = payload.get("subject", "Untitled Meeting")
    start_obj = payload.get("start", {})
    end_obj = payload.get("end", {})

    tz = start_obj.get("timeZone", payload.get("timezone", "UTC"))
    start_val = start_obj.get("dateTime", payload.get("start_epoch"))
    end_val = end_obj.get("dateTime", payload.get("end_epoch"))

    start_epoch = _parse_iso_or_epoch(start_val, tz)
    end_epoch = _parse_iso_or_epoch(end_val, tz) if end_val else start_epoch + 1800

    raw_attendees = payload.get("attendees", [])
    participants: list[str] = []
    for att in raw_attendees:
        if isinstance(att, dict):
            email_addr = att.get("emailAddress", {})
            name = email_addr.get("name") or email_addr.get("address")
            if name:
                participants.append(name)
        elif isinstance(att, str):
            participants.append(att)

    is_cancelled = payload.get("isCancelled", False) or payload.get("status") == "cancelled"
    status: Literal["confirmed", "tentative", "cancelled"] = "cancelled" if is_cancelled else "confirmed"

    return CalendarEvent(
        calendar_event_id=str(event_id),
        user_id=user_id,
        title=subject,
        start_epoch=start_epoch,
        end_epoch=end_epoch,
        participants=participants,
        is_opted_in=payload.get("is_opted_in", True),
        status=status,
        timezone=tz,
        series_id=payload.get("seriesMasterId"),
        location=payload.get("location", {}).get("displayName") if isinstance(payload.get("location"), dict) else payload.get("location"),
    )


def normalize_event(
    payload: dict[str, Any],
    source_type: Literal["google", "outlook", "aura"] = "aura",
    user_id: str | None = None,
) -> CalendarEvent:
    """Normalize any supported calendar event format into canonical CalendarEvent."""
    effective_user_id = user_id or payload.get("user_id")
    if not effective_user_id:
        raise ValueError("user_id must be provided in payload or argument")

    if source_type == "google" or "summary" in payload:
        return normalize_google_calendar_event(payload, effective_user_id)
    if source_type == "outlook" or "subject" in payload:
        return normalize_outlook_calendar_event(payload, effective_user_id)

    # Standard AURA schema
    return CalendarEvent(
        calendar_event_id=payload["calendar_event_id"],
        user_id=effective_user_id,
        title=payload["title"],
        start_epoch=int(payload["start_epoch"]),
        end_epoch=int(payload["end_epoch"]),
        participants=payload.get("participants", []),
        is_opted_in=payload.get("is_opted_in", True),
        status=payload.get("status", "confirmed"),
        timezone=payload.get("timezone", "UTC"),
        recurrence_id=payload.get("recurrence_id"),
        series_id=payload.get("series_id"),
        location=payload.get("location"),
    )


def calculate_trigger_epoch(event: CalendarEvent, offset_seconds: int = 300) -> int:
    """Calculate the T-5 trigger epoch (default: 5 minutes / 300 seconds before start)."""
    return event.start_epoch - offset_seconds


def generate_idempotency_key(user_id: str, calendar_event_id: str, start_epoch: int) -> str:
    """Generate canonical idempotency key as per ARCHITECTURE.md: {user}:{calendarEventId}:{startEpoch}."""
    return f"{user_id}:{calendar_event_id}:{start_epoch}"


def is_in_quiet_hours(
    epoch: int,
    quiet_hours: dict[str, Any] | None,
) -> bool:
    """Determine if a given timestamp falls within configured quiet hours.
    
    quiet_hours dict structure:
      {"enabled": True, "start_time": "22:00", "end_time": "07:00", "timezone": "UTC"}
    """
    if not quiet_hours or not quiet_hours.get("enabled", False):
        return False

    tz_str = quiet_hours.get("timezone", "UTC")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = datetime.timezone.utc

    dt = datetime.datetime.fromtimestamp(epoch, tz=tz)
    current_time_str = dt.strftime("%H:%M")

    start_str = quiet_hours.get("start_time", "22:00")
    end_str = quiet_hours.get("end_time", "07:00")

    if start_str <= end_str:
        # Same day window: e.g. 13:00 to 15:00
        return start_str <= current_time_str < end_str
    else:
        # Overnight window: e.g. 22:00 to 07:00
        return current_time_str >= start_str or current_time_str < end_str


def create_meeting_prep_event(
    event: CalendarEvent,
    evidence_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Build EventBridge MeetingPrepTriggered envelope matching schemas/eventbridge/meeting_prep_event.json."""
    title_hash = hashlib.sha256(event.title.encode("utf-8")).hexdigest()[:16]
    idempotency_key = generate_idempotency_key(event.user_id, event.calendar_event_id, event.start_epoch)

    return {
        "source": "aura.scheduler",
        "detail-type": "MeetingPrepTriggered",
        "detail": {
            "calendar_event_id": event.calendar_event_id,
            "user_id": event.user_id,
            "start_epoch": event.start_epoch,
            "idempotency_key": idempotency_key,
            "meeting_title_hash": f"sha256_{title_hash}",
            "evidence_ids": evidence_ids or [],
        },
    }


class CalendarScheduler:
    """In-memory scheduler & state manager for upcoming calendar briefings."""

    def __init__(self) -> None:
        self.scheduled_events: dict[str, CalendarEvent] = {}  # key: calendar_event_id
        self.emitted_triggers: set[str] = set()  # set of idempotency keys

    def schedule_event(
        self,
        event: CalendarEvent,
        user_preferences: dict[str, Any] | None = None,
        now_epoch: int | None = None,
        offset_seconds: int = 300,
    ) -> dict[str, Any]:
        """Process a calendar event and determine whether to emit a prep trigger."""
        current_time = now_epoch if now_epoch is not None else int(time.time())

        # Check cancellation
        if event.status == "cancelled":
            if event.calendar_event_id in self.scheduled_events:
                del self.scheduled_events[event.calendar_event_id]
            return {
                "status": "cancelled",
                "reason": "Event is cancelled",
                "triggered": False,
            }

        # Check opt-in
        if not event.is_opted_in:
            return {
                "status": "ignored",
                "reason": "User has not opted in to pre-meeting briefings for this event",
                "triggered": False,
            }

        # Check user-level toggle
        if user_preferences and not user_preferences.get("pre_meeting_enabled", True):
            return {
                "status": "disabled",
                "reason": "Pre-meeting briefings globally disabled in user preferences",
                "triggered": False,
            }

        # Check muted series
        if user_preferences and event.series_id:
            muted_series = user_preferences.get("muted_series", [])
            if event.series_id in muted_series:
                return {
                    "status": "muted",
                    "reason": f"Event series '{event.series_id}' is muted by user",
                    "triggered": False,
                }

        # Check quiet hours
        quiet_hours = user_preferences.get("quiet_hours") if user_preferences else None
        if is_in_quiet_hours(event.start_epoch, quiet_hours):
            return {
                "status": "quiet_hours_suppressed",
                "reason": "Meeting starts within configured quiet hours",
                "triggered": False,
            }

        self.scheduled_events[event.calendar_event_id] = event
        trigger_epoch = calculate_trigger_epoch(event, offset_seconds)
        idempotency_key = generate_idempotency_key(event.user_id, event.calendar_event_id, event.start_epoch)

        # Trigger condition: current_time >= trigger_epoch and event hasn't started more than 5m ago
        if current_time >= trigger_epoch and current_time < (event.start_epoch + 300):
            if idempotency_key in self.emitted_triggers:
                return {
                    "status": "duplicate",
                    "idempotency_key": idempotency_key,
                    "triggered": False,
                }

            self.emitted_triggers.add(idempotency_key)
            eventbridge_payload = create_meeting_prep_event(event)
            return {
                "status": "triggered",
                "trigger_epoch": trigger_epoch,
                "idempotency_key": idempotency_key,
                "triggered": True,
                "eventbridge_event": eventbridge_payload,
            }

        return {
            "status": "scheduled",
            "trigger_epoch": trigger_epoch,
            "idempotency_key": idempotency_key,
            "triggered": False,
        }
