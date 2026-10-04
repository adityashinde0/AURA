"""Local AURA Bee stream monitor skeleton.

It reads the official Bee CLI's JSON stream. Relay is deliberately an injected
function so installing this file does not export personal data by default.
"""
from __future__ import annotations

import json
import subprocess
from collections.abc import Callable


def consume_bee_stream(on_event: Callable[[dict], None]) -> None:
    process = subprocess.Popen(
        ["bee", "stream", "--json"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        # Never log raw utterance text here. Extract only user-approved event metadata.
        on_event(event)


def local_only_handler(event: dict) -> None:
    event_type = event.get("event") or event.get("type") or "unknown"
    print(json.dumps({"event_type": event_type, "relay": "disabled"}))


if __name__ == "__main__":
    consume_bee_stream(local_only_handler)
