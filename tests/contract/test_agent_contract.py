"""Contract tests verifying the strict Agent Contract defined in docs/IMPLEMENTATION.md."""
import importlib
import json
import pytest
from pydantic import ValidationError

fg = importlib.import_module("lambda.focus_guardian")
FocusProposal = fg.FocusProposal
FocusRequest = fg.FocusRequest
safe_fallback = fg.safe_fallback


def test_agent_contract_schema_exact_keys():
    expected_keys = {
        "prep_summary",
        "3_questions",
        "emotion_tone",
        "is_distracted",
        "distraction_score",
        "deep_work_bank_delta",
        "evidence_ids",
        "recommended_action",
        "reason",
    }

    schema = FocusProposal.model_json_schema(by_alias=True)
    properties = schema["properties"]
    assert set(properties.keys()) == expected_keys


def test_agent_contract_valid_payload():
    payload = {
        "prep_summary": "You have a technical mentoring session on AWS system architecture.",
        "3_questions": [
            "What scalability goals are targeted?",
            "Which database engines are under consideration?",
            "What are the failure recovery points?",
        ],
        "emotion_tone": "calm",
        "is_distracted": False,
        "distraction_score": 0.1,
        "deep_work_bank_delta": 2,
        "evidence_ids": ["evt_123"],
        "recommended_action": "none",
        "reason": "User is focused on preparing for the upcoming session.",
    }
    proposal = FocusProposal.model_validate(payload)
    serialized = proposal.model_dump(by_alias=True)

    # Check all key names and types match contract
    assert serialized["prep_summary"] == payload["prep_summary"]
    assert len(serialized["3_questions"]) == 3
    assert serialized["emotion_tone"] == "calm"
    assert serialized["is_distracted"] is False
    assert serialized["distraction_score"] == 0.1
    assert serialized["deep_work_bank_delta"] == 2
    assert serialized["evidence_ids"] == ["evt_123"]
    assert serialized["recommended_action"] == "none"
    assert serialized["reason"] == payload["reason"]


def test_agent_contract_rejects_missing_questions():
    payload = {
        "prep_summary": "Test summary",
        "3_questions": ["Only one question?"],  # Must be exactly 3 questions
        "emotion_tone": "neutral",
        "is_distracted": False,
        "distraction_score": 0.0,
        "deep_work_bank_delta": 0,
        "evidence_ids": [],
        "recommended_action": "none",
        "reason": "Test",
    }
    with pytest.raises(ValidationError):
        FocusProposal.model_validate(payload)


def test_agent_contract_rejects_invalid_tone():
    payload = {
        "prep_summary": "Test summary",
        "3_questions": ["Q1?", "Q2?", "Q3?"],
        "emotion_tone": "ecstatic",  # Not in calm|confident|supportive|neutral|cautious
        "is_distracted": False,
        "distraction_score": 0.0,
        "deep_work_bank_delta": 0,
        "evidence_ids": [],
        "recommended_action": "none",
        "reason": "Test",
    }
    with pytest.raises(ValidationError):
        FocusProposal.model_validate(payload)


def test_agent_contract_rejects_invalid_recommended_action():
    payload = {
        "prep_summary": "Test summary",
        "3_questions": ["Q1?", "Q2?", "Q3?"],
        "emotion_tone": "calm",
        "is_distracted": False,
        "distraction_score": 0.0,
        "deep_work_bank_delta": 0,
        "evidence_ids": [],
        "recommended_action": "delete_all_files",  # Unsafe / illegal action
        "reason": "Test",
    }
    with pytest.raises(ValidationError):
        FocusProposal.model_validate(payload)


def test_safe_fallback_conforms_to_agent_contract():
    req = FocusRequest(
        user_id="usr_test",
        session_id="sess_12345678",
        purpose="pre_meeting",
    )
    fallback = safe_fallback(req)
    dumped = fallback.model_dump(by_alias=True)

    expected_keys = {
        "prep_summary",
        "3_questions",
        "emotion_tone",
        "is_distracted",
        "distraction_score",
        "deep_work_bank_delta",
        "evidence_ids",
        "recommended_action",
        "reason",
    }
    assert set(dumped.keys()) == expected_keys
    assert len(dumped["3_questions"]) == 3
