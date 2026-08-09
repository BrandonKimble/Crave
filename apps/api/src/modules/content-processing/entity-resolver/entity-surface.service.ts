import { Prisma } from '@prisma/client';
import {
  canonicalFold,
  diacriticFold,
  isDisplayable,
  normalizeSurface,
} from './entity-identity';
import { localeLookupChain, normalizeLocaleTag } from '../../../shared/locale';

/**
 * THE SURFACE WRITER (multilingual plan A1) — the ONE writer of
 * `entity_surface`.
 *
 * Before this, seven independent sites hand-appended to an untagged
 * `text[]`: two verbatim-copied merge folds, the ontology rename
 * demotion, extraction banking, extraction create, the dish-knowledge
 * LLM pass, Places enrichment and cuisine extraction. Zero provenance,
 * zero language tag, no folded mirror — feeding confidence-1.0 grounding
 * AND the dense embedding doc.
 *
 * The shape now: `entity_surface` ROWS are the ONLY truth (form + APP-FOLDED
 * mirror + BCP-47 locale + role + source + confidence + status). This is the
 * identity_key precedent — one app function owns the write, the DB stores and
 * indexes.
 *
 * THE DERIVED `core_entities.aliases[]` PROJECTION IS GONE (§11 item 4 / I-2,
 * 2026-08-09). It was an untagged, unfolded, role-blind SHADOW of this table:
 * a second copy that could only ever agree with the rows by the grace of a
 * writer nobody could see from the read side, and whose case-sensitive array
 * overlap silently cost real recall ("santo taco" never matched the banked
 * surface "Santo Taco"). Every reader now asks this table directly, folded and
 * scoped, so there is no second copy to drift and no order to preserve.
 *
 * THE FOLD LAW: form_folded is written HERE via canonicalFold and only
 * here. No SQL fold expression, no generated column, no expression index
 * over a fold — Postgres Unicode character classes are platform-dependent
 * and a SQL mirror can never be trusted across environments.
 *
 * ONE STORE, TWO ROLES (surface merge, §11-2, 2026-08-09). `entity_labels`
 * is gone: display and recall were never two concepts, only two ROLES of
 * one row, and the standing reconciler that copied one store into the other
 * was the proof. `role` is 'recall' (grounds, never rendered), 'display'
 * (rendered, never grounds) or 'both'.
 *
 * 'display' IS THE GUARD'S VERDICT, NOT A SEPARATE SPECIES. A display form
 * is offered for recall exactly once — here, when its row is created. If
 * the collision guard refuses it (the word already names another concept),
 * the row still lands so the user can READ it, DEGRADED to role='display'.
 * That single row is simultaneously the label and the memory that its
 * recall claim lost, which is why no reconciliation pass exists or can.
 */

/** A surface form to bank on an entity. */
export interface SurfaceInput {
  /** The verbatim surface, case-preserved. Trimmed and whitespace-collapsed here. */
  form: string;
  /**
   * Canonical BCP 47 (R5-5: FULL tags — 'es-MX', 'zh-Hans', not bare
   * 'es'/'zh'). Omit for untagged/unknown-language surfaces; defaults to
   * 'und'. A FABRICATED tag is worse than none — it poisons both
   * languages' retrieval with no rollback.
   */
  locale?: string;
  /** Provenance. Must be one of the CHECK-constrained source values. */
  source: SurfaceSource;
  /** Writer's confidence in the pairing. Defaults to 1 (asserted, not inferred). */
  confidence?: number;
  /**
   * 'active' (default) is live for recall and display; 'candidate' is
   * banked but withheld until judged; 'deprecated' is remembered as WRONG so
   * query spam cannot re-propose it forever (R5-6b).
   */
  status?: SurfaceStatus;
  /**
   * 'recall' (default) — a corpus/query surface that grounds and is never
   * rendered. 'display' — a label the user reads, making NO recall claim.
   * 'both' — a label that also claims the word for recall; the collision
   * guard adjudicates that claim and DEGRADES the row to 'display' if it
   * loses, so a 'both' offer never costs the user the label.
   */
  role?: SurfaceRole;
  /** Display-side: the R5-6(a) per-locale disambiguator ("pan"). */
  description?: string | null;
  /**
   * Display-side: elect this form the default label for (entity, locale)
   * IF none exists yet. Election happens INSIDE the insert (F9342) — there
   * is no read-then-write window — and the partial unique
   * `uq_entity_surface_one_default` is the final arbiter.
   */
  isDefault?: boolean;
  /** Display-side ordering within a locale. */
  rank?: number;
  /** Display-side: the vocabulary-prompt version that produced the form. */
  promptVersion?: number;
  /**
   * The JUDGE version that settled this row's word claim. Only the
   * adjudicator sets it (its writes are the only ones that settle anything);
   * every other writer leaves it NULL, which reads as "never heard".
   */
  claimJudgeVersion?: number | null;
}

export type SurfaceRole = 'display' | 'recall' | 'both';

/** Does this role make a RECALL claim (and so face the collision guard)? */
function claimsRecall(role: SurfaceRole): boolean {
  return role !== 'display';
}

export type SurfaceSource =
  | 'legacy'
  | 'merge_fold'
  | 'ontology_rename'
  | 'extraction'
  | 'knowledge_synthesis'
  | 'places'
  | 'cuisine'
  | 'query_banking'
  | 'vocabulary'
  | 'seed'
  // The display half's provenances, merged in with its rows (§11-2).
  | 'sweep'
  | 'manual'
  | 'synthesis';

export type SurfaceStatus = 'candidate' | 'active' | 'deprecated';

/**
 * SOURCES WHOSE FORMS ARE *INFERRED*, NOT OBSERVED — the ones the collision
 * guard below polices.
 *
 * This is the testimony/knowledge doctrine applied to surfaces
 * (testimony-knowledge-doctrine.md). An EXTRACTION surface is testimony: a real
 * person really did call that thing that word, so it is evidence even when it
 * collides with something else — 1,699 of 21,662 active alias forms (7.8%)
 * already collide with a different entity's name, and refusing those would be
 * refusing reality. A KNOWLEDGE surface is inferred by a model, and a collision
 * there is the model being wrong.
 *
 * Measured cause (i18n red team, 2026-08-05): the enumeration pass emitted
 * `soup -> caldo` and `caldo -> sopa` — same-language near-synonyms, not
 * translations. `caldo` already existed as an entity NAME, so the inferred
 * alias ground a different concept at confidence 1.0 and was the ONLY
 * regression in an otherwise +19.4-point run. Grounding is an equality claim;
 * an inferred form that already names something else cannot make it.
 */
const INFERRED_SURFACE_SOURCES: ReadonlySet<SurfaceSource> = new Set([
  'knowledge_synthesis',
  'vocabulary',
  'seed',
  'query_banking',
  // Merged in with the display half: a label sweep and a knowledge
  // synthesis are both a model asserting a word, so both are inference.
  // 'manual' is a human, which is testimony.
  'sweep',
  'synthesis',
]);

/** Non-exported brand: only mintWordClaimVerdict (below) can construct a
 *  WordClaimVerdict, so `adjudicated: true` is UNREPRESENTABLE at call
 *  sites — a bypasser must deliberately import the named escape hatch
 *  (F9968: the boolean was pure convention; 22 other callers could have
 *  typed it and nothing would object). */
const ADJUDICATED_BRAND: unique symbol = Symbol('word-claim-verdict');
export type WordClaimVerdict = { readonly [ADJUDICATED_BRAND]: true };
/** THE ONLY DOOR past the collision guard. Importing this anywhere but
 *  WordClaimAdjudicatorService is an invariant violation (single-importer
 *  spec in word-claim-verdict-single-importer.spec.ts). */
export function mintWordClaimVerdict(): WordClaimVerdict {
  return { [ADJUDICATED_BRAND]: true } as WordClaimVerdict;
}

const EMPTY_FOLD_SET: ReadonlySet<string> = new Set<string>();

/**
 * THE CLAIM UNIT IS THE FORM, NOT THE FOLD (2026-08-09).
 *
 * A word-ownership claim is a claim on a WORD. `canonicalFold` — the RECALL
 * key — deliberately destroys accents so that a US-keyboard 'bo' still reaches
 * bò; it is a deliberately coarse retrieval key, and it was never an identity.
 * Adjudicating on it asks an unanswerable question in every language whose
 * accents are phonemic: bò (beef), bơ (butter/avocado) and bó (bunch) all fold
 * to `bo`, so every hearing between two Vietnamese words was a FALSE CONFLICT
 * where BOTH outcomes are wrong — measured: re-hearing the refused claims, 5 of
 * 5 would now EVICT a correct incumbent, and the judge flipped 60% of its own
 * verdicts on re-ask, which is what an unanswerable question looks like.
 *
 * So the guard and the judge see a conflict only when the two claimants want
 * the SAME WORD: same letters, same accents. Case and punctuation still fold
 * (Caldo == caldo, Phil's == Phils) because those are spellings of one word;
 * accents are not. Every measured regression that built the strict guard is an
 * IDENTICAL-form collision and stays blocked: caldo->soup, helado->iced,
 * picante->hot sauce.
 *
 * RECALL IS UNCHANGED — still `form_folded`. Typing 'bo' still surfaces beef,
 * butter and avocado as competing spans; that is placement's job, and it
 * already does it (the picante precedent). This function is ONLY ever the
 * claim/adjudication key; no read path may use it as a match key.
 */
export function surfaceClaimKey(form: string): string {
  return diacriticFold(form);
}

export interface AddSurfacesOptions {
  /**
   * Forms to DEMOTE to 'deprecated' — the ontology rename's "drop the new
   * display name from the recall set" half. Matched on the folded form (canonicalFold), so demotion is
   * collation-independent. Demotion is remembered; a plain delete would let
   * the next writer re-add the same form.
   */
  deprecateForms?: string[];
  /**
   * Mark the dense doc stale. Surface forms feed the entity embedding doc,
   * so every caller that adds or demotes one also sets this. Default true
   * when the write actually changed something; pass false to suppress (the
   * create path embeds fresh anyway).
   */
  markEmbeddingStale?: boolean;
  /** Also touch `last_updated` (the extraction banking site does). */
  touchLastUpdated?: boolean;
  /**
   * The write carries a WORD-CLAIM JUDGMENT (WordClaimAdjudicatorService):
   * the collision guard is SKIPPED because the judge already ruled on this
   * exact conflict — a 'both win' verdict is precisely a sanctioned
   * collision, and re-applying the guard made that verdict unwritable
   * (862 claims looped forever, found 2026-08-08). BRANDED (F9968): a
   * boolean was pure convention — this type is only constructible via
   * mintWordClaimVerdict, so a bypass cannot be typed, only imported.
   */
  adjudicated?: WordClaimVerdict;
}

/**
 * Bank surface forms on an entity. Idempotent per (entity, locale, form).
 *
 * Runs inside the caller's transaction — surface rows must be atomic with
 * whatever else the caller is doing (a merge that archived the loser but lost
 * its names would be unrecoverable).
 *
 * @returns the forms the collision guard refused. The refusals are returned
 *   because they are otherwise INVISIBLE: nothing about a blocked write shows
 *   up in the row set, so a run where the guard blocked every surface would
 *   look identical to a perfect one. A guard whose blast radius cannot be seen
 *   is a guard nobody can trust.
 */
export async function addSurfaces(
  tx: Prisma.TransactionClient,
  entityId: string,
  forms: SurfaceInput[],
  options: AddSurfacesOptions = {},
): Promise<{ blocked: string[] }> {
  const rows: Array<
    Required<Omit<SurfaceInput, 'locale' | 'description'>> & {
      locale: string;
      description: string | null;
    }
  > = [];
  const seen = new Set<string>();
  for (const input of forms) {
    const form = normalizeSurface(input.form ?? '');
    // Skip blank AND invisible surfaces (whitespace/punctuation/zero-width
    // only) — an alias with no letter or digit is not a recall key.
    if (!isDisplayable(form)) {
      continue;
    }
    const locale = normalizeLocaleTag(input.locale);
    const dedupeKey = `${locale} ${form}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    rows.push({
      form,
      locale,
      source: input.source,
      confidence: input.confidence ?? 1,
      status: input.status ?? 'active',
      role: input.role ?? 'recall',
      description: input.description ?? null,
      isDefault: input.isDefault ?? false,
      rank: input.rank ?? 0,
      promptVersion: input.promptVersion ?? 1,
      claimJudgeVersion: input.claimJudgeVersion ?? null,
    });
  }

  // P0-b COLLISION GUARD — inferred forms only (see INFERRED_SURFACE_SOURCES).
  // An inferred surface that already names ANOTHER entity, or is already
  // another entity's active alias, is refused: it would ground the wrong
  // concept at confidence 1.0, and the ranking invariant means a wrong
  // grounding with a high Crave Score ranks FIRST. Observed surfaces are
  // exempt — they are evidence, not inference.
  //
  // ONLY A RECALL CLAIM IS POLICED (surface merge, §11-2). A role='display'
  // row grounds nothing, so it cannot ground the WRONG thing — there is no
  // claim to refuse. A role='both' row that loses is not dropped: it is
  // DEGRADED to 'display', so the user keeps the label while the word stays
  // with its rightful owner. That degradation is what makes a standing
  // label/alias reconciler both unnecessary and impossible.
  const blockedForms: string[] = [];
  // EVERY RECALL CLAIM IS PROBED, not only the inferred ones (F-red-team A).
  // The probe answers ONE question — "does another entity already hold this
  // word for recall?" — and its answer is used TWICE, differently:
  //   - an INFERRED claim on a contested word is REFUSED outright (below);
  //   - ANY claim on a contested word, inferred or observed, may not WIDEN an
  //     existing role='display' row into a recall claim (insertSurfaceRows).
  // Observed sources stay testimony for their OWN new row — a real person
  // really said it — but a row already SITTING at 'display' got there by a
  // refusal or by being a label, and turning it into a recall key is a fresh
  // claim on the word. Testimony that a person said a word is not testimony
  // that a previously-lost claim was wrongly decided.
  const claimants = rows.filter(
    // A 'deprecated' write is the adjudicator RECORDING a lost claim
    // (remembered-wrong, R5-6b) — it is never active and grounds nothing.
    (r) => claimsRecall(r.role) && r.status !== 'deprecated',
  );
  let contested: ReadonlySet<string> = EMPTY_FOLD_SET;
  if (claimants.length > 0 && !options.adjudicated) {
    const foldedCandidates = Array.from(
      new Set(claimants.map((r) => canonicalFold(r.form)).filter(Boolean)),
    );
    if (foldedCandidates.length > 0) {
      // THE FOLD NARROWS, THE FORM DECIDES. The folded columns are the indexed
      // ones (`identity_key`, `idx_entity_surface_form_folded`), so the fold is
      // still how the candidate set is FETCHED — it is a superset of the real
      // conflicts by construction (two identical forms always share a fold).
      // The claim key is then applied app-side, where the ONE fold
      // implementation lives (the fold law: no SQL fold expression, ever, and
      // that applies to the accent-preserving twin as much as to canonicalFold).
      const collisions = await tx.$queryRaw<Array<{ form: string }>>`
        SELECT e.name AS form
          FROM core_entities e
         WHERE e.identity_key = ANY(${foldedCandidates}::text[])
           AND e.entity_id <> ${entityId}::uuid
           AND e.status <> 'archived'::entity_status
        UNION
        SELECT ea.form
          FROM entity_surface ea
         WHERE ea.form_folded = ANY(${foldedCandidates}::text[])
           AND ea.entity_id <> ${entityId}::uuid
           AND ea.status = 'active'
           -- A role='display' row HOLDS NOTHING: its recall claim was refused
           -- or never made, so it contests no one (the same predicate the
           -- adjudicator's incumbentsOf carries). Without this, a claim the
           -- judge already settled would keep blocking the winner forever —
           -- the degraded loser would go on squatting the word it lost.
           AND ea.role <> 'display'`;
      // SELF-REDUNDANCY: an inferred surface identical to the entity's OWN
      // name teaches nothing — the name arm already matches it in every
      // locale, so a locale-tagged copy is noise that also asserts the English
      // name is a word in that language. Deterministic, unlike relying on the
      // model to flag a proper noun (it does not do so consistently).
      // FORM-SCOPED like every other claim test: "phở" is not the English name
      // "pho" spelled again, it is the Vietnamese word, and the name arm cannot
      // teach the accents it does not carry.
      const self = await tx.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM core_entities WHERE entity_id = ${entityId}::uuid`;
      const ownForm = self[0]?.name ?? null;
      const claimed = new Set(claimants.map((r) => surfaceClaimKey(r.form)));
      contested = new Set(
        collisions
          .map((c) => surfaceClaimKey(c.form))
          .filter((key) => claimed.has(key)),
      );
      const refused = new Set(contested);
      if (ownForm) {
        const ownKey = surfaceClaimKey(ownForm);
        if (claimed.has(ownKey)) {
          refused.add(ownKey);
        }
      }
      if (refused.size > 0) {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i];
          if (
            INFERRED_SURFACE_SOURCES.has(row.source) &&
            claimsRecall(row.role) &&
            row.status !== 'deprecated' &&
            refused.has(surfaceClaimKey(row.form))
          ) {
            blockedForms.push(row.form);
            if (row.role === 'both') {
              row.role = 'display';
            } else {
              rows.splice(i, 1);
            }
          }
        }
      }
    }
  }

  // TWO STATEMENTS, ONE LAW. `mayWiden` is not a mode: it is the answer to
  // "was this write's recall claim EARNED?", and a row can only be in one
  // group. An adjudicated write carries the verdict; an unadjudicated one
  // earns it by finding the word uncontested. The split exists because the
  // authority is PER ROW while `EXCLUDED` can only carry table columns.
  let touched = 0;
  const earned: SurfaceRow[] = [];
  const unearned: SurfaceRow[] = [];
  for (const row of rows) {
    const mayWiden =
      options.adjudicated !== undefined ||
      (claimsRecall(row.role) && !contested.has(surfaceClaimKey(row.form)));
    (mayWiden ? earned : unearned).push(row);
  }
  for (const [group, mayWiden] of [
    [earned, true],
    [unearned, false],
  ] as const) {
    if (group.length === 0) continue;
    const landed = await insertSurfaceRows(tx, entityId, group, false, {
      mayWiden,
      adjudicated: options.adjudicated !== undefined,
    });
    touched += landed.length;
    // THE REFUSAL IS OBSERVED, NOT ASSUMED. A row whose write asked for recall
    // and came back 'display' was refused the widening by the statement above.
    // Reporting it keeps the guard's blast radius visible on every path (the
    // same reason `blocked` exists at all) instead of only on the inferred one.
    const wanted = new Map(group.map((r) => [r.form, r.role]));
    for (const row of landed) {
      const asked = wanted.get(row.form);
      if (asked && claimsRecall(asked) && row.role === 'display') {
        blockedForms.push(row.form);
      }
    }
  }

  // Match on the app-written `form_folded`, NOT `lower(form)`: JS
  // `.toLowerCase()` and Postgres `lower()` disagree (Turkish İ → i+U+0307 vs
  // i), so the old `lower(form) = ANY(js-lowercased)` demotion SILENTLY no-op'd
  // on any such form — leaving a wrong surface feeding confidence-1.0 grounding
  // forever. canonicalFold is the ONE collation-independent key both sides
  // share (the fold law above), so the comparison is exact by construction.
  const deprecate = (options.deprecateForms ?? [])
    .map((form) => canonicalFold(normalizeSurface(form ?? '')))
    .filter((folded) => folded.length > 0);
  if (deprecate.length > 0) {
    touched += await tx.$executeRaw`
      UPDATE entity_surface SET status = 'deprecated'
      WHERE entity_id = ${entityId}::uuid
        AND form_folded = ANY(${deprecate}::text[])
        AND status <> 'deprecated'`;
  }

  await markEntityTouched(tx, entityId, touched, options);
  return { blocked: blockedForms };
}

/**
 * The entity-level side effects of a surface write: the dense doc is now
 * stale, and (for the banking sites that ask) `last_updated` moves.
 *
 * `touched` is the number of rows the write landed on — inserts plus
 * demotions that actually demoted. Because the insert's `ON CONFLICT DO
 * UPDATE` counts a re-offer of an existing form as affected, this errs
 * toward re-embedding a doc that did not change; that is the cheap side of
 * the trade, and the expensive side (a doc that silently went stale) is what
 * the counter exists to prevent. This replaces the old "did the derived
 * array come out different" test, which
 * could only ever be an approximation of the same question and needed a row
 * lock to be safe. The row lock is gone with it: with no derived array to
 * read-then-blind-write, two concurrent writers can no longer lose each
 * other's forms — `ON CONFLICT` makes the inserts commutative (F1's executed
 * lost-update is structurally impossible now, not merely serialized away).
 */
async function markEntityTouched(
  tx: Prisma.TransactionClient,
  entityId: string,
  touched: number,
  options: Pick<AddSurfacesOptions, 'markEmbeddingStale' | 'touchLastUpdated'>,
): Promise<void> {
  if (touched <= 0) {
    return;
  }
  const stale = options.markEmbeddingStale !== false;
  if (!stale && options.touchLastUpdated !== true) {
    return;
  }
  await tx.$executeRaw`
    UPDATE core_entities
    SET name_embedding_stale = CASE WHEN ${stale} THEN true ELSE name_embedding_stale END,
        last_updated = CASE WHEN ${options.touchLastUpdated === true}
                            THEN now() ELSE last_updated END
    WHERE entity_id = ${entityId}::uuid`;
}

interface SurfaceRow {
  form: string;
  locale: string;
  source: SurfaceSource;
  confidence: number;
  status: SurfaceStatus;
  role: SurfaceRole;
  description: string | null;
  isDefault: boolean;
  rank: number;
  promptVersion: number;
  claimJudgeVersion: number | null;
}

/**
 * The ONE insert. Two things happen here that used to live in two writers.
 *
 * THE DEFAULT ELECTION IS ATOMIC (F9342, carried over from the label
 * writer): `is_default` is decided IN the statement as "this row wants it
 * AND no default exists for this (entity, locale)", so there is no
 * read-then-write window two concurrent writers can both pass. The partial
 * unique `uq_entity_surface_one_default` arbitrates the one genuinely
 * simultaneous case, and `forceNonDefault` is its retry: a default already
 * exists, so this row simply is not it.
 *
 * THE CONFLICT CLAUSE MERGES ROLES rather than dropping the write, but ONLY
 * ONE DIRECTION IS FREE. A display write landing on a recall row means the
 * form is now read as well as matched — label-ness is not adjudicated, so it
 * widens. The reverse is a RECALL CLAIM on a word that is already sitting at
 * 'display', i.e. a word whose claim was refused or never made, and it widens
 * only when `mayWiden` says the claim was earned — by an adjudicated verdict,
 * or by the collision probe finding the word uncontested. Before this, ANY
 * source could widen unconditionally, so an observed `ON CONFLICT` write
 * silently overturned a verdict the judge had recorded.
 *
 * STATUS NEVER CLIMBS OUT OF 'deprecated' EXCEPT BY VERDICT. 'deprecated' is
 * the memory that a form is WRONG (R5-6b); a re-offer from any writer, at any
 * role, must not resurrect it — only the adjudicator, which is the thing that
 * put it there, can. (The old clause preserved status only when the incoming
 * role was 'recall', so a role='both' re-offer flipped deprecated back to
 * active and the memory was gone.)
 */
async function insertSurfaceRows(
  tx: Prisma.TransactionClient,
  entityId: string,
  rows: SurfaceRow[],
  forceNonDefault: boolean,
  authority: { mayWiden: boolean; adjudicated: boolean },
): Promise<Array<{ form: string; role: SurfaceRole }>> {
  const values = Prisma.join(
    rows.map((r) => {
      const wantsDefault =
        !forceNonDefault &&
        r.isDefault &&
        r.status === 'active' &&
        r.role !== 'recall';
      const isDefaultExpr = wantsDefault
        ? Prisma.sql`NOT EXISTS (
            SELECT 1 FROM entity_surface d
             WHERE d.entity_id = ${entityId}::uuid
               AND d.locale = ${r.locale}
               AND d.is_default)`
        : Prisma.sql`false`;
      return Prisma.sql`(${entityId}::uuid, ${r.form}, ${canonicalFold(r.form)}, ${r.locale}, ${r.role}, ${r.source}, ${r.confidence}, ${r.status}, ${r.description}, ${isDefaultExpr}, ${r.rank}, ${r.promptVersion}, ${r.claimJudgeVersion})`;
    }),
  );
  // The one place widening authority is spent. `mayWiden=false` PINS an
  // existing 'display' row at 'display': the incoming recall claim was not
  // earned, so it does not land, and the row goes on being both the label and
  // the memory that its claim lost.
  // A VERDICT IS AUTHORITATIVE IN BOTH DIRECTIONS (2026-08-09, the re-hearing
  // law). 'deprecated' and 'display' are the memories of a claim that LOST a
  // hearing — and the adjudicator is the only thing that can put them there,
  // so it must also be the one thing that can lift them. Before this, an
  // adjudicated re-bank of a previously-refused form kept the row deprecated
  // and pinned at 'display': the judge could rule for a word it had once
  // refused and NOTHING would change in the corpus, which is precisely why
  // wrong verdicts had to be undone by hand. A re-hearing that the newcomer
  // WINS now lands the row exactly as the verdict says.
  const roleExpr = authority.adjudicated
    ? Prisma.sql`CASE WHEN entity_surface.role = EXCLUDED.role
                      THEN entity_surface.role ELSE 'both' END`
    : authority.mayWiden
      ? Prisma.sql`CASE WHEN entity_surface.status = 'deprecated'
                            AND EXCLUDED.role <> 'recall' THEN 'display'
                      WHEN entity_surface.role = EXCLUDED.role
                      THEN entity_surface.role ELSE 'both' END`
      : Prisma.sql`CASE WHEN entity_surface.status = 'deprecated'
                            AND EXCLUDED.role <> 'recall' THEN 'display'
                      WHEN entity_surface.role = EXCLUDED.role
                      THEN entity_surface.role
                      WHEN entity_surface.role = 'display' THEN 'display'
                      ELSE 'both' END`;
  const statusExpr = authority.adjudicated
    ? Prisma.sql`EXCLUDED.status`
    : // A DEPRECATED ROW MAY STILL BECOME A LABEL — and only a label.
      // 'deprecated' is the memory that a RECALL claim lost (R5-6b), and since
      // eviction stopped destroying labels (0e439c897) the settled encoding of
      // "this row does not ground" is role='display', not a status nobody can
      // read. Left as-is, a word the judge refused could never afterwards be
      // rendered: the display read requires status='active', so the sweep's
      // label landed invisible AND — failing the watermark's
      // status IN ('active','candidate') — was re-offered every night forever
      // (found 2026-08-09 on `cháo`, congee vs porridge). So a write that asks
      // for a DISPLAY role lifts the status and is PINNED to 'display' by the
      // role expression above: the user gets the label, the word stays lost,
      // and the memory is the role. A pure recall re-offer lifts nothing.
      Prisma.sql`CASE WHEN entity_surface.status = 'deprecated'
                      THEN CASE WHEN EXCLUDED.role = 'recall'
                                THEN 'deprecated' ELSE EXCLUDED.status END
                      WHEN EXCLUDED.role = 'recall'
                      THEN entity_surface.status ELSE EXCLUDED.status END`;
  try {
    // Prisma.sql, not a bare tagged template: `roleExpr`/`statusExpr` are SQL
    // FRAGMENTS chosen by the authority above, and they must arrive as
    // predicates, never as bind parameters.
    return await tx.$queryRaw<
      Array<{ form: string; role: SurfaceRole }>
    >(Prisma.sql`
      INSERT INTO entity_surface
        (entity_id, form, form_folded, locale, role, source, confidence,
         status, description, is_default, rank, prompt_version,
         claim_judge_version)
      VALUES ${values}
      ON CONFLICT (entity_id, locale, form) DO UPDATE SET
        role = ${roleExpr},
        status = ${statusExpr},
        description = CASE WHEN EXCLUDED.role = 'recall'
                           THEN entity_surface.description
                           ELSE EXCLUDED.description END,
        rank = CASE WHEN EXCLUDED.role = 'recall'
                    THEN entity_surface.rank ELSE EXCLUDED.rank END,
        prompt_version = GREATEST(entity_surface.prompt_version,
                                  EXCLUDED.prompt_version),
        -- The stamp records WHO last settled this claim. Only a verdict
        -- carries one, so an ordinary re-offer leaves the existing stamp
        -- alone (COALESCE) rather than erasing the hearing's memory.
        claim_judge_version = COALESCE(EXCLUDED.claim_judge_version,
                                       entity_surface.claim_judge_version),
        updated_at = now()
      RETURNING form, role`);
  } catch (error) {
    if (
      !forceNonDefault &&
      error instanceof Error &&
      error.message.includes('uq_entity_surface_one_default')
    ) {
      return insertSurfaceRows(tx, entityId, rows, true, authority);
    }
    throw error;
  }
}

/**
 * The MERGE FOLD, as one call: bank the loser's name + all of its alias
 * forms onto the winner, carrying each loser row's ORIGINAL locale and
 * provenance instead of flattening them (the array fold destroyed both).
 * Replaced the two verbatim-copied `array_agg(DISTINCT unnest(...))`
 * statements in finalizeMergeCompletion and the ontology merge.
 */
export async function foldSurfacesFromMerge(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
  options: AddSurfacesOptions = {},
): Promise<void> {
  // The loser's own display name becomes a surface on the winner. role is
  // STATED, not defaulted: an entity's name is a recall key (that is what a
  // merge fold is for), and a column default is not a decision anyone made.
  await tx.$executeRaw`
    INSERT INTO entity_surface
      (entity_id, form, form_folded, locale, role, source, confidence, status)
    SELECT ${canonicalId}::uuid, x.name, x.identity_key, 'und', 'recall', 'merge_fold', 1, 'active'
    FROM core_entities x
    WHERE x.entity_id = ${duplicateId}::uuid
      AND x.identity_key IS NOT NULL
    ON CONFLICT (entity_id, locale, form) DO NOTHING`;
  // NOTE: identity_key IS canonicalFold(name), APP-WRITTEN by
  // identityInsertData — reusing it is reading a stored fold, not
  // computing one in SQL. Names with no foldable identity (emoji-only)
  // carry NULL and are skipped: an unfoldable surface is not a recall key.

  // The loser's surface rows carry over WITH their locale, provenance, ROLE
  // and status. Role was omitted here once, so the column default 'recall'
  // laundered every loser row into a recall claim on the winner: a form the
  // collision guard had REFUSED (role='display') came back as an active
  // recall surface, and a merge — which decides nothing about word ownership
  // — silently overturned a verdict. A carried row is the SAME row on a new
  // owner; it earns nothing by moving.
  await tx.$executeRaw`
    INSERT INTO entity_surface
      (entity_id, form, form_folded, locale, role, source, confidence, status)
    SELECT ${canonicalId}::uuid, a.form, a.form_folded, a.locale, a.role, a.source, a.confidence, a.status
    FROM entity_surface a
    WHERE a.entity_id = ${duplicateId}::uuid
    ON CONFLICT (entity_id, locale, form) DO NOTHING`;

  // Merge-fold carries OBSERVED surfaces (testimony), which the collision
  // guard exempts, so there is nothing to report refusing — the fold returns
  // nothing and no caller has ever wanted more.
  //
  // The winner's dense doc must be re-embedded: it just gained the loser's
  // names. `touched` is 1 unconditionally rather than a row count because the
  // two statements above are `ON CONFLICT DO NOTHING` bulk inserts whose
  // affected-row counts already tell us nothing useful about whether the doc
  // changed (a re-run of an idempotent merge legitimately inserts zero), and
  // an unnecessary re-embed is cheap while a missed one is silent staleness.
  await markEntityTouched(tx, canonicalId, 1, options);
}

/**
 * THE RECALL SLICE, as a SQL predicate — the successor to every
 * `unnest(e.aliases)` arm. Alias the surface table `s`.
 *
 * Three predicates, and each one is load-bearing:
 *   - `status = 'active'` — a 'candidate' form is banked but unjudged, and a
 *     'deprecated' form is REMEMBERED AS WRONG (R5-6b). Neither grounds.
 *   - `locale = ANY(localeLookupChain(documentLocale))` — the recall slice a
 *     document written in that language may ground through. A caller with no
 *     locale passes null and the chain is `['und']` — byte-identical to the
 *     und-only predicate this used to hard-code, which is why every
 *     locale-less caller is unchanged. An `es` document gets
 *     `['es','und']`: its own language's words AND the universal ones, and
 *     NEVER another language's. Matching every locale at once remains the F2
 *     bug the gazetteer removed its legacy-array arm to fix — the chain is
 *     the opposite of that, a closed set the request names.
 *   - `role <> 'display'` — a display row makes NO recall claim (it is a label,
 *     or a recall claim the collision guard refused), so grounding on it would
 *     resurrect exactly the claim that lost.
 *
 * The und slice is 100% role='recall' in the live corpus today, which is why
 * the old array projection got away with omitting the role test. That is a
 * data coincidence, not a law — the first und display row would have made the
 * array ground a refused claim, silently.
 *
 * COMPOSE IT WITH `Prisma.sql`, never a bare `$queryRaw` tagged template:
 * $queryRaw's own template turns every interpolation into a bind parameter,
 * so this fragment would arrive as a parameter object instead of a predicate.
 */
export function recallSurfaceScopeSql(
  documentLocale: string | null | undefined,
  alias = 's',
): Prisma.Sql {
  // LOWER() on the stored side, because the chain is lowercased by
  // construction and `normalizeLocaleTag` preserves the canonical case of a
  // region subtag ('es-MX'). Every other locale-chain read in the codebase
  // (label-sweep, the localized-surface lane) matches the same way.
  const table = Prisma.raw(alias);
  return Prisma.sql`${table}.status = 'active'
     AND LOWER(${table}.locale) = ANY(${localeLookupChain(documentLocale ?? null)}::text[])
     AND ${table}.role <> 'display'`;
}
