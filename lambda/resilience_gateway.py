"""Enterprise Multi-Provider Resilience Layer for Project AURA.

Provides a MultiProviderModelGateway that invokes a primary provider (AWS Bedrock)
and automatically fails over to a secondary provider (IBM Granite / watsonx) when
the primary returns a timeout, throttling (429), or 5xx error.

Structured log fields per invocation:
  correlation_id, provider_used, latency_ms, failover_triggered
"""
from __future__ import annotations

import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

# ---------------------------------------------------------------------------
# Structured logger (mirrors the pattern from focus_guardian.py)
# ---------------------------------------------------------------------------

def _log(level: str, event: str, **fields: Any) -> None:
    """Emit a single structured JSON log line to stdout.

    No raw prompt bodies, auth tokens, or PII are ever included in log fields.
    """
    record: dict[str, Any] = {
        "timestamp": time.time(),
        "level": level,
        "service": "aura.resilience_gateway",
        "event": event,
        **fields,
    }
    print(json.dumps(record, default=str), file=sys.stdout, flush=True)


# ---------------------------------------------------------------------------
# Error taxonomy
# ---------------------------------------------------------------------------

class ProviderError(Exception):
    """Base class for provider invocation failures."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class ProviderThrottleError(ProviderError):
    """Raised when the provider returns HTTP 429 (TooManyRequests)."""


class ProviderTimeoutError(ProviderError):
    """Raised when the provider call exceeds the configured deadline."""


class ProviderServerError(ProviderError):
    """Raised when the provider returns a 5xx status code."""


class AllProvidersUnavailableError(Exception):
    """Raised when every configured provider fails and no fallback is possible."""


# ---------------------------------------------------------------------------
# Provider interface / adapters
# ---------------------------------------------------------------------------

ProviderName = Literal["bedrock", "watsonx", "stub"]


@dataclass
class InvocationResult:
    """Structured response from a single model invocation attempt."""

    provider: ProviderName
    payload: dict[str, Any]
    latency_ms: float
    failover_triggered: bool
    correlation_id: str


@dataclass
class ProviderConfig:
    """Configuration for a single provider endpoint."""

    name: ProviderName
    timeout_seconds: float = 10.0
    max_retries: int = 0  # retries *within* this provider before failing over
    # Callable injected at construction time (allows easy monkeypatching in tests)
    _invoke: Callable[[str, str], dict[str, Any]] | None = field(default=None, repr=False)

    def invoke(self, prompt: str, model_id: str) -> dict[str, Any]:
        """Call the underlying provider; raise ProviderError subclasses on failure."""
        if self._invoke is not None:
            return self._invoke(prompt, model_id)
        raise NotImplementedError(
            f"No invoke callable wired for provider '{self.name}'. "
            "Supply a real adapter in production or a stub in tests."
        )


# ---------------------------------------------------------------------------
# Built-in stub adapters (used for local tests / hackathon demo)
# ---------------------------------------------------------------------------

def _bedrock_stub(prompt: str, model_id: str) -> dict[str, Any]:  # pragma: no cover
    """Placeholder that raises NotImplementedError in environments without boto3."""
    raise NotImplementedError("AWS Bedrock adapter not configured; wire a real boto3 client in production.")


def _watsonx_stub(prompt: str, model_id: str) -> dict[str, Any]:  # pragma: no cover
    """Placeholder that raises NotImplementedError in environments without ibm-watson-machine-learning."""
    raise NotImplementedError("IBM watsonx adapter not configured; wire the ibm-generative-ai SDK in production.")


# ---------------------------------------------------------------------------
# Gateway
# ---------------------------------------------------------------------------

class MultiProviderModelGateway:
    """Attempt primary model invocation (Bedrock) and fail over to IBM Granite/watsonx.

    Failover triggers on:
      - ProviderTimeoutError  (deadline exceeded)
      - ProviderThrottleError (HTTP 429)
      - ProviderServerError   (HTTP 5xx)
      - NotImplementedError   (adapter not wired — treated as unavailable)

    Every invocation emits a structured log line that includes:
      correlation_id, provider_used, latency_ms, failover_triggered
    """

    #: Default Bedrock model to use when none is specified.
    DEFAULT_BEDROCK_MODEL = "amazon.nova-pro-v1:0"
    #: Default watsonx / Granite model to use when none is specified.
    DEFAULT_WATSONX_MODEL = "ibm/granite-13b-instruct-v2"

    def __init__(
        self,
        primary: ProviderConfig | None = None,
        secondary: ProviderConfig | None = None,
        bedrock_model_id: str = DEFAULT_BEDROCK_MODEL,
        watsonx_model_id: str = DEFAULT_WATSONX_MODEL,
    ) -> None:
        self.primary: ProviderConfig = primary or ProviderConfig(
            name="bedrock", _invoke=_bedrock_stub
        )
        self.secondary: ProviderConfig = secondary or ProviderConfig(
            name="watsonx", _invoke=_watsonx_stub
        )
        self.bedrock_model_id = bedrock_model_id
        self.watsonx_model_id = watsonx_model_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def invoke(
        self,
        prompt: str,
        correlation_id: str | None = None,
    ) -> InvocationResult:
        """Invoke primary provider; fall over to secondary on transient failures.

        Parameters
        ----------
        prompt:
            The fully-formed model prompt string (JSON or plain text).
        correlation_id:
            Optional caller-supplied trace ID.  A UUID is generated if omitted.

        Returns
        -------
        InvocationResult
            Structured result with provider name, payload, latency, and failover flag.

        Raises
        ------
        AllProvidersUnavailableError
            If both primary and secondary fail.
        """
        cid = correlation_id or str(uuid.uuid4())
        failover_triggered = False

        # --- Primary attempt ---
        primary_error: Exception | None = None
        t0 = time.monotonic()
        try:
            payload = self._invoke_with_retries(self.primary, prompt, self.bedrock_model_id)
            latency_ms = (time.monotonic() - t0) * 1000
            result = InvocationResult(
                provider=self.primary.name,
                payload=payload,
                latency_ms=latency_ms,
                failover_triggered=False,
                correlation_id=cid,
            )
            self._log_invocation(result)
            return result
        except (ProviderThrottleError, ProviderTimeoutError, ProviderServerError, NotImplementedError) as exc:
            primary_error = exc
            latency_ms = (time.monotonic() - t0) * 1000
            _log(
                "WARNING",
                "resilience_gateway_primary_failed",
                correlation_id=cid,
                provider=self.primary.name,
                error_type=type(exc).__name__,
                latency_ms=round(latency_ms, 2),
            )
            failover_triggered = True

        # --- Secondary (failover) attempt ---
        t1 = time.monotonic()
        try:
            payload = self._invoke_with_retries(self.secondary, prompt, self.watsonx_model_id)
            latency_ms = (time.monotonic() - t1) * 1000
            result = InvocationResult(
                provider=self.secondary.name,
                payload=payload,
                latency_ms=latency_ms,
                failover_triggered=True,
                correlation_id=cid,
            )
            self._log_invocation(result)
            return result
        except (ProviderThrottleError, ProviderTimeoutError, ProviderServerError, NotImplementedError) as secondary_error:
            latency_ms = (time.monotonic() - t1) * 1000
            _log(
                "ERROR",
                "resilience_gateway_all_providers_failed",
                correlation_id=cid,
                primary_error=str(primary_error),
                secondary_error=str(secondary_error),
                latency_ms=round(latency_ms, 2),
            )
            raise AllProvidersUnavailableError(
                f"Both providers failed. Primary: {primary_error!s}. Secondary: {secondary_error!s}."
            ) from secondary_error

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _invoke_with_retries(
        self,
        provider: ProviderConfig,
        prompt: str,
        model_id: str,
    ) -> dict[str, Any]:
        """Run provider.invoke() up to (max_retries+1) times on retriable errors."""
        last_exc: Exception | None = None
        attempts = provider.max_retries + 1
        for attempt in range(attempts):
            try:
                return provider.invoke(prompt, model_id)
            except (ProviderThrottleError, ProviderTimeoutError, ProviderServerError) as exc:
                last_exc = exc
                if attempt < attempts - 1:
                    _log(
                        "INFO",
                        "resilience_gateway_retry",
                        provider=provider.name,
                        attempt=attempt + 1,
                        error_type=type(exc).__name__,
                    )
        # All retries exhausted — re-raise the last exception
        assert last_exc is not None
        raise last_exc

    def _log_invocation(self, result: InvocationResult) -> None:
        """Emit the canonical per-invocation structured log line."""
        _log(
            "INFO",
            "resilience_gateway_invocation_complete",
            correlation_id=result.correlation_id,
            provider_used=result.provider,
            latency_ms=round(result.latency_ms, 2),
            failover_triggered=result.failover_triggered,
        )


# ---------------------------------------------------------------------------
# Convenience factory — wires a ready-to-use gateway for the Lambda runtime
# ---------------------------------------------------------------------------

def make_gateway(
    bedrock_invoke: Callable[[str, str], dict[str, Any]] | None = None,
    watsonx_invoke: Callable[[str, str], dict[str, Any]] | None = None,
    primary_timeout: float = 8.0,
    secondary_timeout: float = 12.0,
    primary_retries: int = 1,
) -> MultiProviderModelGateway:
    """Return a configured gateway suitable for Lambda injection.

    Parameters
    ----------
    bedrock_invoke:
        Callable ``(prompt, model_id) -> dict`` wrapping the real boto3
        ``bedrock-runtime`` client.  Defaults to the stub that raises
        ``NotImplementedError``.
    watsonx_invoke:
        Callable wrapping the IBM Generative AI SDK.  Defaults to the stub.
    primary_timeout, secondary_timeout:
        Per-provider wall-clock deadline in seconds (enforced by the caller
        if using ``concurrent.futures`` or ``asyncio``; stored here for
        documentation and future integration).
    primary_retries:
        Number of additional attempts for the primary provider before
        triggering failover.
    """
    primary = ProviderConfig(
        name="bedrock",
        timeout_seconds=primary_timeout,
        max_retries=primary_retries,
        _invoke=bedrock_invoke or _bedrock_stub,
    )
    secondary = ProviderConfig(
        name="watsonx",
        timeout_seconds=secondary_timeout,
        max_retries=0,
        _invoke=watsonx_invoke or _watsonx_stub,
    )
    return MultiProviderModelGateway(primary=primary, secondary=secondary)
