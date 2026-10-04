"""Watch Whisper and Mobile Notification Adapter for Project AURA.

Delivers actionable, glanceable pre-meeting cards to Bee Watch / Apple Watch companion
with a 10-second read target. Falls back to mobile notification when watch is unavailable.
Supports actions (Read, Save, Not useful, Mute this event series) and processes user feedback
into per-user preference profiles without retraining shared models.
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

import importlib
fg = importlib.import_module("lambda.focus_guardian")
FocusProposal = fg.FocusProposal


class WatchWhisperCard(BaseModel):
    card_id: str = Field(default_factory=lambda: f"card_{uuid.uuid4().hex[:12]}")
    calendar_event_id: str
    user_id: str
    meeting_title: str
    start_epoch: int
    prep_summary: str = Field(max_length=500)
    questions: list[str] = Field(min_length=3, max_length=3)
    emotion_tone: Literal["calm", "confident", "supportive", "neutral", "cautious"]
    evidence_sources: list[str] = Field(default_factory=list)
    actions: list[Literal["Read", "Save", "Not useful", "Mute this event series"]] = Field(
        default_factory=lambda: ["Read", "Save", "Not useful", "Mute this event series"]
    )
    created_at: float = Field(default_factory=time.time)
    delivered_to: Literal["bee_watch", "mobile_fallback"] = "bee_watch"
    is_quiet_hours: bool = False
    haptic_enabled: bool = True


class MobileNotification(BaseModel):
    notification_id: str = Field(default_factory=lambda: f"notif_{uuid.uuid4().hex[:12]}")
    user_id: str
    calendar_event_id: str
    title: str
    subtitle: str
    body: str
    deep_link: str
    action_categories: list[str] = Field(
        default_factory=lambda: ["READ", "SAVE", "NOT_USEFUL", "MUTE_SERIES"]
    )
    sound_enabled: bool = True
    created_at: float = Field(default_factory=time.time)
    is_quiet_hours: bool = False


class WhisperAdapter:
    """Delivers glanceable cards to Watch or Mobile and manages user feedback."""

    def __init__(self, watch_connected: bool = True) -> None:
        self.watch_connected = watch_connected
        self.delivered_cards: list[WatchWhisperCard] = []
        self.delivered_notifications: list[MobileNotification] = []
        self.user_preferences: dict[str, dict[str, Any]] = {}

    def set_watch_connected(self, connected: bool) -> None:
        """Update watch connection status."""
        self.watch_connected = connected

    def deliver_briefing(
        self,
        user_id: str,
        calendar_event_id: str,
        meeting_title: str,
        start_epoch: int,
        proposal: FocusProposal,
        is_quiet_hours: bool = False,
    ) -> dict[str, Any]:
        """Format and deliver briefing to Bee Watch or Mobile Notification fallback."""
        evidence_sources = [f"Source: {ev_id}" for ev_id in proposal.evidence_ids]

        if self.watch_connected:
            card = WatchWhisperCard(
                calendar_event_id=calendar_event_id,
                user_id=user_id,
                meeting_title=meeting_title,
                start_epoch=start_epoch,
                prep_summary=proposal.prep_summary,
                questions=proposal.questions,
                emotion_tone=proposal.emotion_tone,
                evidence_sources=evidence_sources,
                delivered_to="bee_watch",
                is_quiet_hours=is_quiet_hours,
                haptic_enabled=not is_quiet_hours,
            )
            self.delivered_cards.append(card)
            return {
                "delivery_channel": "bee_watch",
                "card": card.model_dump(),
                "delivered": True,
            }
        else:
            # Fallback to iOS/Android mobile notification
            notification = MobileNotification(
                user_id=user_id,
                calendar_event_id=calendar_event_id,
                title=f"AURA: Prep for {meeting_title}",
                subtitle=f"Tone: {proposal.emotion_tone.capitalize()}",
                body=proposal.prep_summary[:180] + ("..." if len(proposal.prep_summary) > 180 else ""),
                deep_link=f"aura://meeting-prep/{calendar_event_id}?epoch={start_epoch}",
                sound_enabled=not is_quiet_hours,
                is_quiet_hours=is_quiet_hours,
            )
            self.delivered_notifications.append(notification)
            return {
                "delivery_channel": "mobile_fallback",
                "notification": notification.model_dump(),
                "delivered": True,
            }

    def record_feedback(
        self,
        user_id: str,
        feedback_action: Literal["Read", "Save", "Not useful", "Mute this event series"],
        calendar_event_id: str,
        series_id: str | None = None,
    ) -> dict[str, Any]:
        """Record user feedback without ever sharing data for model retraining."""
        prefs = self.user_preferences.setdefault(
            user_id,
            {
                "user_id": user_id,
                "pre_meeting_enabled": True,
                "muted_series": [],
                "feedback_history": [],
                "quiet_hours": {"enabled": False, "start_time": "22:00", "end_time": "07:00", "timezone": "UTC"},
                "updated_at": time.time(),
            },
        )

        entry = {
            "action": feedback_action,
            "calendar_event_id": calendar_event_id,
            "series_id": series_id,
            "timestamp": time.time(),
        }
        prefs["feedback_history"].append(entry)
        prefs["updated_at"] = time.time()

        if feedback_action == "Mute this event series" and series_id:
            if series_id not in prefs["muted_series"]:
                prefs["muted_series"].append(series_id)

        return {
            "status": "feedback_recorded",
            "user_id": user_id,
            "action": feedback_action,
            "muted_series_count": len(prefs["muted_series"]),
            "privacy_guarantee": "Feedback is private to user profile; never used for shared model retraining.",
        }

    def get_user_preferences(self, user_id: str) -> dict[str, Any]:
        """Retrieve user preference profile."""
        return self.user_preferences.get(
            user_id,
            {
                "user_id": user_id,
                "pre_meeting_enabled": True,
                "muted_series": [],
                "feedback_history": [],
                "quiet_hours": {"enabled": False, "start_time": "22:00", "end_time": "07:00", "timezone": "UTC"},
                "updated_at": time.time(),
            },
        )
