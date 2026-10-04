"""Local Context Selector for Project AURA Pre-Meeting Intelligence.

Selects at most 5 least-privilege evidence snippets from user-consented Bee memory
and streams. Performs local PII redaction and keyword/participant relevance matching
before any cloud transmission, ensuring raw audio/transcripts never leave the device.
"""
from __future__ import annotations

import re
from typing import Any

from standalone_agent.redactor import Redactor


class ContextSelector:
    """Selects and sanitizes relevant local Bee memory snippets for meeting preparation."""

    def __init__(self, redactor: Redactor | None = None) -> None:
        self.redactor = redactor or Redactor()

    def select_context(
        self,
        meeting_title: str,
        participants: list[str],
        bee_evidence_pool: list[dict[str, Any]],
        max_items: int = 5,
        custom_confidential_labels: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Select, score, and redact at most `max_items` (default 5) evidence snippets."""
        if not bee_evidence_pool:
            return []

        # Prepare tokens for relevance scoring
        title_tokens = set(re.findall(r"\w+", meeting_title.lower()))
        # Remove common stop words
        stop_words = {"a", "an", "the", "in", "on", "at", "for", "to", "with", "and", "or", "meeting", "sync", "call", "session"}
        meaningful_title_tokens = title_tokens - stop_words

        participant_names = {p.lower() for p in participants if p}

        scored_candidates: list[tuple[float, dict[str, Any]]] = []

        for item in bee_evidence_pool:
            # Extract text/snippet from item
            text = item.get("text") or item.get("snippet") or item.get("content") or ""
            if not text:
                continue

            event_id = item.get("id") or item.get("event_id") or f"evt_{hash(text) & 0xFFFFFFFF:08x}"
            speaker = (item.get("speaker") or "").lower()

            score = 0.0
            lower_text = text.lower()

            # 1. Participant match
            for p in participant_names:
                if p in lower_text or p in speaker:
                    score += 3.0

            # 2. Title token matches
            for token in meaningful_title_tokens:
                if len(token) > 2 and token in lower_text:
                    score += 2.0

            # 3. High-signal markers (commitments, insights, bookmarks)
            if item.get("event") == "mark_moment" or item.get("label") == "Key Insight":
                score += 2.5
            if any(term in lower_text for term in ("prepare", "discuss", "action item", "todo", "follow up", "decision", "gap")):
                score += 1.5

            # 4. Penalty for generic noise or video background
            if item.get("type") == "allowed_video_noise":
                score -= 5.0

            if score > 0:
                scored_candidates.append((score, {"id": event_id, "text": text, "source": item.get("source", "bee_memory")}))

        # Sort by relevance score descending
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        top_candidates = [cand[1] for cand in scored_candidates[:max_items]]

        # Apply local PII & secret redaction
        sanitized_results: list[dict[str, Any]] = []
        for cand in top_candidates:
            redacted_text = self.redactor.redact(cand["text"], custom_confidential_labels=custom_confidential_labels)
            sanitized_results.append(
                {
                    "id": cand["id"],
                    "snippet": redacted_text,
                    "source": cand.get("source", "bee_memory"),
                }
            )

        return sanitized_results
