"""AURA Focus Guardian Lambda skeleton.

This file intentionally returns an *action proposal*. A deterministic consent and
policy service must authorize any notification, Slack post, DND, or device action.
"""
from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


class FocusRequest(BaseModel):
    user_id: str = Field(min_length=3, max_length=128)
    session_id: str = Field(min_length=8, max_length=128)
    purpose: Literal["pre_meeting", "focus_guardian"]
    explicit_signal: Literal["none", "self_report_distracted", "focus_started"] = "none"
    evidence: list[dict[str, str]] = Field(default_factory=list, max_length=5)
    consented_signal_score: float = Field(default=0.0, ge=0.0, le=1.0)


class FocusProposal(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    prep_summary: str = Field(max_length=500)
    questions: list[str] = Field(min_length=3, max_length=3, alias="3_questions")
    emotion_tone: Literal["calm", "confident", "supportive", "neutral", "cautious"]
    is_distracted: bool
    distraction_score: float = Field(ge=0.0, le=1.0)
    deep_work_bank_delta: int = Field(ge=-10, le=10)
    evidence_ids: list[str] = Field(default_factory=list, max_length=5)
    recommended_action: Literal["none", "nudge", "request_dnd", "request_pause"]
    reason: str = Field(max_length=280)

    @field_validator("questions")
    @classmethod
    def questions_are_nonempty(cls, value: list[str]) -> list[str]:
        if any(not question.strip() for question in value):
            raise ValueError("Questions must not be blank")
        return value


SYSTEM_PROMPT = """You are AURA, a privacy-first focus assistant.
Return JSON only matching the required schema. Use only supplied evidence IDs.
Never claim certainty beyond evidence. Never diagnose a person. Never execute or
promise external actions: recommend at most a reversible, consent-gated action.
If evidence is insufficient, provide a neutral brief and action 'none'."""


def build_prompt(request: FocusRequest) -> str:
    """Build minimized model input; raw Bee transcripts must be redacted locally."""
    return json.dumps(
        {
            "system": SYSTEM_PROMPT,
            "purpose": request.purpose,
            "explicit_signal": request.explicit_signal,
            "consented_signal_score": request.consented_signal_score,
            "evidence": request.evidence,
            "required_schema": FocusProposal.model_json_schema(by_alias=True),
        }
    )


def safe_fallback(request: FocusRequest) -> FocusProposal:
    distracted = request.explicit_signal == "self_report_distracted"
    return FocusProposal(
        prep_summary="No high-confidence context is available. Open the event details and add your own intention.",
        questions=["What outcome matters most?", "What decision is needed?", "What is the next concrete step?"],
        emotion_tone="neutral",
        is_distracted=distracted,
        distraction_score=0.8 if distracted else request.consented_signal_score,
        deep_work_bank_delta=-1 if distracted else 0,
        evidence_ids=[],
        recommended_action="nudge" if distracted else "none",
        reason="Using a safe fallback because no validated model proposal was available.",
    )


def invoke_model(_prompt: str) -> dict:
    """Replace with Bedrock Converse API + strict JSON extraction in the IaC deployment.

    Keep model invocation behind this function so tests can substitute deterministic
    fixtures. Do not log prompts or model output bodies in production.
    """
    raise NotImplementedError("Configure a Bedrock model adapter in deployment")


def lambda_handler(event: dict, _context: object) -> dict:
    try:
        request = FocusRequest.model_validate(event.get("body", event))
        try:
            proposal = FocusProposal.model_validate(invoke_model(build_prompt(request)))
            source_ids = {item.get("id") for item in request.evidence}
            if not set(proposal.evidence_ids).issubset(source_ids):
                raise ValueError("Model cited evidence not present in request")
        except (NotImplementedError, ValidationError, ValueError):
            proposal = safe_fallback(request)

        # A real implementation posts this proposal to the consent/policy service.
        # It must not call Alexa, Fire TV, or Slack from this handler directly.
        return {
            "statusCode": 200,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"proposal": proposal.model_dump(by_alias=True), "policy_required": True}),
        }
    except ValidationError as exc:
        return {"statusCode": 400, "body": json.dumps({"error": "invalid_request", "details": exc.errors()})}
