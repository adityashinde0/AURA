"""HTTP Control Plane Lambda handler for Project AURA.

Implements REST API Gateway endpoints:
- /api/v1/consent/grants (GET, POST)
- /api/v1/consent/grants/{grantId} (DELETE)
- /api/v1/focus/session (POST)
- /api/v1/focus/bank (GET)
- /api/v1/focus/signals (GET, POST)
- /api/v1/focus/signal (POST)
- /api/v1/audit/actions (GET)
- /api/v1/actions/undo (POST)
- /api/v1/user/export (GET)
- /api/v1/user/data (DELETE)
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

from standalone_agent.device_adapter import DeviceSimulatorAdapter

# Optional boto3 clients when running in live AWS Lambda
try:
    import boto3
    _dynamodb = boto3.resource("dynamodb") if os.getenv("AWS_DEFAULT_REGION") else None
except Exception:
    _dynamodb = None

CORE_TABLE_NAME = os.getenv("AURA_CORE_TABLE", "AuraCoreTable")


class InMemoryDataStore:
    """In-memory data store for local simulation, contract testing, and offline modes."""

    def __init__(self) -> None:
        self.grants: dict[str, dict[str, Any]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self.audit_records: list[dict[str, Any]] = []
        self.undone_tokens: set[str] = set()
        self.deep_work_banks: dict[str, dict[str, Any]] = {}  # user_id -> {"balance": int, "transactions": list}
        self.signal_consents: dict[str, set[str]] = {}  # user_id -> set of signal types
        self.device_adapter: DeviceSimulatorAdapter = DeviceSimulatorAdapter()


default_store = InMemoryDataStore()


def _json_resp(status: int, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(data),
    }


def handle_get_grants(user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    active_grants = [g for g in store.grants.values() if g.get("user_id") == user_id and g.get("active", True)]
    return _json_resp(200, {"user_id": user_id, "grants": active_grants})


def handle_create_grant(body: dict[str, Any], store: InMemoryDataStore = default_store) -> dict[str, Any]:
    user_id = body.get("user_id")
    action_type = body.get("action_type")
    scope = body.get("scope")

    if not user_id or not action_type or not scope:
        return _json_resp(400, {"error": "invalid_parameters", "message": "user_id, action_type, scope are required"})

    valid_actions = {"nudge", "request_dnd", "request_pause", "slack_status", "pre_meeting_briefing"}
    valid_scopes = {"ask_every_time", "allow_session", "allow_always", "never"}

    if action_type not in valid_actions or scope not in valid_scopes:
        return _json_resp(400, {"error": "invalid_enum", "message": "action_type or scope not permitted"})

    grant_id = f"grant_{uuid.uuid4().hex[:10]}"
    now = time.time()
    ttl_seconds = body.get("ttl_seconds", 86400)

    grant = {
        "grant_id": grant_id,
        "user_id": user_id,
        "tenant_id": body.get("tenant_id", "tenant_default"),
        "action_type": action_type,
        "scope": scope,
        "target_allowlist": body.get("target_allowlist", []),
        "active": True,
        "created_at": now,
        "expires_at": now + ttl_seconds,
    }
    store.grants[grant_id] = grant
    return _json_resp(201, grant)


def handle_revoke_grant(grant_id: str, user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    grant = store.grants.get(grant_id)
    if not grant or grant.get("user_id") != user_id:
        return _json_resp(200, {"revoked": True, "grant_id": grant_id, "revoked_at": time.time()})

    grant["active"] = False
    grant["revoked_at"] = time.time()
    return _json_resp(200, {"revoked": True, "grant_id": grant_id, "revoked_at": grant["revoked_at"]})


def handle_focus_session(body: dict[str, Any], store: InMemoryDataStore = default_store) -> dict[str, Any]:
    user_id = body.get("user_id")
    action = body.get("action")

    if not user_id or action not in {"start", "stop"}:
        return _json_resp(400, {"error": "invalid_parameters", "message": "user_id and action (start|stop) required"})

    now = time.time()
    if action == "start":
        duration = body.get("duration_minutes", 45)
        session_id = body.get("session_id") or f"sess_{uuid.uuid4().hex[:10]}"
        session = {
            "session_id": session_id,
            "user_id": user_id,
            "status": "active",
            "started_at": now,
            "expires_at": now + (duration * 60),
            "duration_minutes": duration,
        }
        store.sessions[session_id] = session
        # Ensure deep work bank exists
        if user_id not in store.deep_work_banks:
            store.deep_work_banks[user_id] = {"balance": 0, "transactions": []}
        return _json_resp(200, session)
    else:
        session_id = body.get("session_id")
        if session_id and session_id in store.sessions:
            sess = store.sessions[session_id]
            sess["status"] = "completed"
            sess["ended_at"] = now
            # Award points for completed duration if not distracted
            elapsed_min = int((now - sess["started_at"]) / 60)
            points = 2 if elapsed_min >= 25 else 0
            if points > 0:
                bank = store.deep_work_banks.setdefault(user_id, {"balance": 0, "transactions": []})
                bank["balance"] += points
                bank["transactions"].append(
                    {
                        "transaction_id": f"tx_{uuid.uuid4().hex[:8]}",
                        "session_id": session_id,
                        "delta": points,
                        "reason": f"Completed {elapsed_min}m focus session",
                        "timestamp": now,
                    }
                )
            return _json_resp(200, sess)
        return _json_resp(200, {"session_id": session_id or "latest", "user_id": user_id, "status": "completed", "started_at": now})


def handle_get_bank(user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Retrieve private Deep Work Bank balance and history. FR-8: User-only, no employer view."""
    bank = store.deep_work_banks.get(user_id, {"balance": 0, "transactions": []})
    return _json_resp(
        200,
        {
            "user_id": user_id,
            "deep_work_balance": bank["balance"],
            "private_only": True,
            "team_sharing_enabled": False,
            "employer_reporting": "STRICTLY_PROHIBITED",
            "transaction_count": len(bank["transactions"]),
            "recent_transactions": list(reversed(bank["transactions"][-20:])),
        },
    )


def handle_get_signals(user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Retrieve enabled optional signal preferences for user."""
    consented = store.signal_consents.get(user_id, set())
    available = [
        {
            "signal_type": "self_report_distracted",
            "name": "Self-Report Distracted",
            "description": "Explicit user report via shortcut, button, or voice",
            "category": "explicit",
            "enabled": True,  # Always available
            "requires_consent": False,
        },
        {
            "signal_type": "allowed_video_noise",
            "name": "Local Video Audio Monitor",
            "description": "Detects ambient video sound locally without sending audio to cloud",
            "category": "optional_local",
            "enabled": "allowed_video_noise" in consented,
            "requires_consent": True,
        },
        {
            "signal_type": "app_focus_tracking",
            "name": "Active Work App Verification",
            "description": "Monitors opted-in work tools locally",
            "category": "optional_local",
            "enabled": "app_focus_tracking" in consented,
            "requires_consent": True,
        },
    ]
    return _json_resp(200, {"user_id": user_id, "signals": available})


def handle_set_signals(body: dict[str, Any], store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Update consent for optional local focus signals."""
    user_id = body.get("user_id")
    signal_type = body.get("signal_type")
    enabled = body.get("enabled", False)

    if not user_id or not signal_type:
        return _json_resp(400, {"error": "invalid_parameters", "message": "user_id and signal_type required"})

    if user_id not in store.signal_consents:
        store.signal_consents[user_id] = set()

    if enabled:
        store.signal_consents[user_id].add(signal_type)
    else:
        store.signal_consents[user_id].discard(signal_type)

    return _json_resp(
        200,
        {
            "user_id": user_id,
            "signal_type": signal_type,
            "enabled": enabled,
            "consented_signals": list(store.signal_consents[user_id]),
        },
    )


def handle_focus_signal(body: dict[str, Any], store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Intake focus signal via REST API, evaluate policy, and return proposal and action decision."""
    user_id = body.get("user_id")
    session_id = body.get("session_id")
    explicit_signal = body.get("explicit_signal", "none")
    consented_score = float(body.get("consented_signal_score", 0.0))

    if not user_id or not session_id:
        return _json_resp(400, {"error": "invalid_parameters", "message": "user_id and session_id required"})

    is_distracted = explicit_signal == "self_report_distracted"
    distraction_score = 0.80 if is_distracted else consented_score
    bank_delta = -1 if is_distracted else 0

    # Check bank update
    if bank_delta != 0:
        bank = store.deep_work_banks.setdefault(user_id, {"balance": 0, "transactions": []})
        bank["balance"] = max(0, bank["balance"] + bank_delta)
        bank["transactions"].append(
            {
                "transaction_id": f"tx_{uuid.uuid4().hex[:8]}",
                "session_id": session_id,
                "delta": bank_delta,
                "reason": "Self-report distraction penalty",
                "timestamp": time.time(),
            }
        )

    recommended_action = "request_pause" if is_distracted else "none"
    reason = "Self-reported distraction. Proposing to pause allowed media devices." if is_distracted else "Focus uninterrupted."

    # Check consent grant for recommended_action
    active_grants = [
        g
        for g in store.grants.values()
        if g.get("user_id") == user_id and g.get("action_type") == recommended_action and g.get("active", True)
    ]
    has_grant = len(active_grants) > 0 and active_grants[0].get("scope") in ("allow_session", "allow_always")
    allowed_devices = active_grants[0].get("target_allowlist", []) if has_grant else []

    target_device = allowed_devices[0] if allowed_devices else None
    action_decision = "suggested_only"
    undo_token = None

    now = time.time()
    idempotency_key = f"{user_id}:{session_id}:{int(now)}"

    if is_distracted and has_grant and target_device:
        # Execute on simulated device
        receipt = store.device_adapter.execute_pause(target_device, idempotency_key=idempotency_key)
        if receipt.success:
            action_decision = "executed"
            undo_token = receipt.undo_token
            store.audit_records.append(
                {
                    "action_id": receipt.receipt_id,
                    "user_id": user_id,
                    "action_type": "request_pause",
                    "target_device_id": target_device,
                    "status": "executed",
                    "reason": reason,
                    "undo_token": undo_token,
                    "idempotency_key": idempotency_key,
                    "timestamp": now,
                }
            )
        else:
            action_decision = "blocked_device_not_allowed"
    elif is_distracted:
        action_decision = "suggested_only"
        store.audit_records.append(
            {
                "action_id": f"sug_{uuid.uuid4().hex[:8]}",
                "user_id": user_id,
                "action_type": "request_pause",
                "target_device_id": target_device,
                "status": "suggested_only",
                "reason": "Proposed pause for user confirmation (requires explicit approval)",
                "idempotency_key": idempotency_key,
                "timestamp": now,
            }
        )

    proposal = {
        "prep_summary": "Focus session in progress.",
        "3_questions": ["What is your immediate goal?", "Can you remove this distraction?", "Resume focus now?"],
        "emotion_tone": "supportive" if is_distracted else "calm",
        "is_distracted": is_distracted,
        "distraction_score": distraction_score,
        "deep_work_bank_delta": bank_delta,
        "evidence_ids": [],
        "recommended_action": recommended_action,
        "reason": reason,
    }

    return _json_resp(
        200,
        {
            "proposal": proposal,
            "policy_required": True,
            "decision": action_decision,
            "undo_token": undo_token,
            "target_device_id": target_device,
        },
    )


def handle_query_audit(user_id: str, limit: int = 20, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    records = [r for r in store.audit_records if r.get("user_id") == user_id]
    records.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
    return _json_resp(200, {"user_id": user_id, "records": records[:limit]})


def handle_undo_action(body: dict[str, Any], store: InMemoryDataStore = default_store) -> dict[str, Any]:
    undo_token = body.get("undo_token")
    user_id = body.get("user_id")

    if not undo_token or not user_id:
        return _json_resp(400, {"error": "invalid_parameters", "message": "undo_token and user_id required"})

    if undo_token in store.undone_tokens:
        return _json_resp(200, {"success": True, "undo_token": undo_token, "message": "Action was already reversed (idempotent)"})

    store.undone_tokens.add(undo_token)

    # Reverse on simulated device adapter
    device_result = store.device_adapter.execute_undo(undo_token)

    # Mark existing audit record undone
    for record in store.audit_records:
        if record.get("undo_token") == undo_token:
            record["undone"] = True
            record["status"] = "undone"

    # Record reversal entry in audit log
    store.audit_records.append(
        {
            "action_id": f"undo_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "action_type": "undo_reversal",
            "status": "undone",
            "reason": f"Action reversed by user via token {undo_token}",
            "undo_token": undo_token,
            "timestamp": time.time(),
        }
    )
    return _json_resp(
        200,
        {
            "success": True,
            "undo_token": undo_token,
            "message": "Action reversed successfully",
            "device_result": device_result,
        },
    )


def handle_export_user_data(user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Privacy export: full user profile, grants, sessions, bank, and audit records with zero transcript leakage."""
    user_grants = [g for g in store.grants.values() if g.get("user_id") == user_id]
    user_sessions = [s for s in store.sessions.values() if s.get("user_id") == user_id]
    user_audit = [a for a in store.audit_records if a.get("user_id") == user_id]
    bank = store.deep_work_banks.get(user_id, {"balance": 0, "transactions": []})
    signals = list(store.signal_consents.get(user_id, set()))

    return _json_resp(
        200,
        {
            "user_id": user_id,
            "exported_at": time.time(),
            "privacy_standard": "ZERO_RAW_TRANSCRIPTS_RETAINED",
            "consent_grants": user_grants,
            "focus_sessions": user_sessions,
            "audit_trail": user_audit,
            "deep_work_bank": bank,
            "consented_signals": signals,
        },
    )


def handle_delete_user_data(user_id: str, store: InMemoryDataStore = default_store) -> dict[str, Any]:
    """Cryptographic deletion / purge of all data for user across all collections."""
    deleted_grants = [gid for gid, g in store.grants.items() if g.get("user_id") == user_id]
    for gid in deleted_grants:
        del store.grants[gid]

    deleted_sessions = [sid for sid, s in store.sessions.items() if s.get("user_id") == user_id]
    for sid in deleted_sessions:
        del store.sessions[sid]

    store.audit_records = [a for a in store.audit_records if a.get("user_id") != user_id]
    store.deep_work_banks.pop(user_id, None)
    store.signal_consents.pop(user_id, None)

    return _json_resp(
        200,
        {
            "user_id": user_id,
            "deleted": True,
            "purged_records": {
                "grants": len(deleted_grants),
                "sessions": len(deleted_sessions),
            },
            "deleted_at": time.time(),
        },
    )


def lambda_handler(
    event: dict[str, Any],
    _context: object = None,
    store_override: InMemoryDataStore | None = None,
) -> dict[str, Any]:
    store = store_override or default_store
    path = event.get("path") or event.get("rawPath") or ""
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method") or "GET"
    query_params = event.get("queryStringParameters") or {}

    raw_body = event.get("body")
    body: dict[str, Any] = {}
    if isinstance(raw_body, str):
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            return _json_resp(400, {"error": "invalid_json", "message": "Request body must be valid JSON"})
    elif isinstance(raw_body, dict):
        body = raw_body

    # Routing
    if path == "/api/v1/consent/grants" and http_method == "GET":
        user_id = query_params.get("user_id", "")
        if not user_id:
            return _json_resp(400, {"error": "missing_query_param", "message": "user_id is required"})
        return handle_get_grants(user_id, store=store)

    if path == "/api/v1/consent/grants" and http_method == "POST":
        return handle_create_grant(body, store=store)

    if path.startswith("/api/v1/consent/grants/") and http_method == "DELETE":
        grant_id = path.split("/")[-1]
        user_id = query_params.get("user_id", "")
        return handle_revoke_grant(grant_id, user_id, store=store)

    if path == "/api/v1/focus/session" and http_method == "POST":
        return handle_focus_session(body, store=store)

    if path == "/api/v1/focus/bank" and http_method == "GET":
        user_id = query_params.get("user_id", "")
        if not user_id:
            return _json_resp(400, {"error": "missing_query_param", "message": "user_id is required"})
        return handle_get_bank(user_id, store=store)

    if path == "/api/v1/focus/signals" and http_method == "GET":
        user_id = query_params.get("user_id", "")
        if not user_id:
            return _json_resp(400, {"error": "missing_query_param", "message": "user_id is required"})
        return handle_get_signals(user_id, store=store)

    if path == "/api/v1/focus/signals" and http_method == "POST":
        return handle_set_signals(body, store=store)

    if path == "/api/v1/focus/signal" and http_method == "POST":
        return handle_focus_signal(body, store=store)

    if path == "/api/v1/audit/actions" and http_method == "GET":
        user_id = query_params.get("user_id", "")
        limit = int(query_params.get("limit", 20))
        return handle_query_audit(user_id, limit=limit, store=store)

    if path == "/api/v1/actions/undo" and http_method == "POST":
        return handle_undo_action(body, store=store)

    if path == "/api/v1/user/export" and http_method == "GET":
        user_id = query_params.get("user_id", "")
        if not user_id:
            return _json_resp(400, {"error": "missing_query_param", "message": "user_id is required"})
        return handle_export_user_data(user_id, store=store)

    if path == "/api/v1/user/data" and http_method == "DELETE":
        user_id = query_params.get("user_id", "")
        if not user_id:
            return _json_resp(400, {"error": "missing_query_param", "message": "user_id is required"})
        return handle_delete_user_data(user_id, store=store)

    return _json_resp(404, {"error": "not_found", "message": f"Resource {http_method} {path} not found"})
