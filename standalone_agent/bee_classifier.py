"""Transparent, local-first focus scoring for AURA.

This is not a behavioral surveillance classifier: only signals the user enabled
or explicitly reported may be passed in.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

SignalType = Literal["self_report_distracted", "allowed_video_noise", "focus_started"]


@dataclass(frozen=True)
class FocusSignal:
    signal_type: SignalType
    user_enabled: bool


def score_distraction(signals: list[FocusSignal]) -> tuple[float, list[str]]:
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
    return min(score, 1.0), reasons


def deep_work_delta(score: float, focus_minutes: int) -> int:
    if score >= 0.75:
        return -1
    if focus_minutes >= 25 and score < 0.25:
        return 2
    return 0
