# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Non-obvious architectural constraints

**Single execution gate** — `standalone_agent/policy_engine.py` is the only component authorised to execute adapter actions. Lambda handlers, the model, and the control plane all return proposals; none of them execute. This is enforced by contract tests (`body["policy_required"] is True`). Any architecture that bypasses this gate violates the privacy and consent model.

**`lambda/` imports `standalone_agent/` at runtime** — `lambda/control_plane.py` imports `DeviceSimulatorAdapter`, `FeatureFlagManager`, `UndoRateGuardrail`, and `SlackAdapter` from `standalone_agent/`. The Lambda deployment package must include both directories. This coupling is intentional: the control plane orchestrates the same domain objects used by the local companion.

**Evidence is privacy-bounded at two layers:**
1. The relay handler rejects payloads containing `raw_audio`, `full_transcript`, `audio_blob`, `unredacted_speech` (checked at ingress).
2. The focus guardian rejects model proposals citing `evidence_ids` not present in the original request (checked post-parse). Both checks are independently covered by contract tests.

**`invoke_model()` raises `NotImplementedError` by design** — `focus_guardian.lambda_handler` catches this and routes to `safe_fallback`. The model adapter is injected via the `invoker=` parameter. This means the Lambda is safe to deploy without a Bedrock connection and will degrade gracefully.

**Three separate dependency sets** — `lambda/`, `standalone_agent/`, `mcp_server/` each have their own `requirements.txt`. There is no monorepo build tool. A change adding a new package must identify which requirements file to update.

**`InMemoryDataStore` is not just a test double** — it is the production offline/simulation mode used by the local companion. Do not replace it with a mock; pass it as `store=` to handler functions in tests exactly as production code would.

**JSON Schema contracts are in `schemas/`** — any new event shape must have a corresponding JSON Schema file in the appropriate subdirectory and a contract test in `tests/contract/`. The schema path convention is `Path(__file__).resolve().parent.parent.parent / "schemas" / <subdir>`.

**Audit trail is append-only** — `AuditRecord` in `policy_engine.py` has status values `"executed"`, `"undone"`, `"denied"`, `"skipped"`. Undo creates a new record; it does not mutate the original. Any plan that modifies existing audit records violates the immutability design.
