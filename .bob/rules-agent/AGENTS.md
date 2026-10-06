# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical coding constraints

**Lambda keyword workaround** — import `lambda/` modules with `importlib.import_module("lambda.focus_guardian")`, never `from lambda import ...`. Mirror this in any new test file.

**`_log()` not `print()`** — both Lambda modules define a `_log(level, event, **fields)` helper. All operational output must go through it. Bare `print()` calls break the structured-log contract tests.

**`fallback_reason` is a queryable tag** — when calling `safe_fallback()`, always pass one of: `"not_implemented"`, `"validation_error"`, `"hallucinated_evidence"`, `"type_error"`. The empty-string default is retained only for backward compat; new call sites must supply a tag.

**Evidence hallucination check must not be removed** — in `lambda_handler` inside `focus_guardian.py`, the subset check `set(proposal.evidence_ids).issubset(source_ids)` is a security boundary. Removing or relaxing it breaks a contract test and opens a prompt-injection path.

**`policy_required: True` is non-negotiable** — Lambda handlers never execute actions; they return a proposal with `policy_required: True`. Only `standalone_agent/policy_engine.py` may execute. Any change that makes a handler execute an action directly is wrong.

**Pydantic alias field** — `FocusProposal.questions` has `alias="3_questions"`. Use `model_dump(by_alias=True)` on output, `model_validate` on input, and `"3_questions"` as the dict key in test fixtures.

**`InMemoryDataStore` for all control plane tests** — never instantiate boto3 DynamoDB in tests; use the `InMemoryDataStore` exported from `lambda/control_plane.py`.

**Log capture in contract tests** — patch `builtins.print`, not just module-level `print`. See `capture_logs()` in `tests/contract/test_modernization_contract.py`.

**`from __future__ import annotations`** — required at the top of every new module (all existing files have it).

**`| None` not `Optional`** — use union syntax throughout; `Optional[X]` is not used in this codebase.
