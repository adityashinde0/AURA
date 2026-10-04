"""Unit tests for Phase 5 Undo Rate Safety Guardrail and Circuit Breaker."""
from __future__ import annotations

import pytest
from standalone_agent.undo_guardrail import UndoRateGuardrail


def test_guardrail_tracks_executions_and_undos():
    guard = UndoRateGuardrail(threshold_rate=0.05, min_sample_size=5)
    user_id = "usr_marcus"
    action = "request_pause"

    # Record 4 executions, 0 undos
    for _ in range(4):
        guard.record_execution(user_id, action)

    paused, rate = guard.is_auto_execution_paused(user_id, action)
    assert paused is False
    assert rate == 0.0


def test_guardrail_does_not_trip_before_min_sample_size():
    guard = UndoRateGuardrail(threshold_rate=0.05, min_sample_size=5)
    user_id = "usr_marcus"
    action = "request_pause"

    # 2 executions, 1 undo -> rate 50%, but sample size is only 2 < 5
    guard.record_execution(user_id, action)
    guard.record_execution(user_id, action)
    tripped = guard.record_undo(user_id, action)

    assert tripped is False
    paused, rate = guard.is_auto_execution_paused(user_id, action)
    assert paused is False
    assert rate == 0.5


def test_guardrail_trips_when_undo_rate_exceeds_threshold():
    # 5% threshold, min sample size 5
    guard = UndoRateGuardrail(threshold_rate=0.05, min_sample_size=5)
    user_id = "usr_marcus"
    action = "request_pause"

    # Execute 10 actions
    for _ in range(10):
        guard.record_execution(user_id, action)

    # 0 undos -> rate 0%
    paused, rate = guard.is_auto_execution_paused(user_id, action)
    assert paused is False
    assert rate == 0.0

    # 1 undo out of 10 = 10% > 5% threshold
    tripped = guard.record_undo(user_id, action)
    assert tripped is True

    paused, rate = guard.is_auto_execution_paused(user_id, action)
    assert paused is True
    assert rate == 0.10


def test_guardrail_reset_resumes_auto_execution():
    guard = UndoRateGuardrail(threshold_rate=0.05, min_sample_size=5)
    user_id = "usr_marcus"
    action = "request_pause"

    for _ in range(10):
        guard.record_execution(user_id, action)
    guard.record_undo(user_id, action)

    paused, _ = guard.is_auto_execution_paused(user_id, action)
    assert paused is True

    # Admin/User resets circuit breaker
    guard.reset_circuit_breaker(user_id, action)

    paused_after, rate_after = guard.is_auto_execution_paused(user_id, action)
    assert paused_after is False
    assert rate_after == 0.0


def test_metrics_summary_generation():
    guard = UndoRateGuardrail(threshold_rate=0.05, min_sample_size=5)
    guard.record_execution("usr_a", "request_pause")
    guard.record_execution("usr_b", "request_dnd")

    summary = guard.get_metrics_summary()
    assert len(summary) == 2
    users = {s["user_id"] for s in summary}
    assert users == {"usr_a", "usr_b"}
