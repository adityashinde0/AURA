# Project AURA — Friction Log

This is a living engineering artifact, not a retroactive success story. Update it during every integration test and include links to incident tickets/evidence.

| Date | Task | Expected vs. actual | Severity | Workaround | Suggestion for Amazon team |
|---|---|---|---|---|---|
| 2026-10-04 | Validate Bee gesture path for a “bookmark” event | Expected a documented CLI/API route for double-press bookmark. Actual: current public Bee CLI documentation confirms login/status/ping/SSE but does not list a double-press bookmark command. | High | Use an AURA app/watch “Mark moment” action or a verified Bee SSE event behind a capability flag. Do not demo an unverified hardware gesture. | Publish a versioned wearable-event schema and partner capability matrix, including gesture availability and watch delivery API. |
| 2026-10-04 | Design Apple Watch “whisper” | Expected a public third-party Bee watch push/API integration. Actual: Bee confirms Apple Watch access, but public docs reviewed do not establish an AURA partner SDK. | High | Use iOS/mobile notification and deep-link fallback; label it accurately. | Offer an OAuth-scoped Watch complication/notification SDK with simulator and entitlement documentation. |
| 2026-10-04 | Turn distraction into Echo/Fire TV action | Expected a universal programmatic pause/DND surface. Actual: Fire TV documents Media Session transport controls for integrated apps; this does not prove arbitrary household remote control/DND automation. | Critical | Simulator + user-confirmed supported device route; gate all real actions by capability/certification. | Publish a consent-aware household automation API with device discovery, action receipts, undo, and sandbox. |
| 2026-10-04 | Establish competitor baseline | Expected stable, directly comparable plans. Actual: pricing/availability changed: Limitless reports Meta acquisition and no longer sells new Pendants; Plaud/Omi plan catalogs can change. | Medium | Timestamp source snapshots and phrase claims as documented primary loop rather than absolute “after-only.” | Maintain an Amazon-managed competitive-intelligence source registry with expiry, change detection, and legal review. |
| 2026-10-04 | Python reserved keyword `lambda` as directory name | Expected standard `from lambda.focus_guardian import ...` in pytest suite. Actual: `lambda` is a Python reserved keyword causing AST `SyntaxError`. | Low | Used `importlib.import_module("lambda.focus_guardian")` in test harnesses. | Recommend standardizing directory structure to `src/aura_lambda` or similar in next refactor. |
| 2026-10-04 | Local PII Redactor regex collision | Phone regex without word boundary previously collided with numeric substrings in long token strings. | Medium | Enforced explicit order (secrets/tokens stripped first) and strict phone boundaries with optional international and 7/10-digit formats. | Provide localized validation libraries or standard DLP pattern rules for local companion runtime. |
| 2026-10-04 | AWS CDK v2 sub-module path resolution in Node 24 | Sub-path imports such as `aws-cdk-lib/aws_kms` fail TypeScript resolution in modern Node 24 module resolution. | Low | Imported namespaced service modules directly from `aws-cdk-lib` (e.g. `import { aws_kms as kms } from 'aws-cdk-lib'`). | Update starter templates and developer documentation to highlight top-level package destructuring in modern Node environments. |
| 2026-10-04 | API Gateway WebSocket authentication headers in browser/wearable clients | Browser and wearable WebSocket clients cannot inject arbitrary custom headers into the initial `$connect` handshake. | Medium | Supported both `Authorization` header and `?auth_token=` query string parameter in `$connect` handler with strict token length/signature checks. | Standardize WebSocket connection authorization patterns across AWS IoT and API Gateway documentation. |

## Source notes

- [Bee CLI](https://docs.bee.computer/docs/cli)
- [Bee Apple Watch/product statement](https://bee.computer/)
- [Fire TV Media Session API](https://developer.amazon.com/docs/fire-tv/mediasession-api-integration.html)
- [Limitless customer status](https://www.limitless.ai/)
- [Plaud pricing](https://www.plaud.ai/pages/shop-plaud)
- [Omi pricing](https://www.omi.me/pages/pricing)
