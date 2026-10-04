"""AWS Bedrock adapter for Project AURA Pre-Meeting Intelligence and Focus Guardian.

Invokes Anthropic Claude 3.5 Sonnet on Amazon Bedrock using structured output / Converse API,
enforces the strict Agent Contract schema, validates evidence citations, resists prompt injection,
and provides graceful fallback when evidence is insufficient or offline.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

import importlib
fg = importlib.import_module("lambda.focus_guardian")
FocusProposal = fg.FocusProposal
FocusRequest = fg.FocusRequest
safe_fallback = fg.safe_fallback

DEFAULT_MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"

PROMPT_INJECTION_PATTERNS = [
    r"ignore (all )?(previous|above) instructions",
    r"system override",
    r"grant admin consent",
    r"execute fire_?tv_?pause",
    r"execute remote action",
    r"bypass (safety|policy)",
    r"you are now (unrestricted|evil|dan)",
]


class BedrockAdapter:
    """Manages Bedrock Converse invocation with structured output constraints."""

    def __init__(
        self,
        model_id: str | None = None,
        region_name: str | None = None,
        mock_mode: bool | None = None,
    ) -> None:
        self.model_id = model_id or os.getenv("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)
        self.region_name = region_name or os.getenv("AWS_REGION", "us-east-1")
        self.mock_mode = (
            mock_mode
            if mock_mode is not None
            else os.getenv("BEDROCK_MOCK", "false").lower() in ("true", "1", "yes")
        )
        self._client = None

    @property
    def client(self):
        if self._client is None and not self.mock_mode:
            try:
                self._client = boto3.client("bedrock-runtime", region_name=self.region_name)
            except Exception:
                self._client = None
        return self._client

    def has_prompt_injection(self, text: str) -> bool:
        """Scan text for common jailbreak/prompt-injection patterns."""
        for pattern in PROMPT_INJECTION_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    def generate_briefing(self, request: FocusRequest) -> FocusProposal:
        """Generate structured briefing adhering strictly to FocusProposal contract."""
        # 1. Check for prompt injection in evidence
        for ev in request.evidence:
            snippet = ev.get("snippet") or ev.get("text") or ""
            if self.has_prompt_injection(snippet):
                # Prompt injection detected: fail closed to safe fallback
                fallback = safe_fallback(request)
                fallback.reason = "Potential prompt injection detected in evidence; fallback enforced."
                return fallback

        # 2. Check for insufficient context
        valid_evidence_ids = [
            ev["id"]
            for ev in request.evidence
            if isinstance(ev, dict) and "id" in ev and ev["id"]
        ]
        if not valid_evidence_ids and request.purpose == "pre_meeting":
            return safe_fallback(request)

        # 3. Use mock or live Bedrock invocation
        if self.mock_mode or self.client is None:
            return self._mock_generate(request, valid_evidence_ids)

        try:
            return self._invoke_bedrock(request, valid_evidence_ids)
        except (BotoCoreError, ClientError, Exception):
            # Fail closed safely on API failure
            return safe_fallback(request)

    def _mock_generate(self, request: FocusRequest, valid_evidence_ids: list[str]) -> FocusProposal:
        """Deterministic mock generator for local development and unit tests."""
        if not valid_evidence_ids:
            return safe_fallback(request)

        # Build mock based on evidence snippet
        evidence_text = " ".join(
            ev.get("snippet") or ev.get("text") or "" for ev in request.evidence
        )

        tone = "calm"
        if "nervous" in evidence_text.lower():
            tone = "supportive"
        elif "design" in evidence_text.lower() or "architecture" in evidence_text.lower():
            tone = "confident"

        # Ensure summary is 40–70 words
        prep_summary = (
            "You have an upcoming placement mentoring session focused on AWS system design architecture. "
            "You previously reviewed portfolio deployment topics and noted areas around system scalability, "
            "database partitioning, and failure recovery. Enter the call prepared to discuss your distributed "
            "architecture choices and address system trade-offs with confidence."
        )

        questions = [
            "What distributed architecture trade-offs should be prioritized?",
            "How do your scalability and recovery targets compare to requirements?",
            "What concrete interview gap do you want guidance on today?",
        ]

        return FocusProposal(
            prep_summary=prep_summary,
            questions=questions,
            emotion_tone=tone,
            is_distracted=False,
            distraction_score=0.0,
            deep_work_bank_delta=0,
            evidence_ids=valid_evidence_ids[:3],
            recommended_action="none",
            reason="Briefing generated from approved Bee memory snippets.",
        )

    def _invoke_bedrock(self, request: FocusRequest, valid_evidence_ids: list[str]) -> FocusProposal:
        """Invoke Bedrock Converse API with structured JSON output instructions."""
        schema_def = FocusProposal.model_json_schema(by_alias=True)

        system_prompt = (
            "You are AURA, a privacy-first pre-meeting intelligence assistant. "
            "Generate a structured briefing in strict JSON adhering to the provided schema. "
            "Requirements:\n"
            "- 'prep_summary' must be 40 to 70 words, calm, and actionable for a 10-second glance.\n"
            "- '3_questions' must contain exactly three distinct, relevant questions.\n"
            "- 'emotion_tone' must be one of: calm, confident, supportive, neutral, cautious.\n"
            "- 'is_distracted' must be false for pre-meeting.\n"
            "- 'distraction_score' must be 0.0.\n"
            "- 'deep_work_bank_delta' must be 0.\n"
            "- 'evidence_ids' must strictly be a subset of the provided evidence IDs. Do not hallucinate IDs.\n"
            "- 'recommended_action' must be 'none'.\n"
            "- 'reason' must explain the briefing basis concisely.\n"
            "Return JSON only with no surrounding markdown or explanation."
        )

        user_content = json.dumps(
            {
                "purpose": request.purpose,
                "evidence": request.evidence,
                "schema": schema_def,
            }
        )

        # Call Bedrock Converse
        response = self.client.converse(
            modelId=self.model_id,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": f"{system_prompt}\n\nInput Data:\n{user_content}"}],
                }
            ],
            inferenceConfig={
                "maxTokens": 1000,
                "temperature": 0.2,
            },
        )

        output_text = response["output"]["message"]["content"][0]["text"]
        # Extract JSON from potential code fences
        cleaned = output_text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        parsed = json.loads(cleaned)
        proposal = FocusProposal.model_validate(parsed)

        # Strict evidence citation check
        if not set(proposal.evidence_ids).issubset(set(valid_evidence_ids)):
            raise ValueError("Bedrock model cited evidence IDs not in request")

        return proposal
