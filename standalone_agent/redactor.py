"""Local PII and sensitive context redactor for AURA.

Enforces privacy at the local device boundary: raw Bee utterances must never
be dispatched to cloud services with unredacted sensitive identifiers.
"""
from __future__ import annotations

import re

# Redact secrets first before general numeric patterns
API_KEY_REGEX = re.compile(
    r"(?i)(bearer\s+[a-zA-Z0-9_\-\.]{15,}|akia[a-z0-9]{16}|(?:api[_-]?key|secret[_-]?key|token)\s*[:=]\s*[^\s]+)",
    re.IGNORECASE,
)
EMAIL_REGEX = re.compile(r"\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b")
PHONE_REGEX = re.compile(r"(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b")
SSN_REGEX = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
CREDIT_CARD_REGEX = re.compile(r"\b(?:\d[ -]*?){13,16}\b")


def redact_text(text: str, custom_labels: list[str] | None = None) -> str:
    """Redact sensitive patterns and user-configured labels from text."""
    if not text:
        return ""

    # Secrets and tokens first
    redacted = API_KEY_REGEX.sub("[SECRET_REDACTED]", text)
    # Emails
    redacted = EMAIL_REGEX.sub("[EMAIL_REDACTED]", redacted)
    # Phone numbers
    redacted = PHONE_REGEX.sub("[PHONE_REDACTED]", redacted)
    # Government IDs and Credit Cards
    redacted = SSN_REGEX.sub("[GOV_ID_REDACTED]", redacted)
    redacted = CREDIT_CARD_REGEX.sub("[CARD_REDACTED]", redacted)

    if custom_labels:
        for label in custom_labels:
            if not label:
                continue
            pattern = re.compile(re.escape(label), re.IGNORECASE)
            redacted = pattern.sub("[CONFIDENTIAL_LABEL]", redacted)

    return redacted


def sanitize_evidence(raw_evidence: list[dict], custom_labels: list[str] | None = None) -> list[dict]:
    """Transform raw Bee event list into minimized, redacted evidence snippets."""
    sanitized = []
    for item in raw_evidence:
        event_id = item.get("id") or f"evt_{hash(item.get('text', '')) & 0xFFFFFFFF:08x}"
        raw_text = item.get("text", "")
        cleaned_text = redact_text(raw_text, custom_labels=custom_labels)
        sanitized.append({
            "id": event_id,
            "text": cleaned_text,
            "timestamp": item.get("timestamp", ""),
        })
    return sanitized


class Redactor:
    """Class wrapper for local redaction operations."""

    def redact(self, text: str, custom_confidential_labels: list[str] | None = None) -> str:
        return redact_text(text, custom_labels=custom_confidential_labels)

    def sanitize_evidence(self, raw_evidence: list[dict], custom_labels: list[str] | None = None) -> list[dict]:
        return sanitize_evidence(raw_evidence, custom_labels=custom_labels)

