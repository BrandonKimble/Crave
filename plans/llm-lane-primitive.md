# THE JUDGE CONTRACT — one primitive for every LLM decision (2026-08-31)

Owner question that prompted this: version keys and tracking are inconsistent
across LLM call sites; every audit finds another site missing a piece. Is
there a shared primitive that makes straying impossible, and makes a NEW
prompt inherit the ideal shape by construction?

## The red team of what exists

The audit (2026-08-31, three-agent census + coordinator verification) found
one pattern implemented ~15 times with ad-hoc coverage. The concerns every
LLM decision system needs, and today's coverage:

| Concern | Mechanism today | Who has it |
|---|---|---|
| Versioned prompt bytes | `llm_prompts` registry (one ACTIVE per kind) | collection + relevance gate ONLY; ~7 prompts load from unversioned .md files (moderation, poll-subject, attribute-name, attribute-placement, cuisine-hub, residue…) |
| Versioned rule semantics | rule release files (`*-rule.ts` with version + fingerprint) | the 9 claim-verdict lanes; nothing else |
| Buy-judgment-once ledger | `claim_verdicts` (lane, claim_key, rule_version, fold_version) | 9 lanes; attribute placement applies un-ledgered effects; dish knowledge uses a bare-string lane outside the adapter |
| Re-open on version bump | 4 DIFFERENT mechanisms: rule_version+fold_version; `prompt_version` columns; cuisine's input fingerprint; gate's prompt_hash | each invented locally |
| No re-open at all | — | poll subject, photo is-food, moderation: permanent by ACCIDENT, not by declared policy |
| Replayable decision record | `llm_decision_records` | 4 kinds, arbitrary |
| Certification gate (gold ×3) | per-prompt scripts + fixtures | the rhino-method prompts; nothing structural requires one |
| Cost attribution | ledger caller tags | good coverage, but tag names are free-form strings |

Four version mechanisms = four ways to forget one. Proof this bites, not
theory: the fold v2 bump (2026-08-30) re-stamped identity_key thinking and
forgot the LEDGER read filter — 152k verdicts went invisible; every word
re-judged, every match re-bought, silently, until the 08-31 audit. The 47
wrong merges: "the judge announced every bad merge in its reason and nothing
read it" — an effect applied without a ledger row nobody can audit. Each
past incident in this class is a missing cell in the table above.

Red team of centralization itself (the other direction): lanes genuinely
differ — grounding keys on an unfolded id, the gate keys per-post on a
prompt hash, some decisions SHOULD be permanent (a username moderated at
submission time). A primitive that forbids difference will be fought and
forked. The failure mode to prevent is not difference — it is UNDECLARED
difference.

## The from-scratch shape

The repo already contains the answer twice, proven:
- `DerivedIndexJob` — every derived table MUST have a job; the spec fails
  the build if one lacks it.
- `BaseClaimLaneAdapter` — a lane subclass cannot exist without declaring
  its claim key and fold participation (abstract members).

Generalize: **one declared contract per LLM decision site, enforced by the
gateway + an invariant, with every deviation an explicit declared field.**

```ts
interface JudgeContract {
  lane: string;                 // glossary plain name, unique, registered
  promptKind: string;           // llm_prompts registry key — ALL bytes versioned there
  rule: RuleRelease;            // version + fingerprint + gold-suite path
  claimKey: (input) => string;  // canonical key spec
  foldParticipation: number | UNFOLDED;
  reopenOn: 'rule_version' | 'input_fingerprint' | { final: string /* reason */ };
  ledger: 'claim_verdicts' | { unledgered: string /* reason, e.g. pure quarantine */ };
  record: boolean;              // llm_decision_records mirroring
  effectSeparation: true;       // verdict-then-effect is not optional
}
```

Enforcement (three teeth, all patterns already proven in-repo):
1. **The gateway refuses undeclared callers.** One-gateway law already
   routes every call through LLMService; it gains a registry check — a call
   whose caller tag is not a registered JudgeContract lane throws in dev/CI
   and screams in prod. A new agent CANNOT add a stray prompt; the first
   test run fails until the contract is declared.
2. **The invariant registry proves each tooth bites** (existing
   `yarn invariants` mutation-proof pattern): mutate a contract field →
   the check must go RED.
3. **check-fold-drift's stranded-ledger clause** (added 2026-08-31)
   generalizes: any store stamped with a version the current code no longer
   reads is a failed check, for EVERY reopenOn mechanism — one query per
   declared contract, generated from the registry, not hand-written.

What unifies, what stays: `claim_verdicts` becomes the ONLY memory (the
gate's per-post ledger and cuisine's fingerprint both express naturally as
claim keys: post_id+prompt_hash and place+input_fingerprint are just claim
key recipes — `reopenOn: 'input_fingerprint'` IS the cuisine mechanism,
named instead of bespoke). Permanent decisions stay permanent but say so:
`reopenOn: { final: 'a username is judged at submission time' }`.

## Migration (post-load; structural, zero data risk)

1. Declare `JudgeContract` + registry; wrap the 9 conforming lanes (pure
   re-plumbing, behavior identical).
2. Move the ~7 unversioned prompts into `llm_prompts` (bytes only — no
   behavior change; each gains a version history the day it moves).
3. Declare contracts for the un-ledgered sites (attribute placement gets a
   real lane — the 47-merge lesson; poll subject / photo gate / moderation
   declare `final` with reasons).
4. Flip the gateway check from warn → throw. From then on the ideal shape
   is the only shape that compiles.

Sequencing: after the Austin load settles. Nothing here touches data; it is
the guard rail for every prompt that comes after.
