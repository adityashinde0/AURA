"""Simulated Connected Device Adapter for Project AURA.

Implements verified, documented control paths for smart home devices:
- Fire TV Media Session transport controls (pause/resume playback)
- Echo / Alexa Do Not Disturb (DND toggle)

Enforces:
- Target device allowlist validation
- Documented/certified control paths only (MediaSession API for Fire TV, DND for Echo)
- Idempotency with outbox receipts
- Reversible operations with Undo tokens
- Graceful failure for offline devices and unsupported capabilities
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

DeviceType = Literal["fire_tv", "echo_speaker", "generic_smart_device"]
DeviceState = Literal["playing", "paused", "dnd_active", "dnd_inactive", "idle", "offline"]


@dataclass
class DeviceInfo:
    device_id: str
    name: str
    device_type: DeviceType
    capabilities: set[str]
    state: DeviceState = "playing"
    is_online: bool = True
    household_id: str = "household_default"


@dataclass
class DeviceActionReceipt:
    receipt_id: str
    idempotency_key: str
    device_id: str
    action: str
    previous_state: DeviceState
    new_state: DeviceState
    undo_token: str | None
    timestamp: float = field(default_factory=time.time)
    undone: bool = False
    success: bool = True
    error_message: str | None = None


class DeviceSimulatorAdapter:
    """Certified simulator adapter for Fire TV MediaSession and Echo DND controls."""

    def __init__(self) -> None:
        self.devices: dict[str, DeviceInfo] = {}
        self.receipts: dict[str, DeviceActionReceipt] = {}  # by idempotency_key
        self.undo_map: dict[str, DeviceActionReceipt] = {}  # by undo_token
        self._seed_default_devices()

    def _seed_default_devices(self) -> None:
        """Seed certified reference devices."""
        self.register_device(
            DeviceInfo(
                device_id="dev_firetv_living_room",
                name="Living Room Fire TV Stick 4K",
                device_type="fire_tv",
                capabilities={"transport_control", "pause_playback", "resume_playback"},
                state="playing",
                is_online=True,
            )
        )
        self.register_device(
            DeviceInfo(
                device_id="dev_echo_office",
                name="Office Echo Dot 5th Gen",
                device_type="echo_speaker",
                capabilities={"dnd_control", "set_dnd", "clear_dnd"},
                state="dnd_inactive",
                is_online=True,
            )
        )
        self.register_device(
            DeviceInfo(
                device_id="dev_smart_tv_unsupported",
                name="Old Uncertified Smart TV",
                device_type="generic_smart_device",
                capabilities=set(),  # No certified control paths
                state="idle",
                is_online=True,
            )
        )

    def register_device(self, device: DeviceInfo) -> None:
        self.devices[device.device_id] = device

    def get_device(self, device_id: str) -> DeviceInfo | None:
        return self.devices.get(device_id)

    def is_capability_supported(self, device_id: str, action: str) -> bool:
        device = self.devices.get(device_id)
        if not device:
            return False
        if action in ("request_pause", "pause"):
            return "transport_control" in device.capabilities or "pause_playback" in device.capabilities
        if action in ("request_dnd", "dnd"):
            return "dnd_control" in device.capabilities or "set_dnd" in device.capabilities
        return False

    def execute_pause(
        self,
        device_id: str,
        idempotency_key: str,
    ) -> DeviceActionReceipt:
        """Pause playback on a supported Fire TV using Media Session transport controls."""
        if idempotency_key in self.receipts:
            return self.receipts[idempotency_key]

        device = self.devices.get(device_id)
        if not device:
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_pause",
                previous_state="idle",
                new_state="idle",
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} not found",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        if not device.is_online:
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_pause",
                previous_state=device.state,
                new_state=device.state,
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} is offline / unreachable",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        if not self.is_capability_supported(device_id, "request_pause"):
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_pause",
                previous_state=device.state,
                new_state=device.state,
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} does not support certified MediaSession transport control",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        prev_state = device.state
        device.state = "paused"
        undo_token = f"undo_pause_{uuid.uuid4().hex[:10]}"

        receipt = DeviceActionReceipt(
            receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
            idempotency_key=idempotency_key,
            device_id=device_id,
            action="request_pause",
            previous_state=prev_state,
            new_state="paused",
            undo_token=undo_token,
            success=True,
        )
        self.receipts[idempotency_key] = receipt
        self.undo_map[undo_token] = receipt
        return receipt

    def execute_dnd(
        self,
        device_id: str,
        idempotency_key: str,
    ) -> DeviceActionReceipt:
        """Enable Do Not Disturb on a supported Echo speaker."""
        if idempotency_key in self.receipts:
            return self.receipts[idempotency_key]

        device = self.devices.get(device_id)
        if not device:
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_dnd",
                previous_state="idle",
                new_state="idle",
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} not found",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        if not device.is_online:
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_dnd",
                previous_state=device.state,
                new_state=device.state,
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} is offline / unreachable",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        if not self.is_capability_supported(device_id, "request_dnd"):
            receipt = DeviceActionReceipt(
                receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
                idempotency_key=idempotency_key,
                device_id=device_id,
                action="request_dnd",
                previous_state=device.state,
                new_state=device.state,
                undo_token=None,
                success=False,
                error_message=f"Device {device_id} does not support certified Echo DND control",
            )
            self.receipts[idempotency_key] = receipt
            return receipt

        prev_state = device.state
        device.state = "dnd_active"
        undo_token = f"undo_dnd_{uuid.uuid4().hex[:10]}"

        receipt = DeviceActionReceipt(
            receipt_id=f"rcpt_{uuid.uuid4().hex[:8]}",
            idempotency_key=idempotency_key,
            device_id=device_id,
            action="request_dnd",
            previous_state=prev_state,
            new_state="dnd_active",
            undo_token=undo_token,
            success=True,
        )
        self.receipts[idempotency_key] = receipt
        self.undo_map[undo_token] = receipt
        return receipt

    def execute_undo(self, undo_token: str) -> dict[str, Any]:
        """Reverse device action using the undo token (resumes playback or disables DND)."""
        receipt = self.undo_map.get(undo_token)
        if not receipt:
            return {"success": False, "message": "Invalid or unknown undo token"}

        if receipt.undone:
            return {
                "success": True,
                "message": "Action was already reversed (idempotent)",
                "device_id": receipt.device_id,
                "restored_state": receipt.previous_state,
            }

        device = self.devices.get(receipt.device_id)
        if device:
            # Restore previous state
            device.state = receipt.previous_state

        receipt.undone = True
        return {
            "success": True,
            "message": f"Action reversed: {receipt.action} restored device to {receipt.previous_state}",
            "device_id": receipt.device_id,
            "restored_state": receipt.previous_state,
        }
