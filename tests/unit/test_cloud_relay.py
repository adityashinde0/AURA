"""Unit tests for standalone_agent/cloud_relay.py."""
from __future__ import annotations

import time
import pytest

from standalone_agent.bee_monitor import LocalOutbox
from standalone_agent.cloud_relay import CloudRelayClient


@pytest.fixture
def outbox() -> LocalOutbox:
    return LocalOutbox(":memory:")


def test_format_relay_envelope(outbox: LocalOutbox) -> None:
    client = CloudRelayClient(user_id="usr_test_01")
    outbox.enqueue(
        "evt_01",
        "focus_signal",
        {
            "explicit_signal": "self_report_distracted",
            "consented_signal_score": 0.9,
            "evidence": [{"id": "evt_01", "snippet": "distracted"}],
        },
    )
    items = outbox.get_pending()
    assert len(items) == 1
    envelope = client.format_relay_envelope(items[0])
    assert envelope["action"] == "relay"
    assert envelope["event_id"] == "evt_01"
    assert envelope["user_id"] == "usr_test_01"
    assert envelope["evidence"][0]["snippet"] == "distracted"


def test_drain_outbox_successful_purges_body(outbox: LocalOutbox) -> None:
    client = CloudRelayClient(user_id="usr_test_01")
    outbox.enqueue("evt_01", "focus_signal", {"evidence": []})
    outbox.enqueue("evt_02", "focus_signal", {"evidence": []})

    assert len(outbox.get_pending()) == 2

    relayed = client.drain_outbox(outbox)
    assert relayed == 2
    assert len(outbox.get_pending()) == 0

    # Verify bodies are purged to {}
    with outbox.conn:
        row = outbox.conn.execute("SELECT payload, purged FROM outbox WHERE id = 'evt_01'").fetchone()
        assert row[0] == "{}"
        assert row[1] == 1


def test_drain_outbox_transport_failure_retains_envelope(outbox: LocalOutbox) -> None:
    def failing_transport(_envelope: dict) -> dict:
        raise ConnectionError("Network down")

    client = CloudRelayClient(user_id="usr_test_01", transport_fn=failing_transport)
    outbox.enqueue("evt_fail", "focus_signal", {"evidence": []})

    relayed = client.drain_outbox(outbox)
    assert relayed == 0

    # Item must still be pending in outbox for subsequent retry
    pending = outbox.get_pending()
    assert len(pending) == 1
    assert pending[0]["id"] == "evt_fail"
