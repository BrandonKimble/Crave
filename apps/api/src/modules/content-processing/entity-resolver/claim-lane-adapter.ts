/**
 * THE ONE HEARING ABSTRACTION — the contract every judging lane implements
 * (architecture red team H5, 2026-08-12).
 *
 * Three lanes in this codebase convene a hearing, pay an LLM for an answer,
 * and then mutate the corpus: word claims (this file's first adopter), entity
 * dedupe, and the satisfies pass. Each grew its own memory — a stamp column, a
 * verdict row, a pass-run ledger — and each therefore re-derived, differently
 * and incompletely, the same four questions: what is the thing being decided,
 * which rule decided it, has the effect actually happened, and who may pay to
 * ask again. The divergences were not stylistic: the word lane could not
 * re-open a wrong YES at all, and the satisfies watermark uses `=` where the
 * label sweep uses `>=`, so one lane re-hears on a rollback and the other
 * does not.
 *
 * NOTHING HERE KNOWS WHAT A CLAIM IS MADE OF. The claim type is generic, the
 * base carries no entity type, no `entity_surface`, no food ontology, and the
 * ledger it feeds stores only (lane, key, rule version, outcome, reason,
 * subject). That is not tidiness — it is the requirement, because the lanes
 * already queued behind this one do not share a shape: dedupe decides about an
 * unordered PAIR of entities, and RESTAURANT-NAME recall admission (C4a) will
 * decide about a proper noun that never faced a judge at all — an active
 * `best` surface on a restaurant named "Best" hard-ANDs every "best X" search
 * to zero results. A base that assumed the word lane's row shape would have to
 * be reopened for each of them.
 *
 * A lane adapts to the ledger by answering exactly one question the ledger
 * cannot answer for it: WHAT IS ONE CLAIM. That is amendment (a), and it is
 * abstract on purpose — the canonicalization is the part every lane gets
 * wrong in its own way (the word lane spent months adjudicating on the
 * accent-destroying recall fold, which made bò and bơ one case), so a new
 * lane must state its answer rather than inherit a plausible default.
 */
export interface ClaimLaneAdapter<TClaim> {
  /** Stored in `claim_verdicts.lane`; namespaces every key this lane mints. */
  readonly lane: string;

  /**
   * THE CLAIM UNIT — the identity of the thing being decided, stable across
   * hearings and independent of which QUESTION was asked about it.
   *
   * Two properties the ledger relies on and cannot check:
   *   - two hearings about the same claim MUST produce the same key, or a
   *     re-hearing writes a second row instead of superseding the first;
   *   - two hearings about different claims MUST NOT collide, or one verdict
   *     silently answers for a claim nobody heard.
   */
  canonicalClaimKey(claim: TClaim): string;

  /**
   * WHICH FOLD SPELLED THE KEY (D-census, 2026-08-13).
   *
   * A key built out of TEXT is a function of the fold that normalized it, and
   * a behavioural fold change re-spells every key ever written — so every
   * stored verdict stops being findable and the whole judged corpus reads as
   * unheard and is re-bought. Silently. The ledger therefore stores this
   * number as part of the claim's identity, and a fold bump re-opens claims
   * through the budgeted drain instead of orphaning them.
   *
   * A lane whose key contains NO folded text declares
   * `UNFOLDED_CLAIM_KEY` — saying "nothing here can drift" out loud, rather
   * than borrowing a version number that does not describe it.
   */
  readonly keyFoldVersion: number;
}

/** The `keyFoldVersion` of a lane whose key contains no folded text at all
 *  (a UUID pair, an opaque id): there is no fold to version. */
export const UNFOLDED_CLAIM_KEY = 0;

/**
 * A lane's adapter as a CLASS, for lanes that want the contract enforced by
 * the type system at construction rather than duck-typed at a call site.
 * `canonicalClaimKey` is abstract — a subclass cannot exist without stating
 * its canonicalization.
 */
export abstract class BaseClaimLaneAdapter<TClaim>
  implements ClaimLaneAdapter<TClaim>
{
  abstract readonly lane: string;
  abstract canonicalClaimKey(claim: TClaim): string;
  abstract readonly keyFoldVersion: number;
}
