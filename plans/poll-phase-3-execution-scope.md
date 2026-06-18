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

## 3B — Wire into creation + ranked/discussion split — ✅ DECIDED: B1 (free-text, additive)

**Decision (2026-06): B1.** `CreatePollDto` gains a free-text `question`; createPoll moderates it,
runs `inferPollSubject` → sets `mode`/`axis`. The existing structured path stays (scheduler /
back-compat). Frontend builds the free-text input + confirm chip when ready.

**Build shape (the clean factoring):** a free-text RANKED question derives the existing structured
inputs from its axis and **reuses the current createPoll flow** (target resolution + topic/poll
creation), then stamps `poll.axis` + `mode='ranked'`. Map axis → the 4 existing topicTypes:

| axis                                         | topicType                 | target resolved as                   |
| -------------------------------------------- | ------------------------- | ------------------------------------ |
| dish + anchor                                | what_to_order             | restaurant (the anchor)              |
| dish + constraint category                   | best_dish                 | food (category value)                |
| dish + constraint dish_attribute             | best_dish_attribute       | food_attribute                       |
| restaurant + constraint restaurant_attribute | best_restaurant_attribute | restaurant_attribute                 |
| restaurant + constraint cuisine              | best_restaurant_attribute | restaurant_attribute (cuisine value) |
| (vague / unmappable ranked)                  | —                         | fall back to `discussion` (safe)     |

**⚠️ Prerequisite found (schema):** a `discussion` poll has **no topic** — but today `Poll.topicId`
is REQUIRED (non-null FK) and `PollTopic.topicType` is required. So **`Poll.topicId` must become
nullable** (small migration) before discussion polls can be created without a fake topic. Phase 2
added `mode` but not this nullability. → 3B starts with that migration, then the createPoll branch.

- **Files:** migration (`Poll.topicId` nullable), `polls.service.ts` (createPoll free-text branch +
  axis→structured mapper + discussion path), `create-poll.dto.ts` (add `question?`), `polls.controller.ts`.
- **Dep:** 3A ✅. **Accept:** a free-text "best …" question creates a ranked poll with the right
  resolved target + stored axis; an open question creates a topic-less discussion poll; existing
  structured creation still works.

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
