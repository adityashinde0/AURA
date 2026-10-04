"""Unit tests for Phase 5 Connected Device Certification, Boundaries, and Security."""
from __future__ import annotations

import time
import pytest
from standalone_agent.device_adapter import DeviceInfo, DeviceSimulatorAdapter


@pytest.fixture
def adapter() -> DeviceSimulatorAdapter:
    return DeviceSimulatorAdapter()


def test_certified_devices_have_valid_certification_and_secrets(adapter: DeviceSimulatorAdapter):
    fire_tv = adapter.get_device("dev_firetv_living_room")
    assert fire_tv is not None
    assert fire_tv.certification_status == "certified"
    assert "Amazon Fire TV MediaSession" in fire_tv.certification_standard
    assert fire_tv.secret_token_arn is not None
    assert fire_tv.secret_token_arn.startswith("arn:aws:secretsmanager:")

    echo_office = adapter.get_device("dev_echo_office")
    assert echo_office is not None
    assert echo_office.certification_status == "certified"
    assert "Alexa Smart Home DoNotDisturb" in echo_office.certification_standard
    assert echo_office.secret_token_arn is not None
    assert echo_office.secret_token_arn.startswith("arn:aws:secretsmanager:")


def test_device_auth_verification(adapter: DeviceSimulatorAdapter):
    # Certified device with valid Secrets Manager ARN passes
    valid, msg = adapter.verify_device_auth("dev_firetv_living_room")
    assert valid is True
    assert "Secrets Manager" in msg

    # Uncertified device fails auth check
    valid_uncert, msg_uncert = adapter.verify_device_auth("dev_smart_tv_unsupported")
    assert valid_uncert is False
    assert "Uncertified" in msg_uncert

    # Unknown device fails auth check
    valid_unk, msg_unk = adapter.verify_device_auth("dev_unknown_404")
    assert valid_unk is False


def test_household_boundary_isolation_blocks_cross_household_control(adapter: DeviceSimulatorAdapter):
    # Device belongs to 'household_default'
    # Request from different household 'household_stranger_99'
    receipt = adapter.execute_pause(
        device_id="dev_firetv_living_room",
        idempotency_key="key_household_test_1",
        requesting_household_id="household_stranger_99",
    )
    assert receipt.success is False
    assert "Household mismatch" in (receipt.error_message or "")
    assert receipt.undo_token is None

    # Request from matching household succeeds
    receipt_ok = adapter.execute_pause(
        device_id="dev_firetv_living_room",
        idempotency_key="key_household_test_2",
        requesting_household_id="household_default",
    )
    assert receipt_ok.success is True
    assert receipt_ok.undo_token is not None


def test_per_device_command_rate_limiting(adapter: DeviceSimulatorAdapter):
    # Register a device with tight rate limit (max 2 commands/min)
    adapter.register_device(
        DeviceInfo(
            device_id="dev_firetv_limited",
            name="Limited Fire TV",
            device_type="fire_tv",
            capabilities={"transport_control", "pause_playback", "resume_playback"},
            state="playing",
            is_online=True,
            household_id="household_default",
            certification_status="certified",
            command_rate_limit=2,
            secret_token_arn="arn:aws:secretsmanager:us-east-1:123456789012:secret:aura/devices/limited",
        )
    )

    # Command 1 succeeds
    r1 = adapter.execute_pause("dev_firetv_limited", idempotency_key="rate_key_1")
    assert r1.success is True

    # Reset device state for next command
    adapter.devices["dev_firetv_limited"].state = "playing"

    # Command 2 succeeds
    r2 = adapter.execute_pause("dev_firetv_limited", idempotency_key="rate_key_2")
    assert r2.success is True

    # Command 3 exceeds limit (2/min) -> should be rate limited
    adapter.devices["dev_firetv_limited"].state = "playing"
    r3 = adapter.execute_pause("dev_firetv_limited", idempotency_key="rate_key_3")
    assert r3.success is False
    assert "rate limit exceeded" in (r3.error_message or "").lower()


def test_list_devices_returns_complete_certification_metadata(adapter: DeviceSimulatorAdapter):
    devices = adapter.list_devices()
    assert len(devices) >= 5
    ids = {d["device_id"] for d in devices}
    assert "dev_firetv_living_room" in ids
    assert "dev_echo_office" in ids
    assert "dev_smart_tv_unsupported" in ids

    living_tv = next(d for d in devices if d["device_id"] == "dev_firetv_living_room")
    assert living_tv["certification_status"] == "certified"
    assert living_tv["has_secret_arn"] is True
