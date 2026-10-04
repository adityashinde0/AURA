"""Unit tests for Simulated Connected Device Adapter (Fire TV and Echo DND)."""
import pytest

from standalone_agent.device_adapter import DeviceInfo, DeviceSimulatorAdapter


@pytest.fixture
def adapter() -> DeviceSimulatorAdapter:
    return DeviceSimulatorAdapter()


def test_fire_tv_pause_and_undo(adapter: DeviceSimulatorAdapter) -> None:
    device = adapter.get_device("dev_firetv_living_room")
    assert device is not None
    assert device.state == "playing"

    # 1. Execute pause
    receipt = adapter.execute_pause("dev_firetv_living_room", idempotency_key="key_pause_1")
    assert receipt.success is True
    assert receipt.action == "request_pause"
    assert receipt.new_state == "paused"
    assert receipt.undo_token is not None
    assert device.state == "paused"

    # 2. Idempotency: repeated call with same key returns identical receipt
    receipt2 = adapter.execute_pause("dev_firetv_living_room", idempotency_key="key_pause_1")
    assert receipt2.receipt_id == receipt.receipt_id
    assert receipt2.undo_token == receipt.undo_token

    # 3. Undo: restores playback
    undo_res = adapter.execute_undo(receipt.undo_token)
    assert undo_res["success"] is True
    assert undo_res["restored_state"] == "playing"
    assert device.state == "playing"

    # 4. Repeated undo is idempotent
    undo_res2 = adapter.execute_undo(receipt.undo_token)
    assert undo_res2["success"] is True
    assert "already reversed" in undo_res2["message"]


def test_echo_dnd_and_undo(adapter: DeviceSimulatorAdapter) -> None:
    device = adapter.get_device("dev_echo_office")
    assert device is not None
    assert device.state == "dnd_inactive"

    # 1. Execute DND
    receipt = adapter.execute_dnd("dev_echo_office", idempotency_key="key_dnd_1")
    assert receipt.success is True
    assert receipt.action == "request_dnd"
    assert receipt.new_state == "dnd_active"
    assert receipt.undo_token is not None
    assert device.state == "dnd_active"

    # 2. Undo restores DND to inactive
    undo_res = adapter.execute_undo(receipt.undo_token)
    assert undo_res["success"] is True
    assert undo_res["restored_state"] == "dnd_inactive"
    assert device.state == "dnd_inactive"


def test_unsupported_device_fails_safely(adapter: DeviceSimulatorAdapter) -> None:
    # Unsupported device without certified media capabilities
    receipt = adapter.execute_pause("dev_smart_tv_unsupported", idempotency_key="key_unsupported_1")
    assert receipt.success is False
    assert "does not support certified" in (receipt.error_message or "")
    assert receipt.undo_token is None


def test_offline_device_fails_safely(adapter: DeviceSimulatorAdapter) -> None:
    adapter.register_device(
        DeviceInfo(
            device_id="dev_firetv_bedroom_offline",
            name="Bedroom Fire TV",
            device_type="fire_tv",
            capabilities={"transport_control", "pause_playback"},
            state="playing",
            is_online=False,
        )
    )
    receipt = adapter.execute_pause("dev_firetv_bedroom_offline", idempotency_key="key_offline_1")
    assert receipt.success is False
    assert "offline" in (receipt.error_message or "").lower()


def test_unknown_device_fails_safely(adapter: DeviceSimulatorAdapter) -> None:
    receipt = adapter.execute_pause("dev_nonexistent_999", idempotency_key="key_none_1")
    assert receipt.success is False
    assert "not found" in (receipt.error_message or "").lower()
