"""Local-only, read-only MCP facade for AURA development.

Use Bee's official MCP server in production when it covers the desired feature.
This skeleton exposes no write or device-control tools.
"""
from __future__ import annotations

import json
import subprocess


def bee_json(*args: str) -> dict | list:
    completed = subprocess.run(
        ["bee", *args, "--json"], capture_output=True, text=True, check=True, timeout=20
    )
    return json.loads(completed.stdout)


def get_today_context() -> dict | list:
    """Return local Bee context for a user-invoked pre-meeting preparation request."""
    return bee_json("today", "--context")


def search_context(query: str) -> dict | list:
    """Read-only local search; caller is responsible for consent/redaction before relay."""
    return bee_json("search", "--query", query, "--filter", "all", "--limit", "5")
