"""Safety guardrail and circuit breaker for Project AURA device actions.

Implements PRD Section 6 guardrail:
- "Undo rate > 5% for a policy pauses auto-execution."
- Reverts high-undo policies to manual confirmation ('ask_user_confirmation')
- Tracks execution metrics and exposes admin/user reset capability.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PolicyMetric:
    executions: int = 0
    undos: int = 0
    auto_execution_paused: bool = False
    tripped_at: float | None = None
    last_action_at: float | None = None

    @property
    def undo_rate(self) -> float:
        if self.executions == 0:
            return 0.0
        return self.undos / self.executions


class UndoRateGuardrail:
    """Tracks action executions and undo reversals; automatically trips circuit breaker if undo rate > 5%."""

    def __init__(self, threshold_rate: float = 0.05, min_sample_size: int = 5) -> None:
        """Args:

        threshold_rate: Maximum allowed undo rate before auto-execution is paused (0.05 = 5%).
        min_sample_size: Minimum executions required before guardrail evaluates, preventing 1/1 false trips.
        """
        self.threshold_rate = threshold_rate
        self.min_sample_size = min_sample_size
        # Key: f"{user_id}:{action_type}" or f"global:{action_type}"
        self.metrics: dict[str, PolicyMetric] = {}

    def _get_metric(self, user_id: str, action_type: str) -> PolicyMetric:
        key = f"{user_id}:{action_type}"
        if key not in self.metrics:
            self.metrics[key] = PolicyMetric()
        return self.metrics[key]

    def record_execution(self, user_id: str, action_type: str) -> None:
        """Record an executed device action."""
        metric = self._get_metric(user_id, action_type)
        metric.executions += 1
        metric.last_action_at = time.time()

    def record_undo(self, user_id: str, action_type: str) -> bool:
        """Record an action reversal. Returns True if this undo tripped the auto-execution pause."""
        metric = self._get_metric(user_id, action_type)
        metric.undos += 1
        metric.last_action_at = time.time()

        if metric.executions >= self.min_sample_size and metric.undo_rate > self.threshold_rate:
            if not metric.auto_execution_paused:
                metric.auto_execution_paused = True
                metric.tripped_at = time.time()
                return True
        return False

    def is_auto_execution_paused(self, user_id: str, action_type: str) -> tuple[bool, float]:
        """Check if auto-execution is currently paused for this policy.

        Returns:
            (is_paused, current_undo_rate)
        """
        metric = self._get_metric(user_id, action_type)
        if metric.executions >= self.min_sample_size and metric.undo_rate > self.threshold_rate:
            metric.auto_execution_paused = True
        return metric.auto_execution_paused, metric.undo_rate


    def reset_circuit_breaker(self, user_id: str, action_type: str) -> None:
        """Reset the circuit breaker, resuming auto-execution capability."""
        key = f"{user_id}:{action_type}"
        if key in self.metrics:
            metric = self.metrics[key]
            metric.auto_execution_paused = False
            metric.tripped_at = None
            # Reset counters or halve them to establish fresh baseline
            metric.executions = 0
            metric.undos = 0

    def get_metrics_summary(self, user_id: str | None = None) -> list[dict[str, Any]]:
        """Return status metrics for Control Plane UI / audit inspectability."""
        summary = []
        for key, m in self.metrics.items():
            u_id, action = key.split(":", 1)
            if user_id is None or u_id == user_id:
                summary.append(
                    {
                        "user_id": u_id,
                        "action_type": action,
                        "executions": m.executions,
                        "undos": m.undos,
                        "undo_rate": round(m.undo_rate, 4),
                        "undo_rate_percentage": round(m.undo_rate * 100, 2),
                        "threshold_percentage": round(self.threshold_rate * 100, 1),
                        "auto_execution_paused": m.auto_execution_paused,
                        "tripped_at": m.tripped_at,
                        "last_action_at": m.last_action_at,
                    }
                )
        return summary
