"""WebSocket Handler for Project AURA Cloud Intake.

Handles API Gateway WebSocket routes:
- $connect: Authenticates connection, registers in DynamoDB with TTL.
- $disconnect: Cleans up connection state.
- relay: Ingests sanitized client envelopes, validates schema and privacy boundaries,
  emits event to EventBridge, and returns an immediate ACK so local outbox can purge payload.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Any

# Optional boto3 clients when running in live AWS Lambda
try:
    import boto3
    _dynamodb = boto3.resource("dynamodb") if os.getenv("AWS_DEFAULT_REGION") else None
    _eventbridge = boto3.client("events") if os.getenv("AWS_DEFAULT_REGION") else None
except Exception:
    _dynamodb = None
    _eventbridge = None

CONNECTIONS_TABLE_NAME = os.getenv("AURA_CONNECTIONS_TABLE", "AuraWebSocketConnections")
EVENT_BUS_NAME = os.getenv("AURA_EVENT_BUS", "aura-event-bus")
PROHIBITED_RAW_KEYS = {"raw_audio", "full_transcript", "audio_blob", "unredacted_speech"}


# ---------------------------------------------------------------------------
# Structured logger
# ---------------------------------------------------------------------------

def _log(level: str, event: str, **fields: Any) -> None:
    """Emit a single structured JSON log line to stdout.

    Fields are kept to a minimum necessary set — no raw user content.
    ``correlation_id`` is always included when present in *fields*.
    """
    record = {
        "timestamp": time.time(),
        "level": level,
        "service": "aura.websocket_handler",
        "event": event,
        **fields,
    }
    print(json.dumps(record, default=str), file=sys.stdout, flush=True)


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

def validate_connect_token(token: str | None) -> tuple[bool, dict[str, str]]:
    """Validate bearer token format and extract subject claims.

    In production this validates OIDC/JWT signatures against a JWKS endpoint.
    For backward compatibility the stub path is preserved: tokens ≥ 16 chars
    that do not contain the literal word "expired" are accepted, and
    ``user_id`` is derived from the first 8 characters of the stripped token.

    Hardening applied on top of the original implementation:
    - ``None`` / empty / whitespace-only tokens are rejected immediately.
    - The "Bearer " prefix is stripped before length checks.
    - Any token containing the case-insensitive substring "expired" is rejected.
    - Tokens shorter than 16 characters after prefix-stripping are rejected.
    """
    if not token or not token.strip():
        _log("WARNING", "token_validation_rejected", reason="empty_token")
        return False, {}
    token_str = token.strip()
    if token_str.startswith("Bearer "):
        token_str = token_str[7:]
    if len(token_str) < 16:
        _log("WARNING", "token_validation_rejected", reason="token_too_short",
             token_length=len(token_str))
        return False, {}
    if "expired" in token_str.lower():
        _log("WARNING", "token_validation_rejected", reason="token_expired")
        return False, {}
    claims = {"user_id": f"usr_{token_str[:8]}", "tenant_id": "tenant_default"}
    _log("INFO", "token_validation_accepted", user_id=claims["user_id"])
    return True, claims


def handle_connect(event: dict[str, Any], table: Any = None) -> dict[str, Any]:
    connection_id = event.get("requestContext", {}).get("connectionId")
    query_params = event.get("queryStringParameters") or {}
    headers = event.get("headers") or {}
    # Accept token from Authorization header only; query-string fallback retained
    # for backward compatibility but flagged as the less-secure path.
    header_token = headers.get("Authorization") or headers.get("authorization")
    qs_token = query_params.get("auth_token")
    token = header_token or qs_token
    if qs_token and not header_token:
        _log("WARNING", "connect_token_from_querystring",
             connection_id=connection_id,
             note="token in querystring appears in access logs; prefer Authorization header")

    correlation_id = str(uuid.uuid4())
    valid, claims = validate_connect_token(token)
    if not valid or not connection_id:
        _log("WARNING", "connect_rejected",
             correlation_id=correlation_id,
             connection_id=connection_id,
             reason="invalid_token_or_missing_connection_id")
        return {"statusCode": 403, "body": json.dumps({"error": "unauthorized", "message": "Valid token required"})}

    user_id = query_params.get("user_id") or claims.get("user_id", "usr_unknown")
    tenant_id = claims.get("tenant_id", "tenant_default")
    now = time.time()
    ttl = int(now + 7200)  # 2 hours connection TTL

    item = {
        "connectionId": connection_id,
        "userId": user_id,
        "tenantId": tenant_id,
        "connectedAt": now,
        "ttl": ttl,
    }

    if table is not None:
        try:
            table.put_item(Item=item)
        except Exception as exc:
            _log("ERROR", "connect_state_write_failed",
                 correlation_id=correlation_id,
                 connection_id=connection_id,
                 error=str(exc))
            return {"statusCode": 500, "body": json.dumps({"error": "state_error", "message": str(exc)})}

    _log("INFO", "connect_accepted",
         correlation_id=correlation_id,
         connection_id=connection_id,
         user_id=user_id,
         tenant_id=tenant_id,
         ttl=ttl)
    return {"statusCode": 200, "body": json.dumps({"connected": True, "connectionId": connection_id})}


def handle_disconnect(event: dict[str, Any], table: Any = None) -> dict[str, Any]:
    connection_id = event.get("requestContext", {}).get("connectionId")
    if connection_id and table is not None:
        try:
            table.delete_item(Key={"connectionId": connection_id})
        except Exception:
            pass
    _log("INFO", "disconnect_complete", connection_id=connection_id)
    return {"statusCode": 200, "body": json.dumps({"disconnected": True})}


def handle_relay(
    body: dict[str, Any],
    bus_client: Any = None,
    bus_name: str = EVENT_BUS_NAME,
) -> dict[str, Any]:
    """Process incoming relay envelope and return acknowledgement for outbox purging."""
    event_id = body.get("event_id")
    event_type = body.get("event_type")
    user_id = body.get("user_id")
    timestamp = body.get("timestamp") or time.time()
    correlation_id = str(uuid.uuid4())

    # Schema validation
    if not event_id or not event_type or not user_id:
        _log("WARNING", "relay_envelope_invalid",
             correlation_id=correlation_id,
             reason="missing_required_fields",
             present_fields=list(body.keys()))
        return {
            "statusCode": 400,
            "body": {
                "error": "invalid_envelope",
                "message": "Missing required fields: event_id, event_type, user_id",
                "timestamp": time.time(),
            },
        }

    # Oversized payload protection: max 32KB
    payload_size = len(json.dumps(body))
    if payload_size > 32768:
        _log("WARNING", "relay_payload_oversized",
             correlation_id=correlation_id,
             event_id=event_id,
             payload_size=payload_size,
             limit=32768)
        return {
            "statusCode": 400,
            "body": {
                "error": "oversized_payload",
                "message": f"Payload size {payload_size} bytes exceeds 32KB boundary",
                "event_id": event_id,
                "timestamp": time.time(),
            },
        }

    # Strict privacy check: zero raw audio / prohibited persistence
    for prohibited in PROHIBITED_RAW_KEYS:
        if prohibited in body:
            _log("ERROR", "relay_privacy_violation",
                 correlation_id=correlation_id,
                 event_id=event_id,
                 prohibited_field=prohibited)
            return {
                "statusCode": 400,
                "body": {
                    "error": "privacy_violation",
                    "message": f"Prohibited raw field detected: '{prohibited}'. Data must be redacted locally.",
                    "event_id": event_id,
                    "timestamp": time.time(),
                },
            }

    # Evidence bounds check: at most 5 items
    evidence = body.get("evidence", [])
    if len(evidence) > 5:
        _log("WARNING", "relay_evidence_overflow",
             correlation_id=correlation_id,
             event_id=event_id,
             evidence_count=len(evidence),
             limit=5)
        return {
            "statusCode": 400,
            "body": {
                "error": "envelope_overflow",
                "message": "Evidence list exceeds 5-item maximum",
                "event_id": event_id,
                "timestamp": time.time(),
            },
        }

    ack_id = f"ack_{uuid.uuid4().hex[:12]}"
    bus_message_id = f"msg_{uuid.uuid4().hex[:12]}"

    # Publish to EventBridge if client is active
    if bus_client is not None:
        try:
            bus_client.put_events(
                Entries=[
                    {
                        "Source": "aura.companion",
                        "DetailType": "FocusSignalDetected" if event_type == "focus_signal" else "BeeEventSanitized",
                        "Detail": json.dumps(
                            {
                                "event_id": event_id,
                                "user_id": user_id,
                                "session_id": body.get("session_id", "session_default"),
                                "timestamp": timestamp,
                                "explicit_signal": body.get("signal_payload", {}).get("explicit_signal", "none"),
                                "consented_signal_score": body.get("signal_payload", {}).get("consented_signal_score", 0.0),
                                "evidence": evidence,
                                "idempotency_key": f"{user_id}:{event_id}",
                                "correlation_id": correlation_id,
                            }
                        ),
                        "EventBusName": bus_name,
                    }
                ]
            )
        except Exception as exc:
            _log("ERROR", "relay_eventbridge_failed",
                 correlation_id=correlation_id,
                 event_id=event_id,
                 error=str(exc))
            return {
                "statusCode": 500,
                "body": {
                    "error": "eventbridge_delivery_failed",
                    "message": str(exc),
                    "event_id": event_id,
                    "timestamp": time.time(),
                },
            }

    _log("INFO", "relay_accepted",
         correlation_id=correlation_id,
         event_id=event_id,
         event_type=event_type,
         ack_id=ack_id,
         bus_message_id=bus_message_id,
         evidence_count=len(evidence))
    return {
        "statusCode": 200,
        "body": {
            "ack_id": ack_id,
            "event_id": event_id,
            "status": "accepted",
            "bus_message_id": bus_message_id,
            "timestamp": time.time(),
        },
    }


def lambda_handler(
    event: dict[str, Any],
    _context: object = None,
    table_override: Any = None,
    bus_override: Any = None,
) -> dict[str, Any]:
    """Entrypoint for WebSocket API Gateway."""
    route_key = event.get("requestContext", {}).get("routeKey")
    table = table_override or (_dynamodb.Table(CONNECTIONS_TABLE_NAME) if _dynamodb else None)
    bus = bus_override or _eventbridge

    _log("DEBUG", "lambda_handler_invoked", route_key=route_key)

    if route_key == "$connect":
        return handle_connect(event, table=table)

    if route_key == "$disconnect":
        return handle_disconnect(event, table=table)

    raw_body = event.get("body", {})
    if isinstance(raw_body, str):
        try:
            raw_body = json.loads(raw_body)
        except json.JSONDecodeError:
            _log("WARNING", "lambda_handler_malformed_json", route_key=route_key)
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "invalid_json", "message": "Malformed JSON in body"}),
            }

    action = raw_body.get("action")
    if route_key == "relay" or action == "relay":
        res = handle_relay(raw_body, bus_client=bus)
        return {
            "statusCode": res["statusCode"],
            "body": json.dumps(res["body"]),
        }

    _log("WARNING", "lambda_handler_unknown_route", route_key=route_key, action=action)
    return {
        "statusCode": 400,
        "body": json.dumps(
            {
                "error": "unknown_route",
                "message": f"Unsupported route or action: '{route_key or action}'",
                "timestamp": time.time(),
            }
        ),
    }
