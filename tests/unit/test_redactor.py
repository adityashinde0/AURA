"""Unit tests for local privacy redactor."""
import pytest
from standalone_agent.redactor import redact_text, sanitize_evidence


def test_redact_email_and_phone():
    text = "Contact Aditi at aditi@university.edu or call +1 (555) 234-5678 regarding the project."
    redacted = redact_text(text)
    assert "[EMAIL_REDACTED]" in redacted
    assert "aditi@university.edu" not in redacted
    assert "[PHONE_REDACTED]" in redacted
    assert "555" not in redacted


def test_redact_secrets_and_api_keys():
    text = "Use Bearer secret_token_xyz1234567890abcdef123 to authenticate."
    redacted = redact_text(text)
    assert "[SECRET_REDACTED]" in redacted
    assert "secret_token_xyz" not in redacted


def test_redact_custom_confidential_labels():
    text = "Project Apollo and SecretLaunch discussion."
    redacted = redact_text(text, custom_labels=["Apollo", "SecretLaunch"])
    assert "[CONFIDENTIAL_LABEL]" in redacted
    assert "Apollo" not in redacted
    assert "SecretLaunch" not in redacted


def test_sanitize_evidence_creates_minimized_envelope():
    raw = [
        {"id": "evt_1", "text": "Call me at test@example.com", "timestamp": "2026-10-04T12:00:00Z"},
        {"id": "evt_2", "text": "Regular note", "timestamp": "2026-10-04T12:01:00Z"},
    ]
    sanitized = sanitize_evidence(raw)
    assert len(sanitized) == 2
    assert sanitized[0]["id"] == "evt_1"
    assert "[EMAIL_REDACTED]" in sanitized[0]["text"]
    assert sanitized[1]["text"] == "Regular note"
