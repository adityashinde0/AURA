"""Unit tests for Phase 5 Multi-Tier Feature Flags and Kill Switches."""
from __future__ import annotations

import pytest
from standalone_agent.feature_flags import FeatureFlagManager


def test_global_kill_switch_blocks_all_tenants_and_users():
    mgr = FeatureFlagManager()
    # Initially enabled
    enabled, reason = mgr.is_feature_enabled("request_pause", tenant_id="tenant_acme", user_id="usr_01")
    assert enabled is True
    assert "active and permitted" in reason

    # Trigger Global Kill Switch for request_pause
    mgr.set_global_kill_switch("request_pause", enabled=False)

    # All users and tenants should be blocked
    enabled_user1, reason1 = mgr.is_feature_enabled("request_pause", tenant_id="tenant_acme", user_id="usr_01")
    assert enabled_user1 is False
    assert "Global Kill Switch" in reason1

    enabled_user2, reason2 = mgr.is_feature_enabled("request_pause", tenant_id="tenant_other", user_id="usr_02")
    assert enabled_user2 is False
    assert "Global Kill Switch" in reason2

    # Other capability remains enabled
    enabled_dnd, _ = mgr.is_feature_enabled("request_dnd", tenant_id="tenant_acme", user_id="usr_01")
    assert enabled_dnd is True


def test_tenant_kill_switch_isolates_tenant():
    mgr = FeatureFlagManager()

    # Disable for tenant_beta
    mgr.set_tenant_kill_switch("tenant_beta", "request_pause", enabled=False)

    # User in tenant_beta is blocked
    enabled_beta, reason_beta = mgr.is_feature_enabled("request_pause", tenant_id="tenant_beta", user_id="usr_beta_1")
    assert enabled_beta is False
    assert "Tenant 'tenant_beta' Kill Switch" in reason_beta

    # User in tenant_prod remains enabled
    enabled_prod, reason_prod = mgr.is_feature_enabled("request_pause", tenant_id="tenant_prod", user_id="usr_prod_1")
    assert enabled_prod is True
    assert "active and permitted" in reason_prod


def test_user_level_flag_overrides():
    mgr = FeatureFlagManager()

    # Explicitly disable for usr_special
    mgr.set_user_flag("usr_special", "request_pause", enabled=False)

    enabled_special, reason_special = mgr.is_feature_enabled("request_pause", tenant_id="tenant_default", user_id="usr_special")
    assert enabled_special is False
    assert "explicitly disabled for User 'usr_special'" in reason_special

    # Other user in same tenant is permitted
    enabled_other, _ = mgr.is_feature_enabled("request_pause", tenant_id="tenant_default", user_id="usr_regular")
    assert enabled_other is True


def test_rollout_percentage_deterministic_cohort():
    mgr = FeatureFlagManager()

    # Set 0% rollout
    mgr.set_rollout_percentage("request_pause", 0)
    enabled, reason = mgr.is_feature_enabled("request_pause", user_id="usr_test_cohort")
    assert enabled is False
    assert "cohort" in reason

    # Set 100% rollout
    mgr.set_rollout_percentage("request_pause", 100)
    enabled_full, _ = mgr.is_feature_enabled("request_pause", user_id="usr_test_cohort")
    assert enabled_full is True


def test_get_all_flags_export():
    mgr = FeatureFlagManager()
    mgr.set_tenant_kill_switch("tenant_x", "slack_post", False)
    mgr.set_user_flag("usr_y", "request_dnd", False)

    snapshot = mgr.get_all_flags()
    assert "global_switches" in snapshot
    assert "tenant_switches" in snapshot
    assert snapshot["tenant_switches"]["tenant_x"]["slack_post"] is False
    assert snapshot["user_flags"]["usr_y"]["request_dnd"] is False
