# Project AURA — Product Requirements Document

> **Product thesis:** *Bee remembers what you forgot. AURA remembers what you're about to forget—and, with your permission, protects the conditions in which you can act.*

## 1. Executive summary

AURA is a privacy-first, proactive focus companion built around an owner-controlled Bee memory. It changes the interaction model from **capture → summarize after the fact** to **prepare → protect → reflect**:

1. Five minutes before an opted-in calendar event, AURA delivers a short, emotionally calibrated briefing to the Bee Apple Watch experience.
2. During a user-started focus session, AURA detects user-declared or consented signals of distraction, suggests a response, and—only after explicit pre-authorization—executes reversible focus actions through connected-device adapters.
3. With separate workspace consent, it publishes a deliberately minimal ambient status to Slack.

This is a production intent, not a surveillance product. AURA never records audio, never infers a person’s state from covert device data, never sends content to a team by default, and never takes an irreversible action without a user-visible control plane.

## 2. Research findings and product boundary

### Bee capability assessment

| Topic | Verified finding | AURA decision |
|---|---|---|
| CLI | Bee publishes `@beeai/cli`; login, `status`, `ping`, `today`, `now`, data search, JSON output, and real-time SSE via `bee stream` are documented. Developer Mode in the Bee app is required. | The local companion uses `bee today --context`, read-only search, and the SSE stream. It does not scrape the mobile app or depend on undocumented endpoints. |
| MCP and local data | The official CLI can operate an MCP server and exposes localhost HTTP with bearer auth; Bee says its MCP/CLI data stays on the user’s machine. | The local process is the Bee trust boundary. Cloud receives only minimized, explicitly selected context. |
| Apple Watch | Bee states that users can interact through its iOS/Android mobile apps or an Apple Watch. | “Watch Whisper” is a **capability-adapter contract**, not a claim of a third-party watch SDK. Phase 1 uses an iOS companion notification/deep link; native Bee integration requires Bee partner approval. |
| Privacy | Bee says it transcribes in real time, discards audio, and encrypts transcripts/insights with user-controlled device keys; it also states that data sent to a connected service leaves that private-compute environment. | AURA sends no raw audio. The consent screen names each exported field, recipient, retention period, and revoke path. |
| Bookmark gesture | Current official CLI documentation lists no `double-press bookmark` command. Bee’s public product surfaces describe buttons/voice notes, while the cited reference architecture discusses capture gestures. | Treat this as an **unverified hardware capability**. Ship a `bookmark_requested` abstraction driven by an approved Bee event or an AURA app/watch control; do not promise double-press support until Bee documents it. |

Primary sources: [Bee CLI](https://docs.bee.computer/docs/cli), [Bee developer overview](https://docs.bee.computer/), [Bee private compute](https://bee.computer/blog/private-ai), [Bee Pioneer privacy](https://bee.computer/bee-pioneer), [Bee terms for connected services](https://bee.computer/terms).

### Competitive proof: the current gap

The competitors are strong at capture, transcription, recall, and (in some cases) post-capture task generation. Their published product flows are not a user-authorized, cross-device **pre-meeting intervention + focus enforcement** system. “After-only” below means **the primary documented value loop begins with recorded/captured conversation and produces notes/recall afterwards**; it does not mean each company has no proactive reminders at all.

| Product | Published core loop | Public price snapshot (USD; verify at purchase) | Where it falls short of AURA’s thesis |
|---|---|---:|---|
| Plaud | Press/capture → transcript/summary → Ask Plaud/templates/share. | Device: Note $159, NotePin $159, NotePin S $179, Note Pro $189. Plans: free 300 min/mo; Pro $17.99/mo or $99.99/yr (1,200 min/mo); Unlimited $29.99/mo or $239.99/yr. | It is explicitly positioned around capturing conversations and turning them into structured notes. Its public material does not describe a five-minute personalized pre-brief that pauses a connected distraction surface. |
| Limitless | Wearable captures day/meetings → transcript/memory → ask, prepare, reminders. | It has been acquired by Meta; as of its current notice it no longer sells new Pendants and supports existing customers through 2026, making historical plan pricing unsuitable as a purchasing recommendation. Earlier published page listed $99 Pendant and Free/Pro/Unlimited transcription tiers. | It offers “Prep,” but its public roadmap/status does not establish an open, consented orchestrator that changes Echo/Fire TV focus state. Product continuity is also a material vendor risk. |
| Omi | Wearable/app captures conversations → AI insights and transcript-based experience. | Pendant page lists $129 discounted device price; Unlimited yearly $269. | Omi’s public pricing describes minutes/features, not a proactive meeting cue plus explicit physical-environment intervention workflow. |

Sources: [Plaud shop & plans](https://www.plaud.ai/pages/shop-plaud), [Limitless status](https://www.limitless.ai/), [Limitless archived pricing page](https://staging.limitless.ai/pricing), [Omi pricing](https://www.omi.me/pages/pricing). Pricing and product features change frequently; AURA’s sales collateral must refresh these citations quarterly.

## 3. Users and jobs to be done

### Persona A — Aditi, B.Tech student

**Context:** 20-year-old engineering student balancing classes, placement preparation, group projects, and a noisy shared home. She loses the first minutes of mentoring calls scrambling for context and repeatedly drifts to video apps while studying.

**Job:** “When I’m about to meet a mentor or start a study sprint, help me enter it prepared and keep the room quiet without making decisions for me.”

**Success moment:** five minutes before a placement mentoring session, Aditi sees: “You last discussed portfolio deployment. You sounded nervous but prepared. Ask about system-design interview gaps.” She starts a 45-minute focus mode and approves “pause Fire TV” once; the same policy is available thereafter with a prominent Stop button.

### Persona B — Marcus, remote product manager

**Context:** 34-year-old remote worker with back-to-back calls and an open-plan home office. He needs continuity across stakeholder conversations but does not want an employer to receive private memory or a surveillance score.

**Job:** “Before a meeting, put the right context in my hand; when I choose deep work, defend it with the least disruptive intervention.”

**Success moment:** Marcus receives three meeting questions grounded in his own approved work memory, then opts in to a Slack status of “in focus until 14:30”—not a transcript, score, reason, or location.

## 4. User stories

- As a user, I can connect Bee locally and see exactly what fields AURA may read.
- As a user, I receive a one-glance briefing 5 minutes before an opted-in event, with one relevant memory, one stated uncertainty, an emotion/tone label, and no confidential transcript.
- As a user, I can correct, dismiss, or disable a briefing; corrections improve only my AURA preference profile.
- As a user, I can start/stop Focus Guardian from watch, web, mobile, voice, or a keyboard shortcut.
- As a user, I can report “I’m distracted”; device signals are optional and never secretly collected.
- As a user, I select each allowed intervention (for example, offer DND, request Fire TV pause) and choose **Ask every time**, **Allow for this session**, or **Never**.
- As a user, I can immediately undo an action, review an action audit, export my data, and revoke every integration.
- As a workspace member, I can opt in to a minimal Slack ambient status; teammates cannot inspect focus scores, raw events, or private context.
- As an admin, I can set retention, data residency, DLP, and feature boundaries—but cannot read a person’s private memory by default.

## 5. Requirements

### Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Calendar service emits an event at T-5 minutes for opted-in events, honors time zones, reschedules, cancellations, and “do not disturb” windows. |
| FR-2 | Context service selects at most 5 least-privilege snippets from user-approved Bee context; it redacts sensitive entities before model invocation. |
| FR-3 | Agent returns validated structured output: briefing, three questions, tone, confidence, citations-to-source-IDs, and a no-brief reason when evidence is insufficient. |
| FR-4 | Whisper adapter delivers notification/action card to the user’s watch/mobile channel with a 10-second read target; no speaker-dependent or audible default is assumed. |
| FR-5 | Focus Guardian accepts explicit start/stop, explicit “I’m distracted,” and separately consented local signals. It computes a transparent, non-diagnostic score. |
| FR-6 | Policy engine requires a user grant and target-device allowlist before executing any action. A dangerous/ambiguous action becomes a suggestion, not execution. |
| FR-7 | Every device action is idempotent, reversible where supported, timestamped, and available in a user-visible audit trail. |
| FR-8 | Deep Work Bank awards points only to the user, supports no team leaderboard by default, and never feeds employer performance assessment. |
| FR-9 | Slack integration uses OAuth, channel allowlisting, preview, and per-workspace/user consent. Default post contains only an availability status and expiry. |

### Non-functional requirements

| Area | Production bar |
|---|---|
| Latency | Pre-brief p95 < 3 s after trigger once context is available; distraction suggestion p95 < 1.5 s; action acknowledgement p95 < 2 s, excluding device availability. |
| Availability | 99.9% monthly for orchestration APIs; graceful local-only degradation if Bee/AWS/integration is unavailable. |
| Reliability | At-least-once events with idempotency keys; no duplicate Slack posts or device commands; multi-AZ state stores. |
| Privacy | No raw audio storage; default zero cloud retention for transient audio/text; cryptographic deletion on user deletion request; regional data boundary. |
| Security | Least-privilege IAM, KMS encryption, Secrets Manager, WAF, OAuth PKCE, signed WebSockets, audit logs, threat modeling, dependency/SBOM scanning. |
| Accessibility | Watch/mobile cards meet screen-reader and high-contrast needs; no focus penalty for assistive-tech use. |
| Safety | No mental-health diagnosis, disciplinary scoring, or automated employer reporting. Every intervention has stop/undo. |

### Technical requirements

- Local companion must authenticate to Bee with the official flow and use `--json`/SSE rather than parsing rendered Markdown.
- Cloud ingress uses authenticated WebSocket/API endpoints, schema versioning, request size limits, replay protection, and event idempotency.
- Models receive a minimized context envelope, must produce JSON to a schema, and cannot invoke external actions directly; an authorization service makes the final action decision.
- Knowledge graph stores only approved summaries/relationships, not unbounded transcript copies. Graph access is tenant- and subject-scoped.
- Transcribe streaming, if product-approved as an alternative input, must stream—not persist—audio and must be separately consented. Amazon Transcribe supports bidirectional real-time WebSocket/HTTP2 streaming; streaming accuracy and language limitations must be surfaced. [AWS documentation](https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html)

## 6. Success metrics and guardrails

| Metric | Launch target | Guardrail |
|---|---:|---|
| Brief usefulness | ≥70% “helpful” among responders | ≤1% user reports as “creepy/inaccurate” after 30 days; investigate every report. |
| Timeliness | ≥95% eligible briefings delivered by T-2 minutes | Never send outside user’s chosen quiet hours. |
| Focus outcome | ≥20% reduction in self-reported interruptions per opted-in focus hour | Not measured per employee or exposed to manager. |
| Action trust | ≥95% actions explicitly granted/confirmed; undo rate tracked | Undo rate >5% for a policy pauses auto-execution. |
| Privacy control | ≥99% revocations effective in <60 s | Any consent propagation failure is Sev-1. |
| Availability | 99.9% | A missed suggestion must never block a calendar event or device. |

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Bee’s public integrations/watch APIs may not permit direct third-party whispering or gesture control. | Ship the local companion/mobile notification adapter first; use an integration capability registry and remove unavailable claims from demos. |
| “Distraction detection” becomes surveillance or false-positive policing. | Make self-report primary; feature-gate local signals; show evidence; keep score local where possible; require explicit consent and offer disable/delete. |
| Alexa/Fire TV remote control has capability, household, certification, and content-app limits. | Build an adapter that only executes verified supported commands; otherwise issue a user confirmation/deep link. Never rely on an undocumented Alexa endpoint. Fire TV apps can implement Alexa transport controls through Media Session, but that is not a blanket remote-control API. [Amazon documentation](https://developer.amazon.com/docs/fire-tv/mediasession-api-integration.html) |
| Inferred meeting context leaks sensitive data. | Data classification/redaction before LLM; source allowlists; no Slack content; KMS keys per tenant; default no transcript persistence. |
| LLM hallucination or prompt injection triggers a wrong action. | JSON schema, evidence IDs, allowlisted tools, separate deterministic policy engine, approval for high-impact actions, model evaluation/red-teaming. |
| Vendor/product change. | Contract tests against Bee CLI versions, feature flags, fallback local experience, quarterly dependency review. |

## 8. Scope decisions

**MVP:** local Bee companion; Google/Microsoft calendar; pre-brief notification; self-report Focus Guardian; Deep Work Bank; Slack availability status; simulated device adapter plus an explicitly authorized Fire TV/Alexa proof of capability.

**Not MVP:** covert phone-unlock telemetry, automatic DND changing, team analytics, transcription ingestion, manager dashboards, health/wellness inference, or an unverified Bee Watch SDK integration.

