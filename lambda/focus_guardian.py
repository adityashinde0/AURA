"""AURA Focus Guardian Lambda handler.

Validates input envelopes, constructs prompt with strict JSON schema constraints,
validates model proposals, ensures evidence citations are strictly subset-bounded,
and falls back safely to 'none' action whenever validation fails.
"""
from __future__ import annotations

import json
import sys
import time
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


# ---------------------------------------------------------------------------
# Structured logger
# ---------------------------------------------------------------------------

def _log(level: str, event: str, **fields: Any) -> None:
    """Emit a single structured JSON log line to stdout.

    No raw user content or evidence text is ever logged — only IDs and counts.
    """
    record = {
        "timestamp": time.time(),
        "level": level,
        "service": "aura.focus_guardian",
        "event": event,
        **fields,
    }
    print(json.dumps(record, default=str), file=sys.stdout, flush=True)


class FocusRequest(BaseModel):
    user_id: str = Field(min_length=3, max_length=128)
    session_id: str = Field(min_length=8, max_length=128)
    purpose: Literal["pre_meeting", "focus_guardian"]
    explicit_signal: Literal["none", "self_report_distracted", "focus_started"] = "none"
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=5)
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


def safe_fallback(request: FocusRequest, fallback_reason: str = "") -> FocusProposal:
    """Return a safe, deterministic fallback proposal and log the activation.

    The *fallback_reason* parameter carries a short machine-readable tag
    (e.g. ``"not_implemented"``, ``"validation_error"``, ``"hallucinated_evidence"``)
    so that CloudWatch Insights can query fallback rates by cause.
    The default is an empty string, which preserves the original call signature
    and keeps existing callers and tests unchanged.
    """
    distracted = request.explicit_signal == "self_report_distracted"
    _log(
        "WARNING",
        "focus_guardian_safe_fallback_activated",
        user_id=request.user_id,
        session_id=request.session_id,
        purpose=request.purpose,
        explicit_signal=request.explicit_signal,
        evidence_count=len(request.evidence),
        fallback_reason=fallback_reason or "unspecified",
    )
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


def invoke_model(_prompt: str) -> dict[str, Any]:
    """Invoke Bedrock Converse API with JSON schema in deployment.

    In development/testing, can be monkeypatched or replaced.
    Raises ``NotImplementedError`` when no adapter has been wired; the
    ``lambda_handler`` catches this and routes to ``safe_fallback``.
    """
    raise NotImplementedError("Configure a Bedrock model adapter in deployment")


def lambda_handler(
    event: dict[str, Any],
    _context: object = None,
    invoker: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    try:
        if "detail" in event and isinstance(event["detail"], dict):
            raw_body = dict(event["detail"])
            if "purpose" not in raw_body:
                raw_body["purpose"] = "focus_guardian"
        else:
            raw_body = event.get("body", event)

        if isinstance(raw_body, str):
            try:
                raw_body = json.loads(raw_body)
            except json.JSONDecodeError as err:
                _log("WARNING", "focus_guardian_invalid_json", error=str(err))
                return {
                    "statusCode": 400,
                    "headers": {"content-type": "application/json"},
                    "body": json.dumps({"error": "invalid_json_body", "details": str(err)}),
                }

        request = FocusRequest.model_validate(raw_body)
        model_call = invoker or invoke_model

        _log(
            "INFO",
            "focus_guardian_evaluation_started",
            user_id=request.user_id,
            session_id=request.session_id,
            purpose=request.purpose,
            explicit_signal=request.explicit_signal,
            evidence_count=len(request.evidence),
        )

        proposal: FocusProposal
        try:
            model_output = model_call(build_prompt(request))
            proposal = FocusProposal.model_validate(model_output)
            source_ids = {item.get("id") for item in request.evidence if isinstance(item, dict) and "id" in item}
            if not set(proposal.evidence_ids).issubset(source_ids):
                raise ValueError("Model cited evidence not present in request")
            _log(
                "INFO",
                "focus_guardian_model_proposal_accepted",
                user_id=request.user_id,
                session_id=request.session_id,
                recommended_action=proposal.recommended_action,
                emotion_tone=proposal.emotion_tone,
                evidence_ids_count=len(proposal.evidence_ids),
            )
        except NotImplementedError:
            proposal = safe_fallback(request, fallback_reason="not_implemented")
        except ValidationError as val_err:
            _log(
                "WARNING",
                "focus_guardian_model_output_invalid",
                user_id=request.user_id,
                session_id=request.session_id,
                validation_errors=len(val_err.errors()),
            )
            proposal = safe_fallback(request, fallback_reason="validation_error")
        except ValueError as val_err:
            _log(
                "WARNING",
                "focus_guardian_evidence_hallucination",
                user_id=request.user_id,
                session_id=request.session_id,
                error=str(val_err),
            )
            proposal = safe_fallback(request, fallback_reason="hallucinated_evidence")
        except TypeError:
            proposal = safe_fallback(request, fallback_reason="type_error")

        _log(
            "INFO",
            "focus_guardian_evaluation_complete",
            user_id=request.user_id,
            session_id=request.session_id,
            recommended_action=proposal.recommended_action,
            is_distracted=proposal.is_distracted,
            policy_required=True,
        )
        return {
            "statusCode": 200,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"proposal": proposal.model_dump(by_alias=True), "policy_required": True}),
        }
    except ValidationError as exc:
        _log(
            "WARNING",
            "focus_guardian_request_invalid",
            error_count=len(exc.errors()),
        )
        return {
            "statusCode": 400,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"error": "invalid_request", "details": exc.errors()}),
        }
