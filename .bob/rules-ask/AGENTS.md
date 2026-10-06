# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Non-obvious project structure

**`lambda/` is a Python keyword** — the directory is named `lambda/` but Python modules inside it are always imported via `importlib.import_module("lambda.<module>")`. This affects every test file and any documentation about imports.

**No top-level requirements** — there is no root `requirements.txt` or `pyproject.toml`. Each sub-component has its own: `lambda/`, `standalone_agent/`, `mcp_server/`. To run the full test suite you need `pydantic` (from `lambda/requirements.txt`); `boto3` is also listed but absent from the local environment, causing 3 test-collection errors that are pre-existing and expected.

**Three test tiers with distinct roles:**
- `tests/unit/` — pure logic, no AWS, no network
- `tests/contract/` — schema and observable-behaviour contracts; use `jsonschema` and log-capture patterns
- `tests/e2e/` — full journey tests; most use `InMemoryDataStore` and pass without AWS credentials, but three require boto3

**`InMemoryDataStore`** in `lambda/control_plane.py` is not a test helper — it is a first-class exported class used by the control plane itself for offline/simulation mode, and re-used by all tests.

**`standalone_agent/` vs `lambda/`** — `standalone_agent/` runs on the local user device (companion process). `lambda/` runs in AWS Lambda. They share no code at runtime; `lambda/control_plane.py` imports from `standalone_agent/` only because the Lambdas run in a deployment that packages both directories together.

**JSON schemas are in `schemas/`**, not co-located with source. Contract tests in `tests/contract/` resolve them three directory levels up from the test file.

**`policy_engine.py` is the single execution gate** — it is the only module allowed to fire real adapter actions. All other modules return proposals with `policy_required: True`.
