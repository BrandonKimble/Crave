/**
 * ONE entity-match prompt, TWO transports.
 *
 * THE DEFECT THIS CLOSES (prompt-fleet audit): `prompts/entity-match-prompt.md`
 * was the system instruction for `entity-resolution.match`, while
 * `entity-resolution.match_batch` carried its own hand-written inline copy
 * inside llm.service.ts — same judgment, different wording, and the inline
 * twin had silently missed the cost-asymmetry framing (a wrong MERGE fuses
 * two real entities and is far costlier than a spurious new one). Two sources
 * of truth for one judgment means every prompt iteration lands on whichever
 * copy the author happened to open, and the two paths drift until the same
 * pair of names resolves differently depending on batch size.
 *
 * The .md asset is the canonical home — it is what the prompt-versioning and
 * shadow-replay machinery reads, and what a human edits. Everything here is
 * PLUMBING: how the one judgment is carried over a one-item request versus an
 * N-item request. Nothing in this file may state or restate a rule about when
 * two names are the same entity. If a judgment needs to change, it changes in
 * the .md, and both paths change with it — which is exactly what
 * entity-match-prompt.spec.ts mutation-proves.
 */

export type EntityMatchPromptMode = 'single' | 'batch';

/**
 * ONE wire shape for a candidate on EVERY transport (red team 2026-08-12).
 * The batch path always sent alias evidence; the single path silently
 * dropped it, so the identical (term, candidate) pair could judge
 * differently by batch size. Both payload assemblers call THIS — parity is
 * structural, not tested-for. The cap keeps a surface-rich candidate from
 * flooding the shortlist (the batch path's long-standing bound).
 */
export const ENTITY_MATCH_ALIAS_CAP = 6;
/** Home-restaurant evidence cap — enough to show where a dish lives without
 *  flooding the shortlist (D2 context standard). */
export const ENTITY_MATCH_HOME_PLACE_CAP = 3;
export const entityMatchCandidateWire = (candidate: {
  id: number;
  name: string;
  aliases?: string[];
  homePlaces?: string[];
  samePlace?: boolean;
}): {
  id: number;
  name: string;
  aliases?: string[];
  home_places?: string[];
  same_place?: boolean;
} => ({
  id: candidate.id,
  name: candidate.name,
  ...(candidate.aliases?.length
    ? { aliases: candidate.aliases.slice(0, ENTITY_MATCH_ALIAS_CAP) }
    : {}),
  ...(candidate.homePlaces?.length
    ? {
        home_places: candidate.homePlaces.slice(0, ENTITY_MATCH_HOME_PLACE_CAP),
      }
    : {}),
  ...(candidate.samePlace !== undefined
    ? { same_place: candidate.samePlace }
    : {}),
});

/**
 * ONE wire shape for the judgment-level context fields on EVERY transport
 * (D2). Both payload assemblers spread THIS so the single and batch lanes
 * cannot drift on the evidence they carry.
 */
export const entityMatchContextWire = (input: {
  mention?: string | null;
  threadPlace?: string | null;
  termHomePlaces?: string[];
}): {
  mention?: string;
  thread_place?: string;
  term_home_places?: string[];
} => ({
  ...(input.mention?.trim() ? { mention: input.mention.trim() } : {}),
  ...(input.threadPlace?.trim()
    ? { thread_place: input.threadPlace.trim() }
    : {}),
  ...(input.termHomePlaces?.length
    ? {
        term_home_places: input.termHomePlaces.slice(
          0,
          ENTITY_MATCH_HOME_PLACE_CAP,
        ),
      }
    : {}),
});

/**
 * THE TWO ENVELOPES. Each states its transport's request shape and the name
 * of its id field, and nothing else — the canonical prompt's "Output" section
 * defers to "the request protocol below", which is precisely this seam.
 *
 * WHY THE SINGLE TRANSPORT HAS ONE TOO (red team 2026-08-12): when the .md
 * was rederived it absorbed the BATCH protocol — "You receive `items`", "one
 * verdict per input `index`", `candidateId`. The single lane sends
 * `{term, kind, candidates}` and its enforced schema requires `candidate_id`,
 * so the one canonical text was describing a request that lane never sends
 * and an output key that contradicts its own schema. A prompt that
 * mis-describes its own request is not a source of truth: the judgment is
 * transport-neutral in the .md now, and each transport carries its protocol
 * here.
 */
export const ENTITY_MATCH_SINGLE_ENVELOPE = `## Request protocol

This request carries ONE judgment: \`{"term", "kind", "candidates"}\`, and may
also carry the evidence fields \`mention\`, \`thread_place\`, and
\`term_home_places\` described above.

Each candidate carries a \`name\` and may also carry \`aliases\`,
\`home_places\`, and \`same_place\` — evidence fields described above.

Return \`{"decision", "candidate_id"}\`, where \`decision\` is \`match\`, \`new\`,
or \`reject\`, and \`candidate_id\` is the matched candidate's id for \`match\`
and null otherwise.`;

export const ENTITY_MATCH_BATCH_ENVELOPE = `## Request protocol — batch

This request carries SEVERAL independent judgments at once:
\`{"kind": ..., "items": [{"index", "term", "candidates"}]}\`. Every item shares
the top-level \`kind\`, and an item may also carry the evidence fields
\`mention\`, \`thread_place\`, and \`term_home_places\` described above.

Apply everything above to EACH item on its own terms. Item i's \`term\` is judged
ONLY against item i's own \`candidates\` — never against another item's, and one
item's verdict never influences another's.

Each candidate carries a \`name\` and may also carry \`aliases\`,
\`home_places\`, and \`same_place\` — evidence fields described above.

Return \`{"items": [{"index", "decision", "candidateId"}]}\` covering every input
index exactly once, where \`decision\` is \`match\`, \`new\`, or \`reject\`, and
\`candidateId\` is the matched candidate's id for \`match\` and null otherwise.`;

/**
 * Render the system instruction for a transport. `canonical` is the verbatim
 * contents of prompts/entity-match-prompt.md — passed in rather than read here
 * so the single loader in llm.service.ts (which resolves src vs dist) stays
 * the only reader of the asset.
 */
export const renderEntityMatchSystemInstruction = (
  canonical: string,
  mode: EntityMatchPromptMode,
): string =>
  `${canonical.trimEnd()}\n\n${
    mode === 'single'
      ? ENTITY_MATCH_SINGLE_ENVELOPE
      : ENTITY_MATCH_BATCH_ENVELOPE
  }\n`;
