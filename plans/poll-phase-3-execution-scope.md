# Poll Plan — Phase 3 Execution Scope (poll creation + axis inference)

> Companion to `community-polls-discussion-driven-collection-plan.md` §3. Style matches the
> completed `poll-phase-{0-1,2}-execution-scope.md`. Status: **IN PROGRESS.** Dep: Phase 2 ✅.

**The shift:** today poll creation is **structured-input** (caller supplies `topicType` + target
entity → templated question). §3.2 wants **free-text question → poll-subject LLM → inferred axis +
auto ranked/discussion split**. Phase 3 builds the inference brain and wires it in.

Axis shape (from §3.1) — covers essentially all "best/what" food questions:

```
axis: {
  targetType: 'dish' | 'restaurant',
  constraint?: { kind: 'category'|'cuisine'|'dish_attribute'|'restaurant_attribute', value: string },
  anchor?: string,    // a specific restaurant, e.g. "what to order at Joe's"
  marketHint?: string // locality in the question, e.g. "in LES"
}
```

---

## 3A — Poll-subject prompt + axis inference (the brain) — backend, unambiguous

`LLMService.inferPollSubject(question)` (Lite `gemini-3.1-flash-lite-preview`, MINIMAL thinking,
native `responseJsonSchema`, mirrors `moderateText`/`matchEntity`). Returns
`{ mode: 'ranked'|'discussion', confidence: number, axis: Axis|null, reason }`:

- A rankable food question ("best breakfast sandwich in LES", "what to order at Joe's") →
  `ranked` + the axis (targetType/constraint/anchor/marketHint).
- A non-rankable / open question ("what's your favorite food memory?") → `discussion`, axis null.

New `poll-subject-prompt.md` + `POLL_SUBJECT_RESPONSE_JSON_SCHEMA`. Fail-closed: unparseable →
`discussion` (the safe, no-leaderboard default). **Validate** via a probe over the §3.1 examples.

- **Files:** `prompts/poll-subject-prompt.md`, `llm-response-schemas.ts`, `llm.types.ts`,
  `llm.service.ts`, `scripts/poll-subject-probe.ts`.
- **Dep:** none. **Accept:** probe classifies the §3.1 table correctly (ranked w/ right axis;
  discussion for open questions); fail-closed verified.

---

## 3B — Wire into creation + ranked/discussion split — ⚠️ DECISION NEEDED

§3.2 flow: moderate question → `inferPollSubject` → high-confidence `ranked` (store axis, show a
confirm chip — _frontend_) / low-confidence `discussion` (seamless, no prompt). The fork is the
**user-facing creation contract**:

- **B1 — Free-text path (plan-faithful):** `CreatePollDto` accepts a free-text `question`; createPoll
  runs `inferPollSubject` → sets `mode`/`axis` (+ resolves the axis's target entity for ranked).
  Keep the structured path too (back-compat / power use). New creation model, API contract change,
  frontend builds the free-text input + confirm chip.
- **B2 — Structured + populate axis (minimal):** keep today's structured `topicType`+target form;
  just derive `axis` JSON structurally from it (no free-text inference for user polls). Smaller, but
  NOT the thread-first model the plan wants.

**Recommend B1** (it's the whole point of the redesign) — but it's a real contract decision with
frontend impact, so it's yours to make.

- **Files:** `polls.service.ts` (createPoll), `create-poll.dto.ts`, `polls.controller.ts`.
- **Dep:** 3A. **Accept:** a free-text question creates a ranked poll with a correct axis, or a
  discussion poll; existing structured creation still works.

---

## 3C — Seeded poll axis (structural, no LLM)

Scheduler polls already KNOW their structure (`topicType` + target from demand scoring) — so derive
`axis` directly (no inference) and set it on seeded polls. `mode='ranked'` always.

- **Files:** `poll-scheduler.service.ts`. **Dep:** the axis shape from 3A. **Accept:** seeded polls
  carry a correct structural axis.

---

## 3D — Discussion-mode plumbing

A `discussion` poll has no axis/leaderboard/collection/options. Ensure creation skips option seeding
and the (future) leaderboard projection no-ops for `mode='discussion'`.

- **Files:** `polls.service.ts`, option-seed path. **Dep:** 3B. **Accept:** a discussion poll is a
  pure thread (no options/leaderboard).
