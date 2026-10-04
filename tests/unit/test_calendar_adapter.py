"""Unit tests for Lambda Calendar Adapter handler."""
import importlib
import json
from unittest.mock import MagicMock, patch
import pytest

ca = importlib.import_module("lambda.calendar_adapter")
lambda_handler = ca.lambda_handler
emit_eventbridge_prep_event = ca.emit_eventbridge_prep_event


@pytest.fixture
def base_calendar_body():
    return {
        "calendar_event_id": "cal_test_001",
        "user_id": "usr_aditi_01",
        "title": "AWS Mentoring Session",
        "start_epoch": 1791208800,
        "end_epoch": 1791212400,
        "participants": ["Mentor Dave", "Aditi Shinde"],
        "is_opted_in": True,
        "status": "confirmed",
    }


def test_lambda_handler_calendar_adapter_success(base_calendar_body):
    event = {
        "body": json.dumps(base_calendar_body),
        "headers": {"x-calendar-source": "aura"},
    }
    with patch.object(ca, "emit_eventbridge_prep_event", return_value={"FailedEntryCount": 0}):
        resp = lambda_handler(event)
        assert resp["statusCode"] == 200
        data = json.loads(resp["body"])
        assert data["message"] == "Calendar event processed"
        assert data["result"]["calendar_event_id"] == "cal_test_001"


def test_lambda_handler_calendar_adapter_invalid_json():
    event = {
        "body": "not-valid-json{{{",
        "headers": {},
    }
    resp = lambda_handler(event)
    assert resp["statusCode"] == 400
    data = json.loads(resp["body"])
    assert data["error"] == "invalid_calendar_event"


def test_lambda_handler_calendar_adapter_missing_fields():
    event = {
        "body": json.dumps({"title": "Incomplete Meeting"}),
        "headers": {},
    }
    resp = lambda_handler(event)
    assert resp["statusCode"] == 400


def test_emit_eventbridge_prep_event():
    mock_client = MagicMock()
    mock_client.put_events.return_value = {"FailedEntryCount": 0, "Entries": [{"EventId": "evt_123"}]}

    with patch.object(ca, "get_eventbridge_client", return_value=mock_client):
        sample_event = {
            "source": "aura.scheduler",
            "detail-type": "MeetingPrepTriggered",
            "detail": {
                "calendar_event_id": "cal_test_001",
                "user_id": "usr_aditi_01",
                "start_epoch": 1791208800,
                "idempotency_key": "usr_aditi_01:cal_test_001:1791208800",
            },
        }
        res = emit_eventbridge_prep_event(sample_event, event_bus_name="aura-event-bus")
        assert res["FailedEntryCount"] == 0
        mock_client.put_events.assert_called_once()
