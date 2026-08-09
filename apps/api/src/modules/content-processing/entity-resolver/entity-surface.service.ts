import { Prisma } from '@prisma/client';
import {
  canonicalFold,
  isDisplayable,
  normalizeSurface,
} from './entity-identity';
import { normalizeLocaleTag } from '../../../shared/locale';

/**
 * THE ALIAS PROJECTION WRITER (multilingual plan A1) — the ONE writer of
 * `core_entities.aliases` from now on.
 *
 * Before this, seven independent sites hand-appended to an untagged
 * `text[]`: two verbatim-copied merge folds, the ontology rename
 * demotion, extraction banking, extraction create, the dish-knowledge
 * LLM pass, Places enrichment and cuisine extraction. Zero provenance,
 * zero language tag, no folded mirror — feeding confidence-1.0 grounding
 * AND the dense embedding doc.
 *
 * The shape now: `entity_surface` ROWS are the truth (form + APP-FOLDED
 * mirror + BCP-47 locale + source + confidence + status); the array is a
 * DERIVED PROJECTION of the ACTIVE forms, in insertion (seq) order. This
 * is the identity_key precedent — one app function owns the write, the DB
 * stores and indexes. Every existing read arm (GIN overlap, the FTS
 * expression index, the trgm haystack, the per-alias unnest) keeps
 * working untouched, so nothing downstream had to change.
 *
 * WHY seq ORDER and not sorted: append-style writers today produce
 * insertion order, so seq order is byte-identical to their current
 * output. The two merge folds currently emit `array_agg(DISTINCT a)`
 * (alphabetical) — same SET, different ORDER. Verified that nothing in
 * the repo reads aliases[] positionally (no `aliases[0]`, no ORDER BY
 * over an alias element), so order is unobservable; picking insertion
 * order keeps the six append sites exact rather than the two fold sites.
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
   * 'active' (default) enters the projection; 'candidate' is banked but
   * withheld from the array until judged; 'deprecated' is remembered as
   * WRONG so query spam cannot re-propose it forever (R5-6b).
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

export interface AddSurfacesOptions {
  /**
   * Forms to DEMOTE to 'deprecated' before the projection is rebuilt —
   * the ontology rename's "drop the new display name from the aliases"
   * half. Matched on the folded form (canonicalFold), so demotion is
   * collation-independent. Demotion is remembered; a plain delete would let
   * the next writer re-add the same form.
   */
  deprecateForms?: string[];
  /**
   * Mark the dense doc stale. Aliases feed the entity embedding doc, so
   * every caller that changed the array today also set this. Default
   * true when the projection actually changed; pass false to suppress
   * (the create path embeds fresh anyway).
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
 * Bank surface forms on an entity and re-derive the legacy `aliases[]`
 * projection. Idempotent per (entity, locale, form).
 *
 * Runs inside the caller's transaction — alias rows and the projection
 * must be atomic with whatever else the caller is doing (a merge that
 * archived the loser but lost its names would be unrecoverable).
 *
 * @returns the projected array AND the forms the collision guard refused.
 *   The refusals are returned because they are otherwise INVISIBLE: a
 *   locale-tagged write never changes the und-only projection, so a run where
 *   the guard blocked every surface produced byte-identical output to a
 *   perfect run. A guard whose blast radius cannot be seen is a guard nobody
 *   can trust.
 */
export async function addSurfaces(
  tx: Prisma.TransactionClient,
  entityId: string,
  forms: SurfaceInput[],
  options: AddSurfacesOptions = {},
): Promise<{ aliases: string[]; blocked: string[] }> {
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
  const inferred = rows.filter(
    (r) => INFERRED_SURFACE_SOURCES.has(r.source) && claimsRecall(r.role),
  );
  if (inferred.length > 0 && !options.adjudicated) {
    const foldedCandidates = Array.from(
      new Set(inferred.map((r) => canonicalFold(r.form)).filter(Boolean)),
    );
    if (foldedCandidates.length > 0) {
      const collisions = await tx.$queryRaw<Array<{ folded: string }>>`
        SELECT e.identity_key AS folded
          FROM core_entities e
         WHERE e.identity_key = ANY(${foldedCandidates}::text[])
           AND e.entity_id <> ${entityId}::uuid
           AND e.status <> 'archived'::entity_status
        UNION
        SELECT ea.form_folded AS folded
          FROM entity_surface ea
         WHERE ea.form_folded = ANY(${foldedCandidates}::text[])
           AND ea.entity_id <> ${entityId}::uuid
           AND ea.status = 'active'`;
      // SELF-REDUNDANCY: an inferred surface identical to the entity's OWN
      // name teaches nothing — the name arm already matches it in every
      // locale, so a locale-tagged copy is noise that also asserts the English
      // name is a word in that language. Deterministic, unlike relying on the
      // model to flag a proper noun (it does not do so consistently).
      const self = await tx.$queryRaw<Array<{ identity_key: string | null }>>`
        SELECT identity_key FROM core_entities WHERE entity_id = ${entityId}::uuid`;
      const ownFold = self[0]?.identity_key ?? null;
      const blocked = new Set(collisions.map((c) => c.folded));
      if (ownFold) {
        blocked.add(ownFold);
      }
      if (blocked.size > 0) {
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          const row = rows[i];
          if (
            INFERRED_SURFACE_SOURCES.has(row.source) &&
            claimsRecall(row.role) &&
            // A 'deprecated' write is the adjudicator RECORDING a lost claim
            // (remembered-wrong, R5-6b) — it never enters the projection or
            // grounds anything, so the guard must not block the memory.
            row.status !== 'deprecated' &&
            blocked.has(canonicalFold(row.form))
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

  if (rows.length > 0) {
    await insertSurfaceRows(tx, entityId, rows, false);
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
    await tx.$executeRaw`
      UPDATE entity_surface SET status = 'deprecated'
      WHERE entity_id = ${entityId}::uuid
        AND form_folded = ANY(${deprecate}::text[])
        AND status <> 'deprecated'`;
  }

  const aliases = await projectAliases(tx, entityId, options);
  return { aliases, blocked: blockedForms };
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
 * THE CONFLICT CLAUSE MERGES ROLES rather than dropping the write. A recall
 * write landing on an existing display row (or the reverse) means the form
 * is now BOTH — and a write that got this far has already cleared the
 * collision guard, so widening is earned, never assumed. Recall writes
 * never touch status: a re-offer must not resurrect a claim the adjudicator
 * deprecated (the old DO NOTHING preserved this by accident; it is stated
 * here on purpose).
 */
async function insertSurfaceRows(
  tx: Prisma.TransactionClient,
  entityId: string,
  rows: SurfaceRow[],
  forceNonDefault: boolean,
): Promise<void> {
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
      return Prisma.sql`(${entityId}::uuid, ${r.form}, ${canonicalFold(r.form)}, ${r.locale}, ${r.role}, ${r.source}, ${r.confidence}, ${r.status}, ${r.description}, ${isDefaultExpr}, ${r.rank}, ${r.promptVersion})`;
    }),
  );
  try {
    await tx.$executeRaw`
      INSERT INTO entity_surface
        (entity_id, form, form_folded, locale, role, source, confidence,
         status, description, is_default, rank, prompt_version)
      VALUES ${values}
      ON CONFLICT (entity_id, locale, form) DO UPDATE SET
        role = CASE WHEN entity_surface.role = EXCLUDED.role
                    THEN entity_surface.role ELSE 'both' END,
        status = CASE WHEN EXCLUDED.role = 'recall'
                      THEN entity_surface.status ELSE EXCLUDED.status END,
        description = CASE WHEN EXCLUDED.role = 'recall'
                           THEN entity_surface.description
                           ELSE EXCLUDED.description END,
        rank = CASE WHEN EXCLUDED.role = 'recall'
                    THEN entity_surface.rank ELSE EXCLUDED.rank END,
        prompt_version = GREATEST(entity_surface.prompt_version,
                                  EXCLUDED.prompt_version),
        updated_at = now()`;
  } catch (error) {
    if (
      !forceNonDefault &&
      error instanceof Error &&
      error.message.includes('uq_entity_surface_one_default')
    ) {
      await insertSurfaceRows(tx, entityId, rows, true);
      return;
    }
    throw error;
  }
}

/**
 * Re-derive `core_entities.aliases` from the ACTIVE rows of one entity.
 * Exported for the backfill and for any future writer that changes alias
 * STATUS without adding forms (the judge demotion path).
 */
export async function projectAliases(
  tx: Prisma.TransactionClient,
  entityId: string,
  options: Pick<
    AddSurfacesOptions,
    'markEmbeddingStale' | 'touchLastUpdated'
  > = {},
): Promise<string[]> {
  // F1 (wave-3 red team, executed lost-update): serialize projections per
  // entity — two concurrent addSurfaces both read rows then blind-write the
  // array; the loser's form vanished from all four read arms. Row lock
  // makes the second projector wait and re-read committed truth.
  await tx.$executeRaw`SELECT 1 FROM core_entities WHERE entity_id = ${entityId}::uuid FOR UPDATE`;
  // DISTINCT ON must order by its own key first; the outer select
  // re-orders to seq, because the array's order is insertion order. The
  // same FORM under two locales is ONE array element (the array is
  // untagged by construction — that is exactly why rows exist).
  // P0-a: ONLY UNTAGGED ('und') ROWS ENTER THE ARRAY.
  //
  // `core_entities.aliases[]` is the UNLOCALIZED hub of the lexical system: it
  // feeds the recall core's six arms, the entity embedding doc, and the typo
  // dictionary — none of which take a locale. Projecting a locale-TAGGED row
  // into it makes that form match for every language, which is precisely the
  // F2 bug the gazetteer already removed its legacy-array arm to fix (seeded
  // `es` forms grounding for English requests).
  //
  // It also protects retrieval quality: the fuzzy arm concatenates every alias
  // into ONE similarity haystack, so tagged multilingual forms would
  // mechanically dilute English trigram similarity for EVERY entity and shrink
  // the containment-coverage term. Tagged surfaces are reachable through the
  // locale-aware gazetteer (entity_surface, locale-chained); the array stays what
  // every legacy reader already assumes it is — an untagged bag.
  const ordered = await tx.$queryRaw<Array<{ form: string }>>`
    SELECT form FROM (
      SELECT DISTINCT ON (form) form, seq
      FROM entity_surface
      WHERE entity_id = ${entityId}::uuid AND status = 'active'
        AND locale = 'und'
      ORDER BY form, seq
    ) d ORDER BY d.seq`;
  const aliases = ordered.map((r) => r.form);

  const previous = await tx.$queryRaw<Array<{ aliases: string[] | null }>>`
    SELECT aliases FROM core_entities WHERE entity_id = ${entityId}::uuid`;
  // The column is nullable in the DB (Prisma's @default([]) only fills it
  // on Prisma-issued inserts); NULL is "no aliases", same as empty.
  const current = previous[0]?.aliases ?? [];
  const changed =
    !previous[0] ||
    current.length !== aliases.length ||
    current.some((value, index) => value !== aliases[index]);

  if (changed) {
    const stale = options.markEmbeddingStale !== false;
    await tx.$executeRaw`
      UPDATE core_entities
      SET aliases = ${aliases}::varchar[],
          name_embedding_stale = CASE WHEN ${stale} THEN true ELSE name_embedding_stale END,
          last_updated = CASE WHEN ${options.touchLastUpdated === true}
                              THEN now() ELSE last_updated END
      WHERE entity_id = ${entityId}::uuid`;
  }

  return aliases;
}

/**
 * The MERGE FOLD, as one call: bank the loser's name + all of its alias
 * forms onto the winner, carrying each loser row's ORIGINAL locale and
 * provenance instead of flattening them (the array fold destroyed both).
 * Replaces the two verbatim-copied `array_agg(DISTINCT unnest(...))`
 * statements in finalizeMergeCompletion and the ontology merge.
 */
export async function foldSurfacesFromMerge(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
  options: AddSurfacesOptions = {},
): Promise<string[]> {
  // The loser's own display name becomes a surface on the winner.
  await tx.$executeRaw`
    INSERT INTO entity_surface
      (entity_id, form, form_folded, locale, source, confidence, status)
    SELECT ${canonicalId}::uuid, x.name, x.identity_key, 'und', 'merge_fold', 1, 'active'
    FROM core_entities x
    WHERE x.entity_id = ${duplicateId}::uuid
      AND x.identity_key IS NOT NULL
    ON CONFLICT (entity_id, locale, form) DO NOTHING`;
  // NOTE: identity_key IS canonicalFold(name), APP-WRITTEN by
  // identityInsertData — reusing it is reading a stored fold, not
  // computing one in SQL. Names with no foldable identity (emoji-only)
  // carry NULL and are skipped: an unfoldable surface is not a recall key.

  // The loser's alias rows carry over WITH their locale and provenance.
  await tx.$executeRaw`
    INSERT INTO entity_surface
      (entity_id, form, form_folded, locale, source, confidence, status)
    SELECT ${canonicalId}::uuid, a.form, a.form_folded, a.locale, a.source, a.confidence, a.status
    FROM entity_surface a
    WHERE a.entity_id = ${duplicateId}::uuid
    ON CONFLICT (entity_id, locale, form) DO NOTHING`;

  // Merge-fold carries OBSERVED surfaces (testimony), which the collision
  // guard exempts, so there is nothing to report refusing — this keeps the
  // simple projection return its callers already use.
  return projectAliases(tx, canonicalId, options);
}
