# Gemini Consumption Modes — Flex, Priority, Webhooks (verdicts + adoption plan)

Research date: 2026-07-11. Sources (official):

- Flex: https://ai.google.dev/gemini-api/docs/flex-inference
- Priority: https://ai.google.dev/gemini-api/docs/priority-inference
- Webhooks: https://ai.google.dev/gemini-api/docs/webhooks
- Pricing: https://ai.google.dev/gemini-api/docs/pricing

---

## A. What flex and priority are

**Flex** — "an inference tier that offers a 50% cost reduction compared to standard rates, in exchange for variable latency and best-effort availability."

- **Pricing:** 50% off standard, per token. For gemini-3-flash-preview: $0.25/1M in, $1.50/1M out (vs $0.50/$3.00 standard) — identical to Batch prices.
- **Latency/queueing:** synchronous request, but target latency **1–15 minutes**; requests may queue under capacity constraints. Docs recommend raising client timeouts to 10+ min.
- **Availability:** best-effort, "sheddable" off-peak compute; requests "may be preempted or evicted." Errors surface as 503/429 with **no server-side fallback** — client must retry with backoff.
- **Rate limits:** "Flex inference traffic counts towards your general rate limits; it doesn't offer extended rate limits like the Batch API."
- **Enable:** `service_tier: 'flex'` on the request (Interactions API endpoints).

**Priority** — "a premium inference tier designed for business-critical workloads that require lower latency and the highest reliability at a premium price point."

- **Pricing:** 75–100% more than standard (3-flash-preview: $0.90 in / $5.40 out; caching $0.09). Overflow gracefully **downgrades to Standard** and is billed at standard rates.
- **Semantics:** synchronous, second-level latency, non-sheddable. Separate rate limits at 0.3x standard.
- **Enable:** `service_tier: 'priority'`.

**Model support:** both tiers support all models we use or might: Gemini 3.5 Flash, 3.1 Flash-Lite, 3.1 Pro Preview, **3 Flash Preview**, 2.5 Pro, 2.5 Flash, **2.5 Flash-Lite**.

## B. Does flex STACK with the Batch discount? — NO

They are **mutually exclusive consumption modes**, not stackable discounts. Evidence:

1. The flex doc's own comparison table lists them as parallel tiers with different interfaces:
   > "Pricing | 50% discount [Flex] | … | 50% discount [Batch] … Interface | Synchronous [Flex] | … | Asynchronous [Batch]"
2. The pricing page publishes **separate Batch-tier and Flex-tier price rows** per model — Batch input/output prices ARE the batch tier's pricing; there is no `service_tier` concept inside a batch job, and the docs nowhere describe combining them.
3. They land at the **same number anyway**: for 3-flash-preview both Batch and Flex are $0.25/$1.50. So even conceptually there'd be nothing to gain — flex is "batch pricing with a synchronous interface and minutes-not-hours latency," at the cost of best-effort availability and no extended rate limits.

**Verdict for the owner:** no 75%-off unicorn. Flex = the Batch discount for interactive-shaped calls. Choose per workload: Batch (async, 24h SLA-ish, extended rate limits) vs Flex (sync, 1–15 min, sheddable, normal rate limits) vs Standard vs Priority.

## C. Where flex fits OUR system

Cost math (official per-1M prices; caching interaction under flex is undocumented — treat cached-token pricing as unchanged/standard until proven):

| Workload                                | Model                  | Tokens (last load)  | Standard                            | Flex or Batch (50%)                               | Saving                 |
| --------------------------------------- | ---------------------- | ------------------- | ----------------------------------- | ------------------------------------------------- | ---------------------- |
| Entity-resolution judges (17,978 calls) | gemini-3-flash-preview | 20.7M in / 1.1M out | 20.7×$0.50 + 1.1×$3.00 = **$13.65** | **$6.83**                                         | $6.83                  |
| Relevance gate                          | 2.5-flash-lite         | 6.3M in / 0.6M out  | 6.3×$0.10 + 0.6×$0.40 = **$0.87**   | **$0.44**                                         | $0.44                  |
| (if gate is 3.1-flash-lite)             | 3.1-flash-lite         | same                | $1.58 + $0.90 = **$2.48**           | **$1.24**                                         | $1.24                  |
| Extraction chunks                       | 3-flash-preview        | (already Batch)     | —                                   | already 50%                                       | 0                      |
| Embeddings                              | gemini-embedding       | —                   | $0.15/1M                            | Batch $0.075 (no flex tier listed for embeddings) | ~50% if moved to batch |

Fit-by-workload:

- **Judges / dedupe judges** — best flex candidates. They're interactive today only because the pipeline wants answers within a chunk-plan cycle, but a 1–15 min latency is tolerable. Flex keeps the existing synchronous call shape in code (add `service_tier:'flex'` + retry-on-503/429 with backoff + 10-min timeout) — far cheaper to adopt than re-plumbing judges through the batch job lifecycle. Caveat: judge traffic eats normal interactive rate limits; batch would not. If a load ever saturates RPM, batch is the escape hatch at the same price.
- **Relevance gate** — same logic; saving is sub-dollar per load on 2.5-flash-lite. Do it only as a free rider on the same `service_tier` plumbing.
- **Embeddings** — no flex tier published; Batch embeddings are 50% off ($0.075/1M) if we ever care.
- **NEVER flex:** user-facing **search query interpretation** (latency-sensitive, 1–15 min target is disqualifying, plus sheddable = user-visible failures). Also never flex anything on the auth'd request path. If interpretation latency/reliability ever becomes a product problem, **Priority** exists (+80% cost, second-level latency, graceful degradation to standard) — at our interpretation volumes the dollar delta is trivial and it buys non-sheddable capacity.

## D. Webhooks vs the 5-min batch poller

- **Events:** `batch.succeeded` / `batch.failed` / `batch.cancelled` / `batch.expired` (plus interaction.\* and video.generated). Exactly the GeminiBatchService lifecycle.
- **Requirements:** internet-accessible HTTPS endpoint accepting POST; **respond 2xx within a few seconds** or Google retries. Security = Standard Webhooks spec: static webhooks get a symmetric signing secret (**returned only once at creation** — store it), dynamic webhooks use asymmetric JWT verifiable against Google's certs. Verify signatures; reject unsigned posts.
- **Retries/delivery:** **at-least-once**, automatic retries for **24 hours** with exponential backoff; dedupe on the `webhook-id` header.
- **Local dev / Railway:** localhost cannot receive webhooks — the poller remains the only mechanism in dev. On Railway we get a public HTTPS URL, so register the webhook there via env-config.

**Integration shape (webhook as accelerator, poller as reconciliation — never webhook-only):**

1. Add `POST /internal/gemini/webhook` controller: verify Standard-Webhooks signature, dedupe by `webhook-id`, respond 200 immediately, then enqueue the same completion handling the poller uses (`completeChunkPlan` path) — one shared idempotent "reconcile this batch job" function keyed by job name.
2. Keep the 5-min poller unchanged as the backstop (webhooks are at-least-once, not exactly-once, and delivery can fail for 24h+; also poller is the sole path in local dev). Idempotency in the shared reconcile function makes double-delivery (webhook + poll) harmless — it already is, since completion checks job state.
3. Optional: once webhooks are live in prod, stretch the poll interval (5 min → 15–30 min) — the webhook does the latency work; the poller only catches drops.
4. Config: `GEMINI_WEBHOOK_URL` + `GEMINI_WEBHOOK_SECRET` env vars; register the webhook once per environment; skip registration when unset (dev).

Value note: this is a latency/ops win (batch results land seconds after completion instead of up to 5 min later, fewer no-op polls), not a dollar win.

## E. Other features on the table

- **Priority tier** — premium insurance for the user-facing interpretation path if reliability ever matters more than +80% cost. Separate 0.3x rate-limit pool.
- **Interaction webhooks** (`interaction.completed` etc.) — if judges moved to flex, they stay synchronous; no webhook needed. But `interaction.requires_action` hints at server-side async interactions we don't use.
- **Batch embeddings** at $0.075/1M — relevant only for a bulk re-embedding pass.
- **Free Google Search grounding** on Gemini 3 models (5,000 prompts/mo shared) — unused; not obviously relevant to collection.
- **Priority-tier caching** exists ($0.09/1M for 3-flash-preview) — cache pricing scales with tier; flex-tier cache pricing is listed "same as standard" on the pricing page, so our new explicit system-prompt cache keeps its economics under flex.

## Adoption plan, ranked by dollar impact

1. **Judges + dedupe judges → flex** (~50% off ≈ $6.8 saved per Austin-scale load; scales linearly with load size). One-line `service_tier:'flex'` + 10-min client timeout + 503/429 exponential backoff in the shared Gemini client path for judge calls. Fallback: on repeated flex eviction, retry the same call at standard tier so a load never stalls.
2. **Relevance gate → flex** (≈ $0.44–$1.24/load). Free rider on #1's plumbing.
3. **Batch webhooks on Railway** ($0; latency/ops win). Controller + signature verification + shared idempotent reconcile; poller stays as backstop and as the only dev-mode path.
4. **Do nothing else:** extraction already rides Batch at the same 50%; search interpretation stays Standard (Priority only if a reliability need emerges); embeddings batch only if a bulk pass appears.

Non-goal: chasing batch+flex stacking — confirmed not a thing (§B).
