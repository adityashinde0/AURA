"""Unit tests for local Bee monitor and SQLite outbox."""
from pathlib import Path
import pytest
from standalone_agent.bee_monitor import BeeMonitor, LocalOutbox


@pytest.fixture
def outbox():
    box = LocalOutbox(":memory:", max_entries=10)
    yield box
    box.close()


def test_outbox_enqueue_and_get_pending(outbox):
    outbox.enqueue("evt_1", "status", {"status": "ok"})
    pending = outbox.get_pending()
    assert len(pending) == 1
    assert pending[0]["id"] == "evt_1"
    assert pending[0]["payload"]["status"] == "ok"


def test_outbox_acknowledge_and_purge(outbox):
    outbox.enqueue("evt_1", "status", {"secret_context": "personal data"})
    assert len(outbox.get_pending()) == 1

    outbox.acknowledge_and_purge("evt_1")
    # Should no longer be pending
    assert len(outbox.get_pending()) == 0

    # Verify payload was purged in database
    with outbox.conn:
        row = outbox.conn.execute("SELECT payload, purged FROM outbox WHERE id = 'evt_1'").fetchone()
        assert row[0] == "{}"
        assert row[1] == 1


def test_outbox_memory_bounding(outbox):
    # Enqueue more than max_entries (max_entries = 10)
    for i in range(15):
        outbox.enqueue(f"evt_{i}", "test", {"index": i})

    with outbox.conn:
        count = outbox.conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
        assert count <= 10


def test_bee_monitor_local_isolation_by_default(outbox):
    # Without relay_fn, data remains in outbox and never leaves
    monitor = BeeMonitor(outbox=outbox, relay_fn=None)
    envelope = monitor.handle_raw_event({
        "event": "transcription",
        "id": "evt_test",
        "text": "Call me at test@example.com",
    })

    assert envelope["id"] == "evt_test"
    # Content is redacted locally
    assert "[EMAIL_REDACTED]" in envelope["evidence"][0]["snippet"]
    # Still pending in outbox (not purged, not relayed)
    assert len(outbox.get_pending()) == 1


def test_bee_monitor_relay_acknowledgement_purges_outbox(outbox):
    relayed_events = []

    def mock_relay(envelope: dict) -> bool:
        relayed_events.append(envelope)
        return True

    monitor = BeeMonitor(outbox=outbox, relay_fn=mock_relay)
    monitor.handle_raw_event({
        "event": "noise_detected",
        "id": "evt_noise",
    })

    assert len(relayed_events) == 1
    # Successfully relayed events are acknowledged and purged immediately
    assert len(outbox.get_pending()) == 0


def test_bee_monitor_replay_fixture(outbox):
    fixture_path = Path(__file__).resolve().parent.parent / "fixtures" / "bee_stream_sample.jsonl"
    monitor = BeeMonitor(outbox=outbox)
    count = monitor.replay_fixture(fixture_path)
    assert count == 5
    assert len(monitor.processed_events) == 5
