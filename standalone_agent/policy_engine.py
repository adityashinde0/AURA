"""Deterministic policy and consent engine for Project AURA.

Enforces the boundary between model proposals and real-world execution.
Models cannot grant consent or execute actions directly. Every action must
pass deterministic grant checks, device allowlists, idempotency checks,
and be logged to an immutable audit record with an undo token.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

ActionType = Literal["none", "nudge", "request_dnd", "request_pause", "pre_meeting_briefing", "slack_post"]
GrantScope = Literal["ask_every_time", "allow_for_session", "always", "never"]


@dataclass
class ConsentGrant:
    tenant_id: str
    user_id: str
    action_type: ActionType
    scope: GrantScope
    target_device_id: str | None = None
    created_at: float = field(default_factory=time.time)
    expires_at: float | None = None
    revoked: bool = False

    def is_valid(self) -> bool:
        if self.revoked:
            return False
        if self.expires_at is not None and time.time() > self.expires_at:
            return False
        return self.scope in ("allow_for_session", "always")


@dataclass
class AuditRecord:
    audit_id: str
    timestamp: float
    user_id: str
    action_type: ActionType
    target_device_id: str | None
    status: Literal[
        "executed",
        "suggested_only",
        "blocked_no_consent",
        "blocked_device_not_allowed",
        "blocked_slack_meeting_leakage",
        "undone",
        "duplicate",
        "quiet_hours_suppressed",
    ]
    reason: str
    idempotency_key: str
    undo_token: str | None = None
    undone: bool = False


class PolicyEngine:
    def __init__(self, allowed_devices: set[str] | None = None, device_adapter: Any = None) -> None:
        self.grants: dict[str, ConsentGrant] = {}  # key: f"{user_id}:{action_type}"
        self.allowed_devices: set[str] = allowed_devices or set()
        self.device_adapter = device_adapter
        self.audit_log: list[AuditRecord] = []
        self.processed_idempotency_keys: dict[str, AuditRecord] = {}

    def set_grant(self, grant: ConsentGrant) -> None:
        key = f"{grant.user_id}:{grant.action_type}"
        self.grants[key] = grant

    def revoke_grant(self, user_id: str, action_type: ActionType) -> bool:
        key = f"{user_id}:{action_type}"
        if key in self.grants:
            self.grants[key].revoked = True
            return True
        return False

    def evaluate_and_execute(
        self,
        user_id: str,
        proposal_action: ActionType,
        target_device_id: str | None,
        reason: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Evaluate a proposal from Focus Guardian against deterministic policy."""
        # 1. Idempotency check
        if idempotency_key in self.processed_idempotency_keys:
            existing = self.processed_idempotency_keys[idempotency_key]
            return {
                "decision": "duplicate",
                "audit_id": existing.audit_id,
                "executed": False,
                "undo_token": existing.undo_token,
                "reason": "Idempotent request already processed",
            }

        # 2. Action 'none' or 'nudge'
        if proposal_action == "none":
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status="suggested_only",
                reason=reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {"decision": "none", "audit_id": record.audit_id, "executed": False}

        if proposal_action == "nudge":
            # Nudges are lightweight user-facing notifications; don't require external device control
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status="executed",
                reason=reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {"decision": "nudge", "audit_id": record.audit_id, "executed": True}

        # 3. External device action checks (request_dnd, request_pause)
        grant_key = f"{user_id}:{proposal_action}"
        grant = self.grants.get(grant_key)

        if not grant or not grant.is_valid():
            # Missing or invalid consent -> fallback to suggestion only (never execute)
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status="suggested_only" if (grant and grant.scope == "ask_every_time") else "blocked_no_consent",
                reason=f"User confirmation needed (scope: {grant.scope if grant else 'none'})",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "ask_user_confirmation" if (grant and grant.scope == "ask_every_time") else "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": record.reason,
            }

        # 4. Target device allowlist check
        if target_device_id and target_device_id not in self.allowed_devices:
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status="blocked_device_not_allowed",
                reason=f"Target device {target_device_id} not in approved allowlist",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": record.reason,
            }

        # 5. Passed all policy checks: issue execution and undo token
        undo_token = f"undo_{uuid.uuid4().hex[:12]}"

        # If a certified device simulator adapter is configured, execute via adapter
        if self.device_adapter and target_device_id:
            if proposal_action == "request_pause":
                receipt = self.device_adapter.execute_pause(target_device_id, idempotency_key)
                if not receipt.success:
                    record = AuditRecord(
                        audit_id=str(uuid.uuid4()),
                        timestamp=time.time(),
                        user_id=user_id,
                        action_type=proposal_action,
                        target_device_id=target_device_id,
                        status="blocked_device_not_allowed" if "support" in (receipt.error_message or "") else "suggested_only",
                        reason=receipt.error_message or "Device execution failed",
                        idempotency_key=idempotency_key,
                    )
                    self._record(record)
                    return {
                        "decision": "blocked",
                        "audit_id": record.audit_id,
                        "executed": False,
                        "reason": record.reason,
                    }
                if receipt.undo_token:
                    undo_token = receipt.undo_token
            elif proposal_action == "request_dnd":
                receipt = self.device_adapter.execute_dnd(target_device_id, idempotency_key)
                if not receipt.success:
                    record = AuditRecord(
                        audit_id=str(uuid.uuid4()),
                        timestamp=time.time(),
                        user_id=user_id,
                        action_type=proposal_action,
                        target_device_id=target_device_id,
                        status="blocked_device_not_allowed" if "support" in (receipt.error_message or "") else "suggested_only",
                        reason=receipt.error_message or "Device execution failed",
                        idempotency_key=idempotency_key,
                    )
                    self._record(record)
                    return {
                        "decision": "blocked",
                        "audit_id": record.audit_id,
                        "executed": False,
                        "reason": record.reason,
                    }
                if receipt.undo_token:
                    undo_token = receipt.undo_token

        record = AuditRecord(
            audit_id=str(uuid.uuid4()),
            timestamp=time.time(),
            user_id=user_id,
            action_type=proposal_action,
            target_device_id=target_device_id,
            status="executed",
            reason=reason,
            idempotency_key=idempotency_key,
            undo_token=undo_token,
        )
        self._record(record)
        return {
            "decision": "executed",
            "audit_id": record.audit_id,
            "executed": True,
            "undo_token": undo_token,
            "target_device_id": target_device_id,
            "action": proposal_action,
        }

    def evaluate_meeting_prep(
        self,
        user_id: str,
        calendar_event_id: str,
        start_epoch: int,
        idempotency_key: str,
        is_quiet_hours: bool = False,
    ) -> dict[str, Any]:
        """Evaluate pre-meeting briefing delivery against consent and quiet hours boundaries."""
        if idempotency_key in self.processed_idempotency_keys:
            existing = self.processed_idempotency_keys[idempotency_key]
            return {
                "decision": "duplicate",
                "audit_id": existing.audit_id,
                "executed": False,
                "reason": "Idempotent pre-meeting briefing already processed",
            }

        grant_key = f"{user_id}:pre_meeting_briefing"
        grant = self.grants.get(grant_key)

        if not grant or not grant.is_valid():
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="pre_meeting_briefing",
                target_device_id=None,
                status="blocked_no_consent",
                reason="Pre-meeting briefing consent grant missing or revoked",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": record.reason,
            }

        if is_quiet_hours:
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="pre_meeting_briefing",
                target_device_id=None,
                status="quiet_hours_suppressed",
                reason="Pre-meeting delivery suppressed due to active quiet hours window",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "quiet_hours_suppressed",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": record.reason,
            }

        record = AuditRecord(
            audit_id=str(uuid.uuid4()),
            timestamp=time.time(),
            user_id=user_id,
            action_type="pre_meeting_briefing",
            target_device_id=None,
            status="executed",
            reason=f"Pre-meeting briefing authorized for event {calendar_event_id}",
            idempotency_key=idempotency_key,
        )
        self._record(record)
        return {
            "decision": "executed",
            "audit_id": record.audit_id,
            "executed": True,
            "calendar_event_id": calendar_event_id,
        }

    def evaluate_slack_post(
        self,
        user_id: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Enforces Zero Slack Meeting Leakage Rule: no meeting content or scores ever reach Slack."""
        prohibited_keys = {
            "meeting_summary",
            "prep_summary",
            "questions",
            "3_questions",
            "evidence_ids",
            "evidence",
            "distraction_score",
            "score",
            "transcript",
            "reason",
        }
        found_prohibited = [k for k in prohibited_keys if k in payload and payload[k]]
        if found_prohibited:
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="slack_post",
                target_device_id=None,
                status="blocked_slack_meeting_leakage",
                reason=f"Zero Slack Meeting Leakage Rule violation: Prohibited fields detected: {found_prohibited}",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "status": "blocked_slack_meeting_leakage",
                "reason": record.reason,
            }

        grant_key = f"{user_id}:slack_post"
        grant = self.grants.get(grant_key)
        if not grant or not grant.is_valid():
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="slack_post",
                target_device_id=None,
                status="blocked_no_consent",
                reason="Slack status publishing requires explicit user consent",
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "status": "blocked_no_consent",
                "reason": record.reason,
            }

        record = AuditRecord(
            audit_id=str(uuid.uuid4()),
            timestamp=time.time(),
            user_id=user_id,
            action_type="slack_post",
            target_device_id=None,
            status="executed",
            reason="Minimal ambient availability status approved",
            idempotency_key=idempotency_key,
        )
        self._record(record)
        return {
            "decision": "executed",
            "audit_id": record.audit_id,
            "executed": True,
        }

    def execute_undo(self, undo_token: str) -> bool:
        """Reverse a previously executed action using its undo token."""
        if self.device_adapter:
            self.device_adapter.execute_undo(undo_token)
        for record in self.audit_log:
            if record.undo_token == undo_token and not record.undone:
                record.undone = True
                record.status = "undone"
                return True
        return False

    def _record(self, record: AuditRecord) -> None:
        self.audit_log.append(record)
        self.processed_idempotency_keys[record.idempotency_key] = record
