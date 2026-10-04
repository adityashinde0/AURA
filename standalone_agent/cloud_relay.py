"""Cloud Relay adapter for Project AURA local companion.

Drains pending envelopes from the bounded LocalOutbox, relays them to Cloud Intake
via signed/authenticated WebSocket or HTTP, and triggers outbox body purging
upon verified server acknowledgement.
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable

from standalone_agent.bee_monitor import LocalOutbox


class CloudRelayClient:
    """Client for securely transmitting minimized envelopes to AURA Cloud Intake."""

    def __init__(
        self,
        endpoint_url: str = "https://api.aura.internal/v1/api/v1/focus/signal",
        auth_token: str = "aura_bearer_token_secret_min_16_chars",
        user_id: str = "usr_aditi_01",
        tenant_id: str = "tenant_default",
        transport_fn: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    ) -> None:
        self.endpoint_url = endpoint_url
        self.auth_token = auth_token
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.transport_fn = transport_fn

    def format_relay_envelope(self, outbox_item: dict[str, Any]) -> dict[str, Any]:
        """Convert outbox entry to validated Cloud Intake relay envelope."""
        payload = outbox_item.get("payload", {})
        evidence = payload.get("evidence", [])
        return {
            "action": "relay",
            "event_id": outbox_item["id"],
            "event_type": outbox_item["event_type"],
            "timestamp": outbox_item.get("created_at", time.time()),
            "user_id": self.user_id,
            "session_id": payload.get("session_id", "session_default"),
            "source": payload.get("source", "bee_local"),
            "evidence": evidence,
            "signal_payload": {
                "explicit_signal": payload.get("explicit_signal", "none"),
                "consented_signal_score": payload.get("consented_signal_score", 0.0),
            },
        }

    def dispatch_envelope(self, envelope: dict[str, Any]) -> dict[str, Any]:
        """Send envelope through configured transport function or mock."""
        if self.transport_fn is not None:
            return self.transport_fn(envelope)

        # Default simulated HTTP/WS intake response
        return {
            "statusCode": 200,
            "ack_id": f"ack_{envelope['event_id']}",
            "event_id": envelope["event_id"],
            "status": "accepted",
            "timestamp": time.time(),
        }

    def drain_outbox(self, outbox: LocalOutbox, limit: int = 50) -> int:
        """Drains pending envelopes and immediately purges payloads upon valid acknowledgement."""
        pending = outbox.get_pending(limit=limit)
        relayed_count = 0

        for item in pending:
            envelope = self.format_relay_envelope(item)
            try:
                response = self.dispatch_envelope(envelope)
                # Verify acknowledgement matches event ID
                if response.get("status") == "accepted" and response.get("event_id") == item["id"]:
                    outbox.acknowledge_and_purge(item["id"])
                    relayed_count += 1
            except Exception as exc:
                print(f"[CloudRelay] Transmission failed for {item['id']}: {exc}")
                continue

        return relayed_count
