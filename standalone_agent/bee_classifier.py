"""Transparent, local-first focus scoring for AURA.

This is not a behavioral surveillance classifier: only signals the user enabled
or explicitly reported may be passed in. Scores decay over time and remain clamped.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

SignalType = Literal["self_report_distracted", "allowed_video_noise", "focus_started"]


@dataclass(frozen=True)
class FocusSignal:
    signal_type: SignalType
    user_enabled: bool
    timestamp: float | None = None


def score_distraction(signals: list[FocusSignal]) -> tuple[float, list[str]]:
    """Compute transparent distraction score clamped between 0.0 and 1.0."""
    score, reasons = 0.0, []
    for signal in signals:
        if not signal.user_enabled:
            continue
        if signal.signal_type == "self_report_distracted":
            score += 0.80
            reasons.append("You reported being distracted.")
        elif signal.signal_type == "allowed_video_noise":
            score += 0.25
            reasons.append("An enabled local focus signal was detected.")
        elif signal.signal_type == "focus_started":
            score += 0.0
            reasons.append("Focus session initialized.")
    clamped_score = max(0.0, min(score, 1.0))
    return round(clamped_score, 2), reasons


def apply_decay(initial_score: float, elapsed_minutes: float, half_life_minutes: float = 15.0) -> float:
    """Decay distraction score exponentially over elapsed uninterrupted focus minutes."""
    if elapsed_minutes <= 0 or initial_score <= 0:
        return max(0.0, min(initial_score, 1.0))
    decayed = initial_score * math.pow(0.5, elapsed_minutes / half_life_minutes)
    return round(max(0.0, min(decayed, 1.0)), 2)


def deep_work_delta(score: float, focus_minutes: int) -> int:
    """Calculate Deep Work Bank points delta within strictly approved bounds [-10, 10]."""
    delta = 0
    if score >= 0.75:
        delta = -1
    elif focus_minutes >= 50 and score < 0.20:
        delta = 4
    elif focus_minutes >= 25 and score < 0.25:
        delta = 2
    return max(-10, min(delta, 10))
