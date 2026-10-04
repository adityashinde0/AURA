# Project AURA — Proactive Memory That Fights For Your Focus

> **Bee remembers what you forgot. Aura remembers what you're about to forget, and stops the world from distracting you.**

## What makes AURA different

Most meeting-memory products optimize the loop **record → transcribe → summarize after**. AURA operates **before** the meeting, then **acts through consented adapters** to defend a focus session. It is built as a privacy-first layer: Bee remains the personal-memory source; AURA receives only purpose-bound, minimized context and never stores raw audio.

**Uniqueness:** **BEFORE not AFTER + ACTS via Alexa**—but only through verified, user-authorized, reversible capability paths. If an Alexa/Fire TV function is unsupported for the account/device, AURA asks or falls back; it never pretends control exists.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md), the [PRD](PRD.md), and the [implementation plan](IMPLEMENTATION.md).

## Technology stack

| Layer | Choice |
|---|---|
| Personal context | Bee CLI/SSE/MCP; local companion |
| Edge/API | API Gateway WebSocket + HTTP, Lambda, EventBridge, SQS |
| AI | Bedrock Claude 3.5-class model, Strands SDK, Bedrock AgentCore |
| Speech (optional) | Amazon Transcribe Streaming—no raw-audio persistence |
| State | DynamoDB knowledge graph + TTL, KMS, Secrets Manager |
| Integrations | Calendar, watch/mobile capability adapter, Alexa/Echo/Fire TV adapter, Slack OAuth |
| Operations | CloudWatch, X-Ray/OpenTelemetry, WAF, IAM Identity Center, IaC |

## Three-minute demo script

**0:00–0:20 — problem.** Show a calendar with a mentoring call and a focus block. Say: “Most note takers help after the meeting. AURA helps at the moment preparation matters.”

**0:20–0:55 — consent.** Open Permissions. Show Bee context set to “local only / selected summaries,” pre-meeting cue enabled, Slack status disabled by default, and Fire TV action set to “ask every time.” Explain that raw audio is never sent to AURA.

**0:55–1:30 — pre-meeting.** Trigger a fixture meeting at T-5. Show a watch/mobile card: concise context, a tone, three questions, source labels, “Not useful,” and mute. Emphasize that this is a fallback notification unless an approved Bee Watch integration is connected.

**1:30–2:15 — guardian.** Start a 25-minute focus session. Trigger “I’m distracted.” Show the evidence explanation and a proposed “Pause allowed Fire TV?” action. Approve it, then use Undo/Resume. Show an unsupported device becoming a suggestion, not an action.

**2:15–2:40 — ambient team sync.** Turn on Slack only after showing the preview: “In focus until 14:30.” Demonstrate expiry. Confirm no score, reason, meeting details, or memory is posted.

**2:40–3:00 — proof.** Open the audit trail and show policy grant, idempotency key, outcome, and revoke button. Close with: “AURA respects private memory, prepares you before the moment, and protects focus only when you ask it to.”

## Deployment steps

1. Bootstrap isolated AWS `dev`, `stage`, and `prod` accounts with SSO, centralized logging/security accounts, SCPs, and a dedicated KMS key per environment.
2. Deploy IaC that creates API Gateway, Lambda, EventBridge Scheduler, SQS/DLQ, DynamoDB with TTL/PITR, KMS, Secrets Manager, WAF, CloudWatch alarms, and least-privilege roles.
3. Configure Bedrock model access, model allowlist, guardrails/evaluations, regional residency, and structured-output contract tests.
4. Install the Bee CLI locally, enable Bee Developer Mode, run `bee login`, `bee status`, and `bee ping`; register the local companion as an OS service.
5. Add calendar OAuth with PKCE and least scopes. Enable pre-meeting only for user-selected calendars/events.
6. Add one adapter at a time: mobile notification, then only verified/certified Alexa/Fire TV capability, then Slack (`chat:write` plus channel allowlist). Test revoke/undo before activating.
7. Run security, load, chaos, privacy-deletion, rollback, and game-day tests. Launch with feature flags and staged cohorts.

## Demo video checklist

- [ ] Begin with the user’s consent dashboard, not a “magic” data capture claim.
- [ ] Use synthetic/fake meeting context; do not expose real conversations.
- [ ] Show T-5 pre-brief, usefulness feedback, and limitation/fallback label.
- [ ] Show explicit distraction self-report, proposed action, approval, and Undo.
- [ ] Show Slack preview and auto-expiry with no private content.
- [ ] Show the audit trail, feature kill switch, and revoke flow.
- [ ] State the Fire TV/Alexa integration’s actual tested capability—not a mock presented as production.

## Industry handover checklist

### IAM and environment

- [ ] IaC owns all resources; no shared root credentials or long-lived access keys.
- [ ] Separate account/role per environment; least-privilege policy tested with IAM Access Analyzer.
- [ ] KMS key policies partition tenant data; Secrets Manager rotates integration tokens.
- [ ] SSO + break-glass procedure + quarterly access review.

### Logs, operations, and cost

- [ ] Structured logs omit prompt/evidence bodies, tokens, OAuth secrets, and personal identifiers; retention is approved and region-specific.
- [ ] Dashboards cover trigger-to-delivery latency, error/DLQ rate, consent denials, adapter failures, model validation failures, and revoke latency.
- [ ] Budgets/Cost Anomaly Detection, Bedrock token caps, Lambda concurrency controls, DynamoDB TTL/on-demand review, SQS batching, and sampling-based tracing are enabled.
- [ ] Runbooks cover Bee outage, calendar outage, model outage, Slack/Alexa outage, compromised token, deletion request, and global action kill switch.

### Security and privacy

- [ ] Threat model, DPIA, data map, retention/deletion design, legal review of recording/consent laws, penetration test, and supply-chain SBOM are complete.
- [ ] Consent is granular, revocable, auditable, and fails closed. Do not use workplace focus data for performance management.
- [ ] Model red-team suite covers prompt injection, data exfiltration, hallucinated action, bias, dangerous advice, and sensitive-context leakage.
- [ ] External integrations pass their own OAuth, certification, security, and marketplace reviews; unsupported controls remain suggestions.

## Development quick start

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for Bee setup and the code skeleton. The current skeleton runs in local-only/simulation mode by design; production deployment requires the above IaC, policy service, and adapter certification work.
