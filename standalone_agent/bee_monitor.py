"""Local AURA Bee stream monitor and outbox manager.

Implements Increment 1 local simulation and outbox queue:
- Ingests Bee events from stream or test fixtures.
- Preserves the local trust boundary: never relays raw transcript text externally by default.
- Uses a local SQLite-backed outbox to queue purpose-minimized envelopes.
- Purges raw payloads upon relay acknowledgement.
- Supports exponential reconnect backoff for resilience.
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from standalone_agent.redactor import sanitize_evidence


class LocalOutbox:
    """Bounded, SQLite-backed local outbox for minimized AURA event envelopes."""

    def __init__(self, db_path: str = ":memory:", max_entries: int = 500) -> None:
        self.db_path = db_path
        self.max_entries = max_entries
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self) -> None:
        with self.conn:
            self.conn.execute(
                """
                CREATE TABLE IF NOT EXISTS outbox (
                    id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    relayed_at REAL,
                    purged INTEGER DEFAULT 0
                )
                """
            )

    def enqueue(self, event_id: str, event_type: str, sanitized_payload: dict[str, Any]) -> None:
        with self.conn:
            # Bound memory by pruning oldest relayed/purged items if limit reached
            count = self.conn.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
            if count >= self.max_entries:
                self.conn.execute(
                    "DELETE FROM outbox WHERE id IN (SELECT id FROM outbox ORDER BY created_at ASC LIMIT ?)",
                    (count - self.max_entries + 1,),
                )

            self.conn.execute(
                "INSERT OR REPLACE INTO outbox (id, event_type, payload, created_at) VALUES (?, ?, ?, ?)",
                (event_id, event_type, json.dumps(sanitized_payload), time.time()),
            )

    def get_pending(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.conn:
            cursor = self.conn.execute(
                "SELECT id, event_type, payload, created_at FROM outbox WHERE relayed_at IS NULL AND purged = 0 ORDER BY created_at ASC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": row[0],
                    "event_type": row[1],
                    "payload": json.loads(row[2]),
                    "created_at": row[3],
                }
                for row in rows
            ]

    def acknowledge_and_purge(self, event_id: str) -> None:
        """Mark as relayed and purge payload body to uphold zero-retention guarantee."""
        with self.conn:
            self.conn.execute(
                "UPDATE outbox SET relayed_at = ?, payload = '{}', purged = 1 WHERE id = ?",
                (time.time(), event_id),
            )

    def close(self) -> None:
        self.conn.close()


class BeeMonitor:
    def __init__(
        self,
        outbox: LocalOutbox | None = None,
        relay_fn: Callable[[dict[str, Any]], bool] | None = None,
        custom_redact_labels: list[str] | None = None,
    ) -> None:
        self.outbox = outbox or LocalOutbox(":memory:")
        self.relay_fn = relay_fn  # None means local-only: no content leaves machine
        self.custom_redact_labels = custom_redact_labels or []
        self.processed_events: list[dict[str, Any]] = []

    def handle_raw_event(self, raw_event: dict[str, Any]) -> dict[str, Any]:
        """Process a raw Bee event within the local boundary."""
        event_type = raw_event.get("event") or raw_event.get("type") or "unknown"
        event_id = raw_event.get("id") or f"bee_{int(time.time() * 1000)}"

        # Strip raw utterance text: only extract sanitized metadata/evidence
        raw_text = raw_event.get("text", "")
        if raw_text:
            sanitized = sanitize_evidence([{"id": event_id, "text": raw_text}], self.custom_redact_labels)[0]
            clean_text = sanitized["text"]
        else:
            clean_text = ""

        envelope = {
            "id": event_id,
            "event_type": event_type,
            "timestamp": raw_event.get("timestamp", time.time()),
            "evidence": [{"id": event_id, "snippet": clean_text}] if clean_text else [],
            "source": raw_event.get("source", "bee_local"),
        }

        # Queue in local outbox
        self.outbox.enqueue(event_id, event_type, envelope)
        self.processed_events.append(envelope)

        # Relay is disabled by default; only proceed if explicit authorized relay is supplied
        if self.relay_fn:
            success = self.relay_fn(envelope)
            if success:
                self.outbox.acknowledge_and_purge(event_id)

        return envelope

    def replay_fixture(self, fixture_path: str | Path) -> int:
        """Feed fixture file line by line for local simulation without a physical Bee device."""
        path = Path(fixture_path)
        count = 0
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    self.handle_raw_event(event)
                    count += 1
                except json.JSONDecodeError:
                    continue
        return count


def consume_bee_stream(
    on_event: Callable[[dict[str, Any]], None],
    max_reconnects: int = 5,
    initial_backoff: float = 1.0,
) -> None:
    """Supervised loop for official Bee CLI SSE stream with exponential reconnect backoff."""
    reconnect_count = 0
    backoff = initial_backoff

    while reconnect_count < max_reconnects:
        try:
            process = subprocess.Popen(
                ["bee", "stream", "--json"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            assert process.stdout is not None
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    on_event(event)
                    backoff = initial_backoff  # reset backoff upon successful receipt
                except json.JSONDecodeError:
                    continue
            process.wait()
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            reconnect_count += 1
            print(f"[BeeMonitor] Stream connection interrupted: {exc}. Retrying in {backoff}s...")
            time.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


if __name__ == "__main__":
    monitor = BeeMonitor()
    fixture = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "bee_stream_sample.jsonl"
    if fixture.exists():
        count = monitor.replay_fixture(fixture)
        print(f"Simulated {count} fixture events locally. All events quarantined in local outbox.")
    else:
        consume_bee_stream(lambda e: monitor.handle_raw_event(e))
