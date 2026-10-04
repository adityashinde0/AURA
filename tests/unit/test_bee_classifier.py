"""Unit tests for transparent local focus classifier and scoring."""
import pytest
from standalone_agent.bee_classifier import (
    FocusSignal,
    apply_decay,
    deep_work_delta,
    score_distraction,
)


def test_score_distraction_explicit_self_report():
    signals = [FocusSignal(signal_type="self_report_distracted", user_enabled=True)]
    score, reasons = score_distraction(signals)
    assert score == 0.80
    assert any("reported being distracted" in r for r in reasons)


def test_score_distraction_ignores_disabled_signals():
    # User did NOT enable local video noise signal
    signals = [
        FocusSignal(signal_type="allowed_video_noise", user_enabled=False),
        FocusSignal(signal_type="self_report_distracted", user_enabled=False),
    ]
    score, reasons = score_distraction(signals)
    assert score == 0.0
    assert len(reasons) == 0


def test_score_distraction_clamps_to_one():
    signals = [
        FocusSignal(signal_type="self_report_distracted", user_enabled=True),
        FocusSignal(signal_type="allowed_video_noise", user_enabled=True),
        FocusSignal(signal_type="self_report_distracted", user_enabled=True),
    ]
    score, _ = score_distraction(signals)
    assert score == 1.0


def test_apply_decay():
    initial = 0.80
    # After 15 minutes (1 half-life), score should be approx half
    decayed = apply_decay(initial, elapsed_minutes=15.0, half_life_minutes=15.0)
    assert decayed == 0.40

    # Zero or negative minutes shouldn't alter score
    assert apply_decay(0.80, 0.0) == 0.80


def test_deep_work_delta_bounds():
    # High distraction -> penalty -1
    assert deep_work_delta(score=0.85, focus_minutes=30) == -1

    # Good focus 25 mins -> +2
    assert deep_work_delta(score=0.10, focus_minutes=25) == 2

    # Great focus 50 mins -> +4
    assert deep_work_delta(score=0.10, focus_minutes=55) == 4

    # Delta always bounded within [-10, 10]
    for score in [0.0, 0.5, 1.0]:
        for minutes in [0, 25, 60, 120]:
            delta = deep_work_delta(score, minutes)
            assert -10 <= delta <= 10
