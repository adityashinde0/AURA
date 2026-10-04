"""Feature flags and multi-tier kill switches for Project AURA.

Enforces architecture requirements (ARCHITECTURE.md line 108):
- Global kill switch: System-wide instant disable of any action capability.
- Tenant kill switch: Per-tenant action capability gates.
- User feature flags & cohort rollouts: Progressive user enablement.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FeatureFlagManager:
    """Manages multi-tier feature flags and emergency kill switches."""

    # Global kill switches: capability -> is_enabled (default True)
    global_switches: dict[str, bool] = field(
        default_factory=lambda: {
            "request_pause": True,
            "request_dnd": True,
            "watch_whisper": True,
            "slack_post": True,
            "bedrock_model_v2": True,
        }
    )

    # Tenant-level kill switches: tenant_id -> {capability: is_enabled}
    tenant_switches: dict[str, dict[str, bool]] = field(default_factory=dict)

    # User-level feature flags: user_id -> {capability: is_enabled}
    user_flags: dict[str, dict[str, bool]] = field(default_factory=dict)

    # Progressive percentage rollout per capability (0 to 100)
    rollout_percentages: dict[str, int] = field(
        default_factory=lambda: {
            "request_pause": 100,
            "request_dnd": 100,
            "watch_whisper": 100,
            "slack_post": 100,
            "bedrock_model_v2": 100,
        }
    )

    def is_feature_enabled(
        self,
        capability: str,
        tenant_id: str = "tenant_default",
        user_id: str | None = None,
    ) -> tuple[bool, str]:
        """Evaluate feature enablement through the 3-tier hierarchy: Global -> Tenant -> User.

        Returns:
            (is_enabled, reason_string)
        """
        # Tier 1: Global Kill Switch
        if not self.global_switches.get(capability, True):
            return False, f"Capability '{capability}' is disabled by Global Kill Switch"

        # Tier 2: Tenant Kill Switch
        if tenant_id in self.tenant_switches:
            if not self.tenant_switches[tenant_id].get(capability, True):
                return False, f"Capability '{capability}' is disabled by Tenant '{tenant_id}' Kill Switch"

        # Tier 3: Explicit User Flag Override
        if user_id and user_id in self.user_flags:
            if capability in self.user_flags[user_id]:
                enabled = self.user_flags[user_id][capability]
                if not enabled:
                    return False, f"Capability '{capability}' is explicitly disabled for User '{user_id}'"
                return True, f"Capability '{capability}' is explicitly enabled for User '{user_id}'"

        # Tier 4: Percentage Cohort Rollout (deterministic hash on user_id)
        if user_id and capability in self.rollout_percentages:
            pct = self.rollout_percentages[capability]
            if pct < 100:
                hash_val = int(hashlib.md5(f"{capability}:{user_id}".encode()).hexdigest(), 16) % 100
                if hash_val >= pct:
                    return (
                        False,
                        f"Capability '{capability}' not yet enabled for user cohort ({hash_val} >= {pct}%)",
                    )

        return True, f"Capability '{capability}' is active and permitted"

    def set_global_kill_switch(self, capability: str, enabled: bool) -> None:
        """Trigger or reset global emergency kill switch."""
        self.global_switches[capability] = enabled

    def set_tenant_kill_switch(self, tenant_id: str, capability: str, enabled: bool) -> None:
        """Set tenant-specific kill switch."""
        if tenant_id not in self.tenant_switches:
            self.tenant_switches[tenant_id] = {}
        self.tenant_switches[tenant_id][capability] = enabled

    def set_user_flag(self, user_id: str, capability: str, enabled: bool) -> None:
        """Set user-specific feature flag."""
        if user_id not in self.user_flags:
            self.user_flags[user_id] = {}
        self.user_flags[user_id][capability] = enabled

    def set_rollout_percentage(self, capability: str, percentage: int) -> None:
        """Configure staged rollout percentage (0-100)."""
        self.rollout_percentages[capability] = max(0, min(100, percentage))

    def get_all_flags(self) -> dict[str, Any]:
        """Export snapshot of all flag tiers."""
        return {
            "global_switches": dict(self.global_switches),
            "tenant_switches": {k: dict(v) for k, v in self.tenant_switches.items()},
            "user_flags": {k: dict(v) for k, v in self.user_flags.items()},
            "rollout_percentages": dict(self.rollout_percentages),
        }
