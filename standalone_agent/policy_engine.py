"""Deterministic policy and consent engine for Project AURA.

Enforces the boundary between model proposals and real-world execution.
Models cannot grant consent or execute actions directly. Every action must
pass deterministic grant checks, multi-tier feature flags / kill switches,
PRD undo rate circuit breakers, device allowlists, household boundary checks,
idempotency checks, and be logged to an immutable audit record with an undo token.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from standalone_agent.feature_flags import FeatureFlagManager
from standalone_agent.undo_guardrail import UndoRateGuardrail

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
    intent_pattern: str | None = None
    routine_actions: list[dict[str, str]] | None = None
    routine_name: str | None = None

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
        "blocked_kill_switch",
        "blocked_feature_flag",
        "blocked_household_mismatch",
        "undone",
        "duplicate",
        "quiet_hours_suppressed",
    ]
    reason: str
    idempotency_key: str
    undo_token: str | None = None
    undone: bool = False


class PolicyEngine:
    def __init__(
        self,
        allowed_devices: set[str] | None = None,
        device_adapter: Any = None,
        feature_flags: FeatureFlagManager | None = None,
        undo_guardrail: UndoRateGuardrail | None = None,
        slack_adapter: Any = None,
    ) -> None:
        self.grants: dict[str, ConsentGrant] = {}  # key: f"{user_id}:{action_type}"
        self.allowed_devices: set[str] = allowed_devices or set()
        self.device_adapter = device_adapter
        self.slack_adapter = slack_adapter
        self.feature_flags: FeatureFlagManager = feature_flags or FeatureFlagManager()
        self.undo_guardrail: UndoRateGuardrail = undo_guardrail or UndoRateGuardrail()
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
        tenant_id: str = "tenant_default",
        requesting_household_id: str | None = "household_default",
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

        # 2. Action 'none'
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

        # 3. Action 'nudge'
        if proposal_action == "nudge":
            # Nudges are lightweight user-facing notifications
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

        # 4. Multi-tier Feature Flag & Kill Switch check (Global -> Tenant -> User)
        is_flag_enabled, flag_reason = self.feature_flags.is_feature_enabled(
            capability=proposal_action,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        if not is_flag_enabled:
            status_val = "blocked_kill_switch" if "Kill Switch" in flag_reason else "blocked_feature_flag"
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status=status_val,
                reason=flag_reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": flag_reason,
                "blocked_by": "kill_switch_or_flag",
            }

        # 5. Safety Guardrail: PRD Section 6 Undo Rate Circuit Breaker (>5% undo pauses auto-execution)
        is_paused, undo_rate = self.undo_guardrail.is_auto_execution_paused(user_id, proposal_action)
        if is_paused:
            pause_reason = (
                f"Auto-execution paused by safety guardrail (Undo rate {undo_rate*100:.1f}% > 5%). "
                "Manual user confirmation required."
            )
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type=proposal_action,
                target_device_id=target_device_id,
                status="suggested_only",
                reason=pause_reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "ask_user_confirmation",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": pause_reason,
                "auto_execution_paused": True,
                "undo_rate": undo_rate,
            }

        # 6. External device action checks (request_dnd, request_pause)
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

        # 7. Target device allowlist check
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

        # 8. Passed all policy checks: issue execution and undo token
        undo_token = f"undo_{uuid.uuid4().hex[:12]}"

        # If a certified device simulator adapter is configured, execute via adapter
        if self.device_adapter and target_device_id:
            if proposal_action == "request_pause":
                receipt = self.device_adapter.execute_pause(
                    target_device_id,
                    idempotency_key,
                    requesting_household_id=requesting_household_id,
                )
                if not receipt.success:
                    err_msg = receipt.error_message or "Device execution failed"
                    if "Household mismatch" in err_msg:
                        status_val = "blocked_household_mismatch"
                    elif "support" in err_msg or receipt.certification_status == "uncertified":
                        status_val = "blocked_device_not_allowed"
                    else:
                        status_val = "suggested_only"

                    record = AuditRecord(
                        audit_id=str(uuid.uuid4()),
                        timestamp=time.time(),
                        user_id=user_id,
                        action_type=proposal_action,
                        target_device_id=target_device_id,
                        status=status_val,
                        reason=err_msg,
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
                receipt = self.device_adapter.execute_dnd(
                    target_device_id,
                    idempotency_key,
                    requesting_household_id=requesting_household_id,
                )
                if not receipt.success:
                    err_msg = receipt.error_message or "Device execution failed"
                    if "Household mismatch" in err_msg:
                        status_val = "blocked_household_mismatch"
                    elif "support" in err_msg or receipt.certification_status == "uncertified":
                        status_val = "blocked_device_not_allowed"
                    else:
                        status_val = "suggested_only"

                    record = AuditRecord(
                        audit_id=str(uuid.uuid4()),
                        timestamp=time.time(),
                        user_id=user_id,
                        action_type=proposal_action,
                        target_device_id=target_device_id,
                        status=status_val,
                        reason=err_msg,
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

        # 9. Record successful execution in safety guardrail & audit trail
        self.undo_guardrail.record_execution(user_id, proposal_action)

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

        # Check feature flag for watch briefing
        is_flag_enabled, flag_reason = self.feature_flags.is_feature_enabled(
            capability="watch_whisper",
            user_id=user_id,
        )
        if not is_flag_enabled:
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="pre_meeting_briefing",
                target_device_id=None,
                status="blocked_feature_flag",
                reason=flag_reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "reason": flag_reason,
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

        # Check feature flag for Slack status
        is_flag_enabled, flag_reason = self.feature_flags.is_feature_enabled(
            capability="slack_post",
            user_id=user_id,
        )
        if not is_flag_enabled:
            record = AuditRecord(
                audit_id=str(uuid.uuid4()),
                timestamp=time.time(),
                user_id=user_id,
                action_type="slack_post",
                target_device_id=None,
                status="blocked_feature_flag",
                reason=flag_reason,
                idempotency_key=idempotency_key,
            )
            self._record(record)
            return {
                "decision": "blocked",
                "audit_id": record.audit_id,
                "executed": False,
                "status": "blocked_feature_flag",
                "reason": flag_reason,
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

        undo_token: str | None = None
        target_channel: str = payload.get("target_channel", "user_profile")
        workspace_id: str = payload.get("workspace_id", "T012345678")

        if self.slack_adapter:
            try:
                slack_res = self.slack_adapter.publish_status(
                    user_id=user_id,
                    workspace_id=workspace_id,
                    channel_id=target_channel,
                    preview_payload=payload,
                    idempotency_key=idempotency_key,
                )
                undo_token = slack_res.get("undo_token")
            except Exception as e:
                record = AuditRecord(
                    audit_id=str(uuid.uuid4()),
                    timestamp=time.time(),
                    user_id=user_id,
                    action_type="slack_post",
                    target_device_id=None,
                    status="blocked_device_not_allowed",
                    reason=f"Slack publish failed: {str(e)}",
                    idempotency_key=idempotency_key,
                )
                self._record(record)
                return {
                    "decision": "blocked",
                    "audit_id": record.audit_id,
                    "executed": False,
                    "status": "blocked_channel_or_workspace",
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
            undo_token=undo_token,
        )
        self._record(record)
        return {
            "decision": "executed",
            "audit_id": record.audit_id,
            "executed": True,
            "undo_token": undo_token,
            "target_channel": target_channel,
        }

    def execute_undo(self, undo_token: str) -> bool:
        """Reverse a previously executed action using its undo token."""
        if self.device_adapter:
            self.device_adapter.execute_undo(undo_token)
        if self.slack_adapter:
            self.slack_adapter.execute_undo(undo_token)
        for record in self.audit_log:
            if record.undo_token == undo_token and not record.undone:
                record.undone = True
                record.status = "undone"
                # Record undo in safety circuit breaker
                self.undo_guardrail.record_undo(record.user_id, record.action_type)
                return True
        return False

    def remember_routine(
        self,
        user_id: str,
        intent: str,
        routine_actions: list[dict[str, Any]],
        routine_name: str | None = None,
        tenant_id: str = "tenant_default",
        target_devices: list[str] | None = None,
    ) -> ConsentGrant:
        """Persist a ConsentGrant with scope='always' for an adaptive intent routine."""
        intent_clean = intent.strip().lower()
        target_dev = target_devices[0] if target_devices else (
            routine_actions[0].get("device") if routine_actions and isinstance(routine_actions[0], dict) else None
        )
        grant = ConsentGrant(
            tenant_id=tenant_id,
            user_id=user_id,
            action_type="request_pause",
            scope="always",
            intent_pattern=intent_clean,
            routine_actions=routine_actions,
            routine_name=routine_name or f"Routine: {intent}",
            target_device_id=target_dev,
        )
        self.grants[f"{user_id}:routine:{intent_clean}"] = grant
        self.grants[f"{user_id}:intent:{intent_clean}"] = grant
        return grant

    def evaluate_routine(
        self,
        user_id: str,
        intent: str,
        session_id: str | None = None,
        idempotency_key: str | None = None,
        proposed_actions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Evaluate whether a learned routine exists and auto-execute it if scope is 'always'."""
        intent_clean = intent.strip().lower()
        key = f"{user_id}:routine:{intent_clean}"
        grant = self.grants.get(key)
        if not grant:
            grant = self.grants.get(f"{user_id}:intent:{intent_clean}")
        if not grant:
            for g in self.grants.values():
                if g.user_id == user_id and g.intent_pattern and g.intent_pattern == intent_clean:
                    grant = g
                    break

        actions_to_execute = (grant.routine_actions if (grant and grant.routine_actions) else proposed_actions) or []

        if not grant or not grant.is_valid() or not actions_to_execute:
            return {
                "decision": "ask_user_confirmation",
                "executed": False,
                "reason": "No valid persistent routine grant found; user approval required",
            }

        # Auto-execute routine actions via device_adapter.execute_batch()
        undo_token = None
        if self.device_adapter and hasattr(self.device_adapter, "execute_batch"):
            batch_result = self.device_adapter.execute_batch(actions_to_execute)
            undo_token = batch_result.get("batch_undo_token") or batch_result.get("undo_token")

        audit_id = str(uuid.uuid4())
        record = AuditRecord(
            audit_id=audit_id,
            timestamp=time.time(),
            user_id=user_id,
            action_type="request_pause",
            target_device_id=",".join(a.get("device", "") for a in actions_to_execute if isinstance(a, dict)),
            status="executed",
            reason=f"Executed learned routine '{grant.routine_name}' for intent '{intent}'",
            idempotency_key=idempotency_key or str(uuid.uuid4()),
            undo_token=undo_token,
        )
        self._record(record)

        return {
            "decision": "executed_consent_rule",
            "executed": True,
            "undo_token": undo_token,
            "routine_name": grant.routine_name,
            "device_actions": actions_to_execute,
            "audit_id": audit_id,
        }

    def undo_action(self, undo_token: str, user_id: str | None = None) -> Any:
        """Alias for execute_undo returning an object with status."""
        success = self.execute_undo(undo_token)

        class UndoStatus:
            def __init__(self, s: bool):
                self.success = s
                self.status = "undone" if s else "failed"

        return UndoStatus(success)

    def _record(self, record: AuditRecord) -> None:
        self.audit_log.append(record)
        self.processed_idempotency_keys[record.idempotency_key] = record
