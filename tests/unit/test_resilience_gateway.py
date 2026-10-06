"""Comprehensive unit tests for lambda/resilience_gateway.py.

Import pattern follows project convention:
    importlib.import_module("lambda.resilience_gateway")
because ``lambda`` is a Python keyword.
"""
from __future__ import annotations

import importlib
import json
import sys
from typing import Any
from unittest.mock import patch

import pytest

rg = importlib.import_module("lambda.resilience_gateway")

MultiProviderModelGateway = rg.MultiProviderModelGateway
ProviderConfig = rg.ProviderConfig
InvocationResult = rg.InvocationResult
ProviderError = rg.ProviderError
ProviderThrottleError = rg.ProviderThrottleError
ProviderTimeoutError = rg.ProviderTimeoutError
ProviderServerError = rg.ProviderServerError
AllProvidersUnavailableError = rg.AllProvidersUnavailableError
make_gateway = rg.make_gateway


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GOOD_PAYLOAD: dict[str, Any] = {
    "prep_summary": "Test summary",
    "3_questions": ["Q1?", "Q2?", "Q3?"],
    "emotion_tone": "calm",
}


def _ok_invoke(prompt: str, model_id: str) -> dict[str, Any]:
    """Always succeeds."""
    return dict(_GOOD_PAYLOAD)


def _throttle_invoke(prompt: str, model_id: str) -> dict[str, Any]:
    raise ProviderThrottleError("ThrottlingException", status_code=429)


def _timeout_invoke(prompt: str, model_id: str) -> dict[str, Any]:
    raise ProviderTimeoutError("ReadTimeoutError", status_code=None)


def _server_error_invoke(prompt: str, model_id: str) -> dict[str, Any]:
    raise ProviderServerError("InternalServerError", status_code=500)


def _not_impl_invoke(prompt: str, model_id: str) -> dict[str, Any]:
    raise NotImplementedError("Adapter not configured")


# ---------------------------------------------------------------------------
# Error class tests
# ---------------------------------------------------------------------------

class TestProviderErrors:
    def test_throttle_error_is_provider_error(self):
        err = ProviderThrottleError("msg", status_code=429)
        assert isinstance(err, ProviderError)
        assert err.status_code == 429

    def test_timeout_error_is_provider_error(self):
        err = ProviderTimeoutError("timeout")
        assert isinstance(err, ProviderError)
        assert err.status_code is None

    def test_server_error_is_provider_error(self):
        err = ProviderServerError("5xx", status_code=503)
        assert isinstance(err, ProviderError)
        assert err.status_code == 503

    def test_all_providers_unavailable_not_provider_error(self):
        err = AllProvidersUnavailableError("both down")
        assert not isinstance(err, ProviderError)


# ---------------------------------------------------------------------------
# ProviderConfig tests
# ---------------------------------------------------------------------------

class TestProviderConfig:
    def test_invoke_delegates_to_callable(self):
        cfg = ProviderConfig(name="bedrock", _invoke=_ok_invoke)
        result = cfg.invoke("prompt", "model-id")
        assert result["prep_summary"] == "Test summary"

    def test_invoke_raises_not_implemented_when_no_callable(self):
        cfg = ProviderConfig(name="bedrock")
        with pytest.raises(NotImplementedError):
            cfg.invoke("prompt", "model-id")

    def test_default_timeout_and_retries(self):
        cfg = ProviderConfig(name="watsonx")
        assert cfg.timeout_seconds == 10.0
        assert cfg.max_retries == 0


# ---------------------------------------------------------------------------
# Happy-path: primary succeeds
# ---------------------------------------------------------------------------

class TestPrimarySucceeds:
    def test_returns_invocation_result(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert isinstance(result, InvocationResult)

    def test_provider_is_primary(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_throttle_invoke),
        )
        result = gw.invoke("prompt")
        assert result.provider == "bedrock"

    def test_failover_not_triggered(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.failover_triggered is False

    def test_payload_matches_provider_output(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.payload["prep_summary"] == "Test summary"

    def test_correlation_id_returned(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt", correlation_id="cid-abc-123")
        assert result.correlation_id == "cid-abc-123"

    def test_auto_generated_correlation_id_when_none_provided(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        # Should be a non-empty string (UUID4)
        assert isinstance(result.correlation_id, str) and len(result.correlation_id) > 0

    def test_latency_ms_positive(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.latency_ms >= 0.0


# ---------------------------------------------------------------------------
# Failover tests — each trigger condition
# ---------------------------------------------------------------------------

class TestFailoverOnThrottle:
    def _make_gw(self) -> MultiProviderModelGateway:
        return MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )

    def test_failover_triggered_flag(self):
        result = self._make_gw().invoke("prompt")
        assert result.failover_triggered is True

    def test_provider_is_secondary(self):
        result = self._make_gw().invoke("prompt")
        assert result.provider == "watsonx"

    def test_payload_from_secondary(self):
        result = self._make_gw().invoke("prompt")
        assert result.payload["prep_summary"] == "Test summary"


class TestFailoverOnTimeout:
    def test_failover_triggers_on_timeout(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_timeout_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.failover_triggered is True
        assert result.provider == "watsonx"


class TestFailoverOnServerError:
    def test_failover_triggers_on_5xx(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_server_error_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.failover_triggered is True
        assert result.provider == "watsonx"


class TestFailoverOnNotImplemented:
    def test_failover_triggers_when_adapter_not_configured(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_not_impl_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.failover_triggered is True
        assert result.provider == "watsonx"


# ---------------------------------------------------------------------------
# Both providers fail
# ---------------------------------------------------------------------------

class TestBothProvidersFail:
    def test_raises_all_providers_unavailable(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_server_error_invoke),
        )
        with pytest.raises(AllProvidersUnavailableError):
            gw.invoke("prompt")

    def test_error_message_contains_both_errors(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_server_error_invoke),
        )
        with pytest.raises(AllProvidersUnavailableError, match="Primary"):
            gw.invoke("prompt")

    def test_not_implemented_primary_and_secondary_raises(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_not_impl_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_not_impl_invoke),
        )
        with pytest.raises(AllProvidersUnavailableError):
            gw.invoke("prompt")

    def test_timeout_both_raises(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_timeout_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_timeout_invoke),
        )
        with pytest.raises(AllProvidersUnavailableError):
            gw.invoke("prompt")


# ---------------------------------------------------------------------------
# Retry logic within a single provider
# ---------------------------------------------------------------------------

class TestRetryLogic:
    def test_retry_exhaustion_triggers_failover(self):
        """Primary retries once before failing over to secondary."""
        call_count: list[int] = [0]

        def _always_throttle(prompt: str, model_id: str) -> dict[str, Any]:
            call_count[0] += 1
            raise ProviderThrottleError("throttled")

        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_always_throttle, max_retries=2),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        # 1 initial attempt + 2 retries = 3 calls to primary
        assert call_count[0] == 3
        assert result.provider == "watsonx"
        assert result.failover_triggered is True

    def test_succeeds_on_second_attempt_without_failover(self):
        """Primary fails once then succeeds — no failover."""
        attempts: list[int] = [0]

        def _flaky(prompt: str, model_id: str) -> dict[str, Any]:
            attempts[0] += 1
            if attempts[0] == 1:
                raise ProviderThrottleError("first call throttled")
            return dict(_GOOD_PAYLOAD)

        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_flaky, max_retries=1),
            secondary=ProviderConfig(name="watsonx", _invoke=_throttle_invoke),
        )
        result = gw.invoke("prompt")
        assert result.provider == "bedrock"
        assert result.failover_triggered is False
        assert attempts[0] == 2

    def test_zero_retries_fails_immediately(self):
        """max_retries=0 means one attempt then failover."""
        call_count: list[int] = [0]

        def _counted_throttle(prompt: str, model_id: str) -> dict[str, Any]:
            call_count[0] += 1
            raise ProviderThrottleError("throttled")

        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_counted_throttle, max_retries=0),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        gw.invoke("prompt")
        assert call_count[0] == 1


# ---------------------------------------------------------------------------
# Structured logging tests
# ---------------------------------------------------------------------------

class TestStructuredLogging:
    def _capture_logs(self, monkeypatch: pytest.MonkeyPatch, gw: MultiProviderModelGateway, prompt: str = "p") -> list[dict[str, Any]]:
        log_lines: list[dict[str, Any]] = []

        def _mock_print(*args: Any, **kwargs: Any) -> None:
            for arg in args:
                if isinstance(arg, str):
                    try:
                        log_lines.append(json.loads(arg))
                    except json.JSONDecodeError:
                        pass

        monkeypatch.setattr("builtins.print", _mock_print)
        try:
            gw.invoke(prompt, correlation_id="log-test-cid")
        except AllProvidersUnavailableError:
            pass
        return log_lines

    def test_success_emits_invocation_complete(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        events = [l["event"] for l in logs]
        assert "resilience_gateway_invocation_complete" in events

    def test_success_log_contains_required_fields(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        complete_log = next(
            (l for l in logs if l.get("event") == "resilience_gateway_invocation_complete"),
            None,
        )
        assert complete_log is not None
        assert "correlation_id" in complete_log
        assert "provider_used" in complete_log
        assert "latency_ms" in complete_log
        assert "failover_triggered" in complete_log

    def test_failover_emits_primary_failed_warning(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        events = [l["event"] for l in logs]
        assert "resilience_gateway_primary_failed" in events

    def test_all_fail_emits_error_log(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_server_error_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        events = [l["event"] for l in logs]
        assert "resilience_gateway_all_providers_failed" in events

    def test_log_service_field_is_aura_resilience_gateway(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        for log in logs:
            assert log.get("service") == "aura.resilience_gateway"

    def test_failover_log_contains_correlation_id(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        primary_failed = next(
            (l for l in logs if l.get("event") == "resilience_gateway_primary_failed"),
            None,
        )
        assert primary_failed is not None
        assert primary_failed["correlation_id"] == "log-test-cid"

    def test_failover_triggered_false_in_log_on_primary_success(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        complete = next(
            (l for l in logs if l.get("event") == "resilience_gateway_invocation_complete"),
            None,
        )
        assert complete is not None
        assert complete["failover_triggered"] is False

    def test_failover_triggered_true_in_log_on_secondary_used(self, monkeypatch: pytest.MonkeyPatch):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_throttle_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        logs = self._capture_logs(monkeypatch, gw)
        complete = next(
            (l for l in logs if l.get("event") == "resilience_gateway_invocation_complete"),
            None,
        )
        assert complete is not None
        assert complete["failover_triggered"] is True


# ---------------------------------------------------------------------------
# make_gateway factory tests
# ---------------------------------------------------------------------------

class TestMakeGateway:
    def test_returns_gateway_instance(self):
        gw = make_gateway()
        assert isinstance(gw, MultiProviderModelGateway)

    def test_custom_bedrock_invoke_wired(self):
        gw = make_gateway(bedrock_invoke=_ok_invoke)
        result = gw.invoke("prompt")
        assert result.provider == "bedrock"
        assert result.failover_triggered is False

    def test_custom_watsonx_invoke_used_on_failover(self):
        gw = make_gateway(bedrock_invoke=_throttle_invoke, watsonx_invoke=_ok_invoke)
        result = gw.invoke("prompt")
        assert result.provider == "watsonx"
        assert result.failover_triggered is True

    def test_primary_retries_respected(self):
        call_count: list[int] = [0]

        def _cnt(prompt: str, model_id: str) -> dict[str, Any]:
            call_count[0] += 1
            raise ProviderThrottleError("t")

        gw = make_gateway(bedrock_invoke=_cnt, watsonx_invoke=_ok_invoke, primary_retries=2)
        gw.invoke("prompt")
        assert call_count[0] == 3  # 1 initial + 2 retries

    def test_both_stubs_raise_all_unavailable(self):
        gw = make_gateway()
        with pytest.raises(AllProvidersUnavailableError):
            gw.invoke("prompt")

    def test_default_model_ids_set(self):
        gw = make_gateway()
        assert gw.bedrock_model_id == MultiProviderModelGateway.DEFAULT_BEDROCK_MODEL
        assert gw.watsonx_model_id == MultiProviderModelGateway.DEFAULT_WATSONX_MODEL


# ---------------------------------------------------------------------------
# InvocationResult field checks
# ---------------------------------------------------------------------------

class TestInvocationResult:
    def test_all_fields_present(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_ok_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt", correlation_id="xyz")
        assert result.provider == "bedrock"
        assert result.correlation_id == "xyz"
        assert result.latency_ms >= 0
        assert result.failover_triggered is False
        assert isinstance(result.payload, dict)

    def test_secondary_result_has_correct_provider_name(self):
        gw = MultiProviderModelGateway(
            primary=ProviderConfig(name="bedrock", _invoke=_server_error_invoke),
            secondary=ProviderConfig(name="watsonx", _invoke=_ok_invoke),
        )
        result = gw.invoke("prompt")
        assert result.provider == "watsonx"
