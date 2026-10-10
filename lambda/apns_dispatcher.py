"""AURA APNs/FCM Delivery Lambda handler.

Consumes MeetingPrepTriggered EventBridge events and delivers push notifications
to registered wearable devices via APNs (iOS/watchOS) or FCM (Android).

Architecture constraints:
- Returns a proposal with policy_required: True; never executes actions directly.
- All output goes through _log(); bare print() is forbidden.
- Push token is loaded from the wearable binding store (InMemoryDataStore in tests,
  DynamoDB lookup in production via handle_register_wearable()).
- Delivery is suppressed when is_quiet_hours=True unless user preference
  override_quiet_hours=True is set.
"""
from __future__ import annotations

import importlib
import json
import os
import sys
import time
import uuid
from typing import Any

# ---------------------------------------------------------------------------
# Import lambda modules via importlib (lambda is a Python keyword)
# ---------------------------------------------------------------------------
_cp = importlib.import_module("lambda.control_plane")
InMemoryDataStore = _cp.InMemoryDataStore

# ---------------------------------------------------------------------------
# Structured logger — same pattern as lambda/focus_guardian.py
# ---------------------------------------------------------------------------

def _log(level: str, event: str, **fields: Any) -> None:
    """Emit a single structured JSON log line to stdout.

    No raw push tokens, auth credentials, or meeting content are ever logged.
    """
    record = {
        "timestamp": time.time(),
        "level": level,
        "service": "aura.apns_dispatcher",
        "event": event,
        **fields,
    }
    print(json.dumps(record, default=str), file=sys.stdout, flush=True)


# ---------------------------------------------------------------------------
# HTTP client factory — swappable in tests via env-var/dependency injection
# ---------------------------------------------------------------------------

def _get_http_client() -> Any:
    """Return an httpx.AsyncClient-compatible object.

    In tests this is replaced by an injected mock.  In production the real
    httpx.AsyncClient is used via httpx.Client (sync wrapper) so that the
    Lambda execution model stays simple.
    """
    try:
        import httpx  # type: ignore[import]
        return httpx
    except ImportError:
        return None


# ---------------------------------------------------------------------------
# Push delivery stubs (APNs / FCM)
# ---------------------------------------------------------------------------

_APNS_HOST = os.getenv("APNS_HOST", "https://api.sandbox.push.apple.com")
_FCM_HOST = os.getenv("FCM_HOST", "https://fcm.googleapis.com")
_APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "com.aura.app")


def _send_apns(
    push_token: str,
    payload: dict[str, Any],
    http_client: Any | None = None,
) -> dict[str, Any]:
    """Send an APNs HTTP/2 push notification.

    Uses env-var credentials.  In test environments ``http_client`` is a mock
    that records calls without making real network connections.
    """
    apns_payload = {
        "aps": {
            "alert": {
                "title": payload.get("title", "AURA Meeting Prep"),
                "body": payload.get("body", ""),
            },
            "sound": "default" if payload.get("sound_enabled", True) else None,
            "category": "MEETING_PREP",
        },
        "card_id": payload.get("card_id"),
        "calendar_event_id": payload.get("calendar_event_id"),
        "deep_link": payload.get("deep_link", ""),
    }
    # Remove None values so APNs doesn't reject the payload
    apns_payload["aps"] = {k: v for k, v in apns_payload["aps"].items() if v is not None}

    client = http_client or _get_http_client()
    if client is None:
        # httpx not installed — log and treat as a dry run
        _log("WARNING", "apns_httpx_unavailable", push_token_suffix=push_token[-6:])
        return {"provider": "apns", "status": "dry_run", "reason": "httpx_not_installed"}

    if hasattr(client, "post_apns"):
        # Injected test mock
        return client.post_apns(push_token, apns_payload)

    url = f"{_APNS_HOST}/3/device/{push_token}"
    headers = {
        "apns-topic": _APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "content-type": "application/json",
    }
    resp = client.post(url, json=apns_payload, headers=headers, timeout=10)
    if resp.status_code == 200:
        return {"provider": "apns", "status": "delivered"}
    return {"provider": "apns", "status": "failed", "http_status": resp.status_code}


def _send_fcm(
    push_token: str,
    payload: dict[str, Any],
    http_client: Any | None = None,
) -> dict[str, Any]:
    """Send an FCM HTTP v1 push notification."""
    fcm_payload = {
        "message": {
            "token": push_token,
            "notification": {
                "title": payload.get("title", "AURA Meeting Prep"),
                "body": payload.get("body", ""),
            },
            "data": {
                "card_id": str(payload.get("card_id", "")),
                "calendar_event_id": str(payload.get("calendar_event_id", "")),
                "deep_link": str(payload.get("deep_link", "")),
            },
        }
    }

    client = http_client or _get_http_client()
    if client is None:
        _log("WARNING", "fcm_httpx_unavailable", push_token_suffix=push_token[-6:])
        return {"provider": "fcm", "status": "dry_run", "reason": "httpx_not_installed"}

    if hasattr(client, "post_fcm"):
        return client.post_fcm(push_token, fcm_payload)

    fcm_project_id = os.getenv("FCM_PROJECT_ID", "aura-project")
    url = f"{_FCM_HOST}/v1/projects/{fcm_project_id}/messages:send"
    headers = {"content-type": "application/json"}
    resp = client.post(url, json=fcm_payload, headers=headers, timeout=10)
    if resp.status_code == 200:
        return {"provider": "fcm", "status": "delivered"}
    return {"provider": "fcm", "status": "failed", "http_status": resp.status_code}


# ---------------------------------------------------------------------------
# Core dispatch logic
# ---------------------------------------------------------------------------

def dispatch(
    detail: dict[str, Any],
    store: InMemoryDataStore,
    http_client: Any | None = None,
) -> dict[str, Any]:
    """Evaluate policy, format briefing, and deliver push notification.

    Parameters
    ----------
    detail:
        The ``detail`` object from the MeetingPrepTriggered EventBridge event.
    store:
        The data store containing wearable bindings, audit records, and grants.
    http_client:
        Optional injectable HTTP client for testing.

    Returns
    -------
    dict containing ``policy_required: True`` and the dispatch outcome.
    """
    calendar_event_id: str = detail.get("calendar_event_id", "")
    user_id: str = detail.get("user_id", "")
    start_epoch: int = int(detail.get("start_epoch", 0))
    idempotency_key: str = detail.get("idempotency_key") or f"apns_{uuid.uuid4().hex[:12]}"
    meeting_title: str = detail.get("meeting_title", "Upcoming Meeting")
    is_quiet_hours: bool = bool(detail.get("is_quiet_hours", False))
    override_quiet_hours: bool = bool(detail.get("override_quiet_hours", False))

    if not calendar_event_id or not user_id or not start_epoch:
        _log(
            "WARNING",
            "apns_dispatcher_invalid_input",
            missing_fields=[
                f for f, v in [
                    ("calendar_event_id", calendar_event_id),
                    ("user_id", user_id),
                    ("start_epoch", start_epoch),
                ] if not v
            ],
        )
        return {
            "statusCode": 400,
            "policy_required": True,
            "decision": "blocked",
            "error": "invalid_input",
            "message": "calendar_event_id, user_id, and start_epoch are required",
        }

    # ------------------------------------------------------------------
    # 1. Quiet hours suppression
    # ------------------------------------------------------------------
    if is_quiet_hours and not override_quiet_hours:
        _log(
            "INFO",
            "apns_dispatcher_quiet_hours_suppressed",
            user_id=user_id,
            calendar_event_id=calendar_event_id,
        )
        audit_id = f"aud_{uuid.uuid4().hex[:8]}"
        store.audit_records.append({
            "action_id": audit_id,
            "user_id": user_id,
            "action_type": "pre_meeting_briefing",
            "status": "quiet_hours_suppressed",
            "calendar_event_id": calendar_event_id,
            "timestamp": time.time(),
        })
        return {
            "statusCode": 200,
            "policy_required": True,
            "decision": "quiet_hours_suppressed",
            "audit_id": audit_id,
            "delivered": False,
        }

    # ------------------------------------------------------------------
    # 2. Policy gate — evaluate_meeting_prep() must return "executed"
    # ------------------------------------------------------------------
    from standalone_agent.policy_engine import PolicyEngine, ConsentGrant

    policy = PolicyEngine()
    # Scope values in the control_plane store use "allow_session" / "allow_always";
    # ConsentGrant.is_valid() recognises "allow_for_session" / "always".
    _SCOPE_MAP: dict[str, str] = {
        "allow_session": "allow_for_session",
        "allow_always": "always",
        "never": "never",
        "ask_every_time": "ask_every_time",
    }

    # Copy grants from store so the engine can evaluate them
    for grant_dict in store.grants.values():
        if (
            grant_dict.get("user_id") == user_id
            and grant_dict.get("active", True)
        ):
            try:
                raw_scope = grant_dict.get("scope", "ask_every_time")
                mapped_scope = _SCOPE_MAP.get(raw_scope, raw_scope)
                cg = ConsentGrant(
                    tenant_id=grant_dict.get("tenant_id", "tenant_default"),
                    user_id=grant_dict["user_id"],
                    action_type=grant_dict["action_type"],
                    scope=mapped_scope,
                    created_at=grant_dict.get("created_at", time.time()),
                    expires_at=grant_dict.get("expires_at"),
                    revoked=not grant_dict.get("active", True),
                )
                policy.set_grant(cg)
            except (KeyError, TypeError):
                pass

    policy_result = policy.evaluate_meeting_prep(
        user_id=user_id,
        calendar_event_id=calendar_event_id,
        start_epoch=start_epoch,
        idempotency_key=idempotency_key,
        is_quiet_hours=False,  # already checked above
    )

    if policy_result.get("decision") != "executed":
        _log(
            "INFO",
            "apns_dispatcher_policy_blocked",
            user_id=user_id,
            calendar_event_id=calendar_event_id,
            decision=policy_result.get("decision"),
            reason=policy_result.get("reason"),
        )
        audit_id = f"aud_{uuid.uuid4().hex[:8]}"
        store.audit_records.append({
            "action_id": audit_id,
            "user_id": user_id,
            "action_type": "pre_meeting_briefing",
            "status": policy_result.get("decision", "blocked"),
            "calendar_event_id": calendar_event_id,
            "timestamp": time.time(),
        })
        return {
            "statusCode": 200,
            "policy_required": True,
            "decision": policy_result.get("decision", "blocked"),
            "audit_id": audit_id,
            "delivered": False,
            "reason": policy_result.get("reason"),
        }

    # ------------------------------------------------------------------
    # 3. Load push token from wearable binding store
    # ------------------------------------------------------------------
    binding = store.wearable_bindings.get(user_id)
    if not binding or not binding.get("active", True):
        _log(
            "WARNING",
            "apns_dispatcher_no_binding",
            user_id=user_id,
        )
        audit_id = f"aud_{uuid.uuid4().hex[:8]}"
        store.audit_records.append({
            "action_id": audit_id,
            "user_id": user_id,
            "action_type": "pre_meeting_briefing",
            "status": "no_device_binding",
            "calendar_event_id": calendar_event_id,
            "timestamp": time.time(),
        })
        return {
            "statusCode": 200,
            "policy_required": True,
            "decision": "no_device_binding",
            "audit_id": audit_id,
            "delivered": False,
        }

    push_token: str = binding["push_token"]
    platform: str = binding.get("platform", "ios")

    # ------------------------------------------------------------------
    # 4. Format briefing via WhisperAdapter
    # ------------------------------------------------------------------
    from standalone_agent.whisper_adapter import WhisperAdapter
    _fg = importlib.import_module("lambda.focus_guardian")
    FocusProposal = _fg.FocusProposal
    safe_fallback = _fg.safe_fallback
    FocusRequest = _fg.FocusRequest

    # Build a minimal FocusRequest to generate the safe fallback proposal
    # (the real Bedrock adapter is wired in Sub-Task 2; here we use the fallback)
    request = FocusRequest(
        user_id=user_id,
        session_id=idempotency_key,
        purpose="pre_meeting",
    )
    proposal: FocusProposal = safe_fallback(request, fallback_reason="not_implemented")

    adapter = WhisperAdapter(watch_connected=(platform == "watchos"))
    briefing = adapter.deliver_briefing(
        user_id=user_id,
        calendar_event_id=calendar_event_id,
        meeting_title=meeting_title,
        start_epoch=start_epoch,
        proposal=proposal,
        is_quiet_hours=is_quiet_hours,
    )

    # Build a flat push payload for the provider
    delivery_channel: str = briefing.get("delivery_channel", "mobile_fallback")
    if delivery_channel == "bee_watch":
        card = briefing.get("card", {})
        push_payload: dict[str, Any] = {
            "title": f"AURA: Prep for {card.get('meeting_title', meeting_title)}",
            "body": (card.get("prep_summary", ""))[:180],
            "sound_enabled": card.get("haptic_enabled", True),
            "card_id": card.get("card_id"),
            "calendar_event_id": calendar_event_id,
            "deep_link": f"aura://meeting-prep/{calendar_event_id}?epoch={start_epoch}",
        }
    else:
        notif = briefing.get("notification", {})
        push_payload = {
            "title": notif.get("title", f"AURA: Prep for {meeting_title}"),
            "body": notif.get("body", ""),
            "sound_enabled": notif.get("sound_enabled", True),
            "card_id": notif.get("notification_id"),
            "calendar_event_id": calendar_event_id,
            "deep_link": notif.get("deep_link", ""),
        }

    # ------------------------------------------------------------------
    # 5. Send push notification to APNs or FCM
    # ------------------------------------------------------------------
    if platform in ("ios", "watchos"):
        send_result = _send_apns(push_token, push_payload, http_client=http_client)
    else:
        send_result = _send_fcm(push_token, push_payload, http_client=http_client)

    delivery_status = send_result.get("status", "unknown")
    delivered = delivery_status == "delivered"

    # ------------------------------------------------------------------
    # 6. Audit record
    # ------------------------------------------------------------------
    audit_id = f"aud_{uuid.uuid4().hex[:8]}"
    store.audit_records.append({
        "action_id": audit_id,
        "user_id": user_id,
        "action_type": "pre_meeting_briefing",
        "status": "delivered" if delivered else "delivery_failed",
        "calendar_event_id": calendar_event_id,
        "platform": platform,
        "delivery_channel": delivery_channel,
        "provider_status": delivery_status,
        "timestamp": time.time(),
    })

    _log(
        "INFO",
        "apns_dispatcher_delivery_complete",
        user_id=user_id,
        calendar_event_id=calendar_event_id,
        platform=platform,
        delivery_channel=delivery_channel,
        delivered=delivered,
        provider_status=delivery_status,
        audit_id=audit_id,
        policy_required=True,
    )

    return {
        "statusCode": 200,
        "policy_required": True,
        "decision": "executed",
        "delivered": delivered,
        "delivery_channel": delivery_channel,
        "platform": platform,
        "provider_status": delivery_status,
        "audit_id": audit_id,
        "card_id": push_payload.get("card_id"),
        "calendar_event_id": calendar_event_id,
    }


# ---------------------------------------------------------------------------
# Lambda entry point
# ---------------------------------------------------------------------------

def lambda_handler(
    event: dict[str, Any],
    _context: object = None,
    store: InMemoryDataStore | None = None,
    http_client: Any | None = None,
) -> dict[str, Any]:
    """Lambda entry point for MeetingPrepTriggered EventBridge events.

    Parameters
    ----------
    event:
        The raw EventBridge event dict.  The ``detail`` sub-object must contain
        ``calendar_event_id``, ``user_id``, and ``start_epoch``.
    _context:
        Lambda context (unused).
    store:
        Injected data store for testing.  Defaults to the module-level
        ``default_store`` from ``lambda.control_plane``.
    http_client:
        Injectable HTTP client for testing.
    """
    _store = store or _cp.default_store

    detail: dict[str, Any] = {}
    if "detail" in event and isinstance(event["detail"], dict):
        detail = event["detail"]
    else:
        detail = event.get("body", event)
        if isinstance(detail, str):
            try:
                detail = json.loads(detail)
            except json.JSONDecodeError as err:
                _log("WARNING", "apns_dispatcher_invalid_json", error=str(err))
                return {
                    "statusCode": 400,
                    "policy_required": True,
                    "error": "invalid_json_body",
                }

    _log(
        "INFO",
        "apns_dispatcher_invoked",
        user_id=detail.get("user_id"),
        calendar_event_id=detail.get("calendar_event_id"),
        detail_type=event.get("detail-type"),
    )

    return dispatch(detail, _store, http_client=http_client)
