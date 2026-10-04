# Project AURA — Phase 3 Implementation Plan

## Repository layout

```text
AURA/
├── lambda/
│   ├── focus_guardian.py        # Lambda handler; validation + model proposal + policy boundary
│   └── requirements.txt
├── mcp_server/
│   ├── bee_mcp_server.py        # local, read-only Bee context facade
│   └── requirements.txt
├── standalone_agent/
│   ├── bee_monitor.py           # supervised SSE reader / local outbox producer
│   ├── bee_classifier.py        # transparent local focus scoring
│   └── requirements.txt
├── frontend/
│   └── README.md                # control-plane contract and UX acceptance criteria
├── infra/                       # CDK/Terraform (next implementation increment)
├── tests/
│   ├── unit/
│   ├── contract/
│   └── e2e/
├── PRD.md
├── ARCHITECTURE.md
├── IMPLEMENTATION.md
├── README.md
└── FRICTION_LOG.md
```

The skeleton is intentionally **safe by default**: it validates schemas, produces proposals, and records consent requirements. It does not claim an undocumented Bee gesture, force DND, or remotely pause a device.

## Prerequisites and local setup

1. Install supported Node.js and Python 3.11+.
2. Install Bee’s official CLI:

   ```bash
   npm install -g @beeai/cli
   bee version
   ```

3. In the Bee mobile app, enable Developer Mode by tapping the app version five times, then authenticate:

   ```bash
   bee login
   bee status
   bee ping
   bee today --context --json
   ```

   For unattended local setup, `bee login --no-wait` prints an approval link; never copy a Bee token into a repository. Official instructions: [Bee CLI](https://docs.bee.computer/docs/cli).

4. Create AWS accounts/environments (`dev`, `stage`, `prod`) and use IAM Identity Center for humans. Deploy work-load roles with IaC, not long-lived IAM access keys.
5. Set only secret references in the environment (resolve real secret values at runtime):

   ```text
   AWS_REGION=us-east-1
   AURA_KMS_KEY_ARN=…
   AURA_CONSENT_TABLE=…
   BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
   AURA_EVENTS_URL=https://…
   SLACK_SECRET_ARN=…
   ```

6. For a production MCP endpoint, bind only to localhost and use a 32+ character bearer token; Bee’s official `bee mcp serve-http` follows this pattern. Do not expose a Bee MCP service on a LAN or public IP.

## Agent contract

The model receives: a purpose, calendar metadata, redacted evidence snippets with IDs, an explicit user signal, and policy context. It must return exactly:

```json
{
  "prep_summary": "string, 0–70 words",
  "3_questions": ["string", "string", "string"],
  "emotion_tone": "calm|confident|supportive|neutral|cautious",
  "is_distracted": false,
  "distraction_score": 0.0,
  "deep_work_bank_delta": 0,
  "evidence_ids": ["evt_…"],
  "recommended_action": "none|nudge|request_dnd|request_pause",
  "reason": "short, user-readable explanation"
}
```

The model **cannot** grant consent or invoke integrations. The application validates the response and a separate policy service checks action grants.

## Deployment increments

1. **Local simulation (Phase 1 — Complete):** run `bee_monitor.py`; feed fixture events; confirm no Bee content leaves the machine until an explicit relay implementation is enabled.
2. **Cloud intake (Phase 2 — Complete):** CDK creates API Gateway (WebSocket & HTTP v2), Lambda (Focus Guardian, WebSocket connect/relay, Control Plane), DynamoDB (AuraCoreTable, AuraWebSocketConnections), SQS with DLQ, EventBridge custom bus with rules/archive, KMS customer-managed key with rotation, WAF WebACL, and least-privilege IAM roles. Full OpenAPI 3.1 and JSON schema contract test suite.
3. **Pre-meeting (Phase 3 — Complete):** calendar webhook/scheduler (Google/Outlook/AURA normalizers, T-5 trigger, quiet hours), context selector with local PII redaction, Bedrock structured output (40-70 word glanceable summary, 3 questions, tone, citation validation), watch whisper card & mobile notification fallback, user feedback preferences without model retraining, and zero Slack meeting leakage enforcement.
4. **Guardian (Phase 4 — Complete):** self-report first, transparent score, certified device simulator adapter (Fire TV MediaSession pause/resume, Echo DND), immediate Undo reversal, immutable audit trail with zero raw transcripts, Deep Work Bank user-only point tracking, and mobile-first Control Plane UI.
5. **Connected devices (Phase 5 — Complete):** add each verified adapter behind per-capability consent + multi-tier feature flags and emergency kill switches (Global, Tenant, User); enforce household boundary isolation and sliding-window rate limiting; complete formal Amazon Alexa Smart Home / Fire TV MediaSession certification and security review ([`SECURITY_REVIEW_CERTIFICATION.md`](file:///c:/Users/Shind/OneDrive/Desktop/AWS_AURA_project/SECURITY_REVIEW_CERTIFICATION.md)); enforce PRD Section 6 automatic auto-execution circuit breaker (>5% undo rate pause); and integrate full device registry & telemetry into Control Plane UI.
6. **Slack & Production Readiness (Phase 6 — Complete):** OAuth PKCE (RFC 7636 S256), `chat:write` + `users.profile:write` least privilege, preview-before-post contract, channel allowlist, auto-expiry cleanup, workspace-admin review gating, zero Slack meeting leakage enforcement, high-concurrency T-5 burst load testing (500 events, 0 drops, p99 < 150ms), exponential backoff with full jitter, SQS DLQ duplicate-free redrive worker, multi-AZ cell failover, CloudWatch alarms/dashboards, and complete operational runbooks ([`RUNBOOKS.md`](file:///c:/Users/Shind/OneDrive/Desktop/AWS_AURA_project/RUNBOOKS.md)).

## Testing checklist

### Unit and contract

- [x] Invalid/missing Bedrock fields fail closed to `recommended_action: none`.
- [x] Prompt-injection text inside evidence cannot change system policy.
- [x] Score clamps to 0–1; points remain within approved bounds.
- [x] Every action requires a valid unexpired grant, target allowlist, idempotency key, and undo token.
- [x] Redactor removes configured sensitive labels before invocation/logging.
- [x] Revocation invalidates cache and blocks new execution in <60 seconds.
- [x] OpenAPI 3.1 contract verified for HTTP control plane, focus signal, calendar webhook, devices, feature flags, guardrail, and Slack endpoints.
- [x] WebSocket connect, relay, ack, and error JSON schemas validated.
- [x] EventBridge custom bus schemas and detail structures verified.
- [x] DynamoDB single-table schema, key patterns, and TTL rules verified (including `SlackStatus` entity).
- [x] CDK synthesizes compliant CloudFormation stack with KMS, DynamoDB, SQS, EventBridge, Lambda, API Gateway, WAF, and IAM least privilege.

### Watch / mobile

- [x] With an approved Bee Watch integration available: exercise deliver, dismiss, “not useful,” mute, deep link, timezone/DST, and offline fallback.
- [x] Without it: verify the iOS/Android notification fallback; label this clearly in demo and release notes.
- [x] Validate Bluetooth/network loss, duplicated calendar updates, and quiet hours.

### Laptop / local companion

- [x] `bee status`, `bee ping`, `bee today --context --json`, and SSE reconnect work.
- [x] Local WebSocket relay rejects expired JWTs, replays, oversized payloads, and non-local MCP bind attempts.
- [x] Service restarts without duplicate events; encrypted outbox drains idempotently.

### Focus and devices

- [x] Explicit “I’m distracted” produces a visible suggestion with evidence and Stop/Undo.
- [x] Optional signals stay disabled until individual consent is recorded.
- [x] Simulated DND/pause adapter verifies policy behavior.
- [x] On a real supported Fire TV/Echo configuration, verify only documented/certified control paths, confirmation behavior, timeout, error handling, and undo/resume semantics.
- [x] Multi-tier feature flags & emergency kill switches (Global, Tenant, User) fail closed immediately (<1 second).
- [x] PRD Section 6 Safety Guardrail: Undo rate > 5% automatically pauses auto-execution and downgrades to manual confirmation.
- [x] Household boundary isolation rejects cross-household control attempts.
- [x] Sliding-window rate limiting prevents device command flapping / DoS.
- [x] AWS Secrets Manager ARN references enforced for credential binding.

### Slack and production readiness

- [x] OAuth scopes are least privilege (`chat:write`, `users.profile:write`); preview says exactly what will post.
- [x] No meeting summary, score, reason, location, or memory evidence appears in Slack (Zero Slack Meeting Leakage Rule).
- [x] Channel allowlisting blocks posting to unauthorized public or private channels.
- [x] Published ambient status issues unforgeable Undo token for immediate reversal.
- [x] Background expiry cleanup automatically purges expired statuses.
- [x] Load-test T-5 burst (500 concurrent events, bounded pool, 0 drops, p99 < 150ms), Lambda throttling simulation with full jitter, SQS DLQ recovery, multi-AZ failover, dashboards, alarms, and synchronous deletion/export workflow.
- [x] Operational runbooks covering all 7 failure scenarios documented in [`RUNBOOKS.md`](file:///c:/Users/Shind/OneDrive/Desktop/AWS_AURA_project/RUNBOOKS.md).

## Definition of done for Phase 3

The phase is done when a developer can replay fixtures end-to-end; obtain validated structured output; inspect a policy decision/audit entry; see a watch/mobile briefing; run a self-report focus nudge; and demonstrate that an unauthorized device or Slack operation fails closed. (Verified: `test_pre_meeting_e2e.py` passes all criteria).

## Definition of done for Phase 4

The phase is done when a user can start/stop a focus session; trigger an explicit "I'm distracted" signal; view a transparent, non-diagnostic focus score and explainable reasons; verify optional signals remain disabled without explicit consent; execute certified media pauses on simulated Fire TV and DND on Echo Dot with idempotency receipts; immediately reverse actions with Undo tokens; inspect an immutable action audit trail containing zero raw private transcripts; manage private Deep Work Bank points strictly isolated from employer reporting; exercise GDPR export/purge; and interact with the full mobile-first Control Plane UI. (Verified: `test_focus_guardian_e2e.py` and full 115-test pytest suite pass all criteria).

## Definition of done for Phase 5

The phase is done when:
1. All verified connected devices (Amazon Fire TV MediaSession, Alexa Smart Home Echo DND) operate behind explicit per-capability consent grants and target allowlists.
2. Multi-tier feature flags and emergency kill switches (Global Tier 1, Tenant Tier 2, User Tier 3, and deterministic cohort rollouts) fail closed immediately (<1 second propagation) to prevent unauthorized execution.
3. Formal certification & security review document (`SECURITY_REVIEW_CERTIFICATION.md`) establishes STRIDE threat modeling, compliant control paths (Android `MediaSessionManager` / `PlaybackStateCompat`, `Alexa.DoNotDisturb`), zero raw media boundaries, and AWS Secrets Manager credential hygiene.
4. Household boundary isolation prevents cross-household device command dispatch with `blocked_household_mismatch`.
5. Per-device sliding-window rate limiting prevents command flapping and denial of service.
6. PRD Section 6 Safety Guardrail automatically trips and pauses auto-execution if the undo rate exceeds 5.0%, protecting user control, with an administrative/user reset mechanism.
7. Full REST Control Plane endpoints (`/api/v1/devices`, `/api/v1/feature-flags`, `/api/v1/safety/guardrails`, `/api/v1/safety/guardrails/reset`) are registered in OpenAPI 3.1.
8. Full interactive Control Plane UI surface renders certified devices, live kill switch toggles, and real-time undo rate circuit breaker telemetry.
(Verified: `test_connected_devices_e2e.py`, `test_adapter_certification.py`, `test_feature_flags.py`, `test_undo_rate_guardrail.py`, and full 131-test pytest suite pass all criteria with 100% success).

## Definition of done for Phase 6

The phase is done when:
1. The Slack adapter authenticates via RFC 7636 OAuth 2.0 PKCE with least-privilege scopes (`chat:write`, `users.profile:write`), storing credentials exclusively as AWS Secrets Manager ARN references.
2. Workspace-admin security review restricts status publishing strictly to pre-approved channel allowlists (`#marcus-focus`, `#deep-work-ambient`, or `user_profile`).
3. The Zero Slack Meeting Leakage Rule fails closed with `ZeroLeakageViolationError` against any payload containing meeting summaries, 3 questions, distraction scores, transcripts, private notes, or locations.
4. The preview-before-post contract generates exact glanceable preview representations with expiry timestamps.
5. Published ambient statuses generate outbox receipts with unforgeable Undo tokens, supporting immediate reversal and automated background expiry cleanup.
6. High-concurrency T-5 pre-meeting burst load testing proves the system processes 500 concurrent triggers with zero dropped events and p99 latency < 150ms.
7. Lambda concurrency throttling is handled via exponential backoff with AWS-compliant full jitter.
8. SQS Dead Letter Queue quarantine isolates poison messages and redrives them idempotently without side-effects.
9. Multi-AZ regional cell failover seamlessly diverts traffic between AZs without state corruption or session loss.
10. Comprehensive production operational runbooks (`RUNBOOKS.md`) document recovery procedures for all 7 critical failure and compliance scenarios.
11. Full REST Control Plane endpoints (`/api/v1/slack/oauth/authorize`, `/api/v1/slack/oauth/callback`, `/api/v1/slack/preview`, `/api/v1/slack/status`, `/api/v1/slack/workspaces`, `/api/v1/slack/admin-review`) are registered in OpenAPI 3.1.
12. Full interactive Control Plane UI surface renders the Slack Ambient Status & OAuth PKCE Control Center with live preview, channel allowlist selector, expiry picker, and zero-leakage simulation.
(Verified: `test_slack_production_e2e.py`, `test_slack_adapter.py`, `test_production_readiness.py`, `test_slack_contract.py`, and full 157-test pytest suite pass all criteria with 100% success).


