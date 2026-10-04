import importlib
import json
from unittest.mock import MagicMock
import pytest

_ws = importlib.import_module("lambda.websocket_handler")
handle_connect = _ws.handle_connect
handle_disconnect = _ws.handle_disconnect
handle_relay = _ws.handle_relay
lambda_handler = _ws.lambda_handler
validate_connect_token = _ws.validate_connect_token


def test_validate_connect_token() -> None:
    # Short token fails
    valid, _ = validate_connect_token("short")
    assert not valid

    # Empty token fails
    valid, _ = validate_connect_token("")
    assert not valid

    # Valid token succeeds
    valid, claims = validate_connect_token("Bearer 1234567890abcdef12345678")
    assert valid
    assert claims["user_id"] == "usr_12345678"


def test_handle_connect_success() -> None:
    mock_table = MagicMock()
    event = {
        "requestContext": {"connectionId": "conn_12345"},
        "queryStringParameters": {
            "auth_token": "valid_token_32_characters_long_ok",
            "user_id": "usr_aditi_01",
        },
    }
    resp = handle_connect(event, table=mock_table)
    assert resp["statusCode"] == 200
    mock_table.put_item.assert_called_once()
    item = mock_table.put_item.call_args[1]["Item"]
    assert item["connectionId"] == "conn_12345"
    assert item["userId"] == "usr_aditi_01"


def test_handle_connect_unauthorized() -> None:
    mock_table = MagicMock()
    event = {
        "requestContext": {"connectionId": "conn_12345"},
        "queryStringParameters": {"auth_token": "bad"},
    }
    resp = handle_connect(event, table=mock_table)
    assert resp["statusCode"] == 403
    mock_table.put_item.assert_not_called()


def test_handle_disconnect() -> None:
    mock_table = MagicMock()
    event = {"requestContext": {"connectionId": "conn_12345"}}
    resp = handle_disconnect(event, table=mock_table)
    assert resp["statusCode"] == 200
    mock_table.delete_item.assert_called_once_with(Key={"connectionId": "conn_12345"})


def test_handle_relay_success_returns_ack() -> None:
    mock_bus = MagicMock()
    body = {
        "action": "relay",
        "event_id": "evt_001",
        "event_type": "focus_signal",
        "user_id": "usr_aditi_01",
        "timestamp": 1791100000.0,
        "evidence": [{"id": "evt_001", "snippet": "AWS session"}],
        "signal_payload": {"explicit_signal": "self_report_distracted"},
    }
    resp = handle_relay(body, bus_client=mock_bus, bus_name="aura-event-bus")
    assert resp["statusCode"] == 200
    ack = resp["body"]
    assert ack["status"] == "accepted"
    assert ack["event_id"] == "evt_001"
    assert "ack_id" in ack
    mock_bus.put_events.assert_called_once()


def test_handle_relay_rejects_prohibited_raw_audio() -> None:
    mock_bus = MagicMock()
    body = {
        "action": "relay",
        "event_id": "evt_bad_01",
        "event_type": "focus_signal",
        "user_id": "usr_aditi_01",
        "raw_audio": "base64_audio_data_should_never_be_here",
    }
    resp = handle_relay(body, bus_client=mock_bus)
    assert resp["statusCode"] == 400
    assert resp["body"]["error"] == "privacy_violation"
    mock_bus.put_events.assert_not_called()


def test_lambda_handler_websocket_route() -> None:
    mock_table = MagicMock()
    event = {
        "requestContext": {"routeKey": "$connect", "connectionId": "c_99"},
        "headers": {"Authorization": "Bearer 1234567890abcdef12345678"},
    }
    res = lambda_handler(event, table_override=mock_table)
    assert res["statusCode"] == 200


def test_validate_connect_token_expired() -> None:
    valid, _ = validate_connect_token("Bearer expired_token_value_32chars_long")
    assert valid is False


def test_handle_relay_rejects_oversized_payload() -> None:
    mock_bus = MagicMock()
    body = {
        "action": "relay",
        "event_id": "evt_huge_01",
        "event_type": "focus_signal",
        "user_id": "usr_aditi_01",
        "bloat": "x" * 40000,  # 40KB > 32KB
    }
    resp = handle_relay(body, bus_client=mock_bus)
    assert resp["statusCode"] == 400
    assert resp["body"]["error"] == "oversized_payload"
    mock_bus.put_events.assert_not_called()
