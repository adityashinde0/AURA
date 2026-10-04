"""Focus Session lifecycle and Deep Work Bank manager for Project AURA.

Enforces:
- FR-5: Focus Guardian accepts explicit start/stop, explicit "I'm distracted",
  and separately consented local signals. Transparent, non-diagnostic score.
- FR-8: Deep Work Bank awards points only to the user, supports no team
  leaderboard by default, and never feeds employer performance assessment.
- Optional signals stay disabled until individual consent is recorded.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from standalone_agent.bee_classifier import (
    FocusSignal,
    SignalType,
    apply_decay,
    deep_work_delta,
    score_distraction,
)

SessionStatus = Literal["active", "completed", "cancelled"]


@dataclass
class BankTransaction:
    transaction_id: str
    timestamp: float
    session_id: str
    delta: int
    reason: str


@dataclass
class DeepWorkBank:
    user_id: str
    balance: int = 0
    transactions: list[BankTransaction] = field(default_factory=list)

    def record_points(self, session_id: str, delta: int, reason: str) -> BankTransaction:
        """Award points delta [-10, 10] privately to the user."""
        clamped_delta = max(-10, min(delta, 10))
        self.balance = max(0, self.balance + clamped_delta)  # balance non-negative
        tx = BankTransaction(
            transaction_id=f"tx_{uuid.uuid4().hex[:10]}",
            timestamp=time.time(),
            session_id=session_id,
            delta=clamped_delta,
            reason=reason,
        )
        self.transactions.append(tx)
        return tx

    def export_private_history(self) -> dict[str, Any]:
        """Strictly user-private summary; never exposes a team leaderboard or employer score."""
        return {
            "user_id": self.user_id,
            "deep_work_balance": self.balance,
            "private_only": True,
            "team_sharing_enabled": False,
            "employer_reporting": "STRICTLY_PROHIBITED",
            "transaction_count": len(self.transactions),
            "recent_transactions": [
                {
                    "transaction_id": tx.transaction_id,
                    "session_id": tx.session_id,
                    "delta": tx.delta,
                    "reason": tx.reason,
                    "timestamp": tx.timestamp,
                }
                for tx in reversed(self.transactions[-20:])
            ],
        }


@dataclass
class FocusSession:
    session_id: str
    user_id: str
    duration_minutes: int
    started_at: float
    status: SessionStatus = "active"
    ended_at: float | None = None
    distraction_score: float = 0.0
    score_explanations: list[str] = field(default_factory=list)
    enabled_signals: set[str] = field(default_factory=set)  # optional signals with recorded consent
    signals_received: list[FocusSignal] = field(default_factory=list)
    bank_points_earned: int = 0


class FocusSessionManager:
    """Manages Focus Guardian sessions, transparent scoring, and the Deep Work Bank."""

    def __init__(self) -> None:
        self.sessions: dict[str, FocusSession] = {}
        self.banks: dict[str, DeepWorkBank] = {}  # by user_id
        self.signal_consents: dict[str, set[str]] = {}  # user_id -> set of consented signal types

    def get_or_create_bank(self, user_id: str) -> DeepWorkBank:
        if user_id not in self.banks:
            self.banks[user_id] = DeepWorkBank(user_id=user_id, balance=0)
        return self.banks[user_id]

    def set_signal_consent(self, user_id: str, signal_name: str, consented: bool) -> None:
        """Record explicit consent for optional local signals (e.g. allowed_video_noise)."""
        if user_id not in self.signal_consents:
            self.signal_consents[user_id] = set()
        if consented:
            self.signal_consents[user_id].add(signal_name)
        else:
            self.signal_consents[user_id].discard(signal_name)

    def is_signal_consented(self, user_id: str, signal_name: str) -> bool:
        return signal_name in self.signal_consents.get(user_id, set())

    def start_session(
        self,
        user_id: str,
        duration_minutes: int = 25,
        session_id: str | None = None,
        requested_signals: list[str] | None = None,
    ) -> FocusSession:
        """Start a focus session with only explicitly consented signals enabled."""
        sid = session_id or f"sess_{uuid.uuid4().hex[:10]}"
        now = time.time()

        # Filter signals: ONLY consented signals are enabled
        active_signals: set[str] = set()
        if requested_signals:
            for sig in requested_signals:
                if self.is_signal_consented(user_id, sig):
                    active_signals.add(sig)

        session = FocusSession(
            session_id=sid,
            user_id=user_id,
            duration_minutes=duration_minutes,
            started_at=now,
            status="active",
            enabled_signals=active_signals,
            score_explanations=["Focus session started."],
        )
        self.sessions[sid] = session
        # Ensure bank exists
        self.get_or_create_bank(user_id)
        return session

    def report_distraction(self, session_id: str) -> dict[str, Any]:
        """Handle explicit 'I'm distracted' report (the primary, highest-confidence signal)."""
        session = self.sessions.get(session_id)
        if not session or session.status != "active":
            return {"error": "session_not_active", "message": "No active focus session found"}

        signal = FocusSignal(
            signal_type="self_report_distracted",
            user_enabled=True,
            timestamp=time.time(),
        )
        session.signals_received.append(signal)

        # Re-score
        score, reasons = score_distraction(session.signals_received)
        session.distraction_score = score
        session.score_explanations.extend(reasons)

        # Deep work penalty for explicit distraction
        bank = self.get_or_create_bank(session.user_id)
        penalty = deep_work_delta(score=score, focus_minutes=0)
        bank.record_points(session_id=session_id, delta=penalty, reason="Explicit distraction self-report")
        session.bank_points_earned += penalty

        return {
            "session_id": session_id,
            "distraction_score": score,
            "reasons": reasons,
            "bank_delta": penalty,
            "bank_balance": bank.balance,
            "is_distracted": True,
            "recommended_action": "request_pause",
            "explanation": "You explicitly self-reported being distracted. Proposing to pause allowed media devices.",
        }

    def process_optional_signal(self, session_id: str, signal_type: SignalType) -> dict[str, Any]:
        """Process optional local signal. If unconsented, it is strictly ignored."""
        session = self.sessions.get(session_id)
        if not session or session.status != "active":
            return {"error": "session_not_active", "message": "No active focus session found"}

        # Enforce boundary: signal must be explicitly consented
        if not self.is_signal_consented(session.user_id, signal_type):
            return {
                "session_id": session_id,
                "signal_type": signal_type,
                "status": "ignored_unconsented",
                "message": f"Optional signal '{signal_type}' ignored because user consent was not granted.",
                "distraction_score": session.distraction_score,
            }

        signal = FocusSignal(
            signal_type=signal_type,
            user_enabled=True,
            timestamp=time.time(),
        )
        session.signals_received.append(signal)

        score, reasons = score_distraction(session.signals_received)
        session.distraction_score = score
        session.score_explanations.extend(reasons)

        return {
            "session_id": session_id,
            "signal_type": signal_type,
            "status": "processed",
            "distraction_score": score,
            "reasons": reasons,
        }

    def end_session(self, session_id: str) -> dict[str, Any]:
        """Terminate a focus session, apply time decay, award deep work points."""
        session = self.sessions.get(session_id)
        if not session or session.status != "active":
            return {"error": "session_not_active", "message": "No active focus session found"}

        now = time.time()
        session.ended_at = now
        session.status = "completed"

        elapsed_minutes = max(1.0, (now - session.started_at) / 60.0)
        final_score = apply_decay(session.distraction_score, elapsed_minutes=elapsed_minutes)
        session.distraction_score = final_score

        # Award completion points
        int_minutes = int(elapsed_minutes)
        points_delta = deep_work_delta(score=final_score, focus_minutes=int_minutes)
        bank = self.get_or_create_bank(session.user_id)
        if points_delta > 0:
            bank.record_points(
                session_id=session_id,
                delta=points_delta,
                reason=f"Completed {int_minutes} minutes deep work session with distraction score {final_score}",
            )
            session.bank_points_earned += points_delta

        return {
            "session_id": session_id,
            "user_id": session.user_id,
            "status": "completed",
            "elapsed_minutes": round(elapsed_minutes, 1),
            "final_score": final_score,
            "bank_points_earned": points_delta,
            "total_bank_balance": bank.balance,
        }
