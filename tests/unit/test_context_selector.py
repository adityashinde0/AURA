"""Unit tests for ContextSelector in Project AURA."""
import pytest
from standalone_agent.context_selector import ContextSelector
from standalone_agent.redactor import Redactor


@pytest.fixture
def evidence_pool():
    return [
        {
            "id": "evt_001",
            "event": "transcription",
            "text": "Aditi: We need to prepare for tomorrow's placement mentoring session on AWS system design.",
            "speaker": "Aditi",
        },
        {
            "id": "evt_002",
            "event": "transcription",
            "text": "Aditi: My email is aditi@university.edu and phone is +1-555-0199.",
            "speaker": "Aditi",
        },
        {
            "id": "evt_003",
            "event": "noise_detected",
            "type": "allowed_video_noise",
            "text": "Background television audio playback from YouTube.",
            "app": "YouTube",
        },
        {
            "id": "evt_004",
            "event": "mark_moment",
            "label": "Key Insight",
            "text": "Mentor Dave advised focusing on distributed caching and DynamoDB single-table design.",
            "source": "aura_watch_tap",
        },
        {
            "id": "evt_005",
            "event": "transcription",
            "text": "Unrelated discussion about grocery shopping.",
            "speaker": "Roommate",
        },
    ]


def test_context_selector_selects_relevant_and_redacts(evidence_pool):
    selector = ContextSelector()
    results = selector.select_context(
        meeting_title="Placement Mentoring: AWS System Design",
        participants=["Aditi", "Mentor Dave"],
        bee_evidence_pool=evidence_pool,
        max_items=3,
    )

    assert len(results) <= 3
    result_ids = [r["id"] for r in results]

    # High-relevance items must be selected
    assert "evt_001" in result_ids  # System design mention
    assert "evt_004" in result_ids  # Mentor Dave + DynamoDB

    # Unrelated noise must not take precedence
    assert "evt_003" not in result_ids


def test_context_selector_redacts_pii_in_selected_snippets():
    selector = ContextSelector()
    pool = [
        {
            "id": "evt_pii_1",
            "text": "Discussion with Mentor Dave regarding secret api key akiaiosfodnn7example and aditi@test.com",
            "speaker": "Aditi",
        }
    ]
    results = selector.select_context(
        meeting_title="Session with Mentor Dave",
        participants=["Mentor Dave"],
        bee_evidence_pool=pool,
    )
    assert len(results) == 1
    snippet = results[0]["snippet"]
    assert "[EMAIL_REDACTED]" in snippet
    assert "akiaiosfodnn7example" not in snippet
    assert "[SECRET_REDACTED]" in snippet


def test_context_selector_empty_pool():
    selector = ContextSelector()
    results = selector.select_context(
        meeting_title="1:1 Sync",
        participants=["Alice"],
        bee_evidence_pool=[],
    )
    assert results == []


def test_context_selector_caps_at_max_items(evidence_pool):
    selector = ContextSelector()
    # Expand pool to 10 items
    extended_pool = evidence_pool * 2
    results = selector.select_context(
        meeting_title="Placement Mentoring",
        participants=["Aditi"],
        bee_evidence_pool=extended_pool,
        max_items=5,
    )
    assert len(results) <= 5
