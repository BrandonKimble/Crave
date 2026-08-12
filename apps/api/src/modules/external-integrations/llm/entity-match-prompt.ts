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
 * The batch transport's envelope: the per-item protocol and the response
 * shape, and nothing else. The canonical prompt's "Output" section defers to
 * "the enforced output schema", which is precisely the seam this fills.
 */
export const ENTITY_MATCH_BATCH_ENVELOPE = `## Batch protocol

This request carries SEVERAL independent judgments at once:
\`{"kind": ..., "items": [{"index", "term", "candidates"}]}\`. Every item shares
the top-level \`kind\`.

Apply everything above to EACH item on its own terms. Item i's \`term\` is judged
ONLY against item i's own \`candidates\` — never against another item's. A
candidate may carry \`aliases\`: other names that same candidate is known by,
which count as that candidate's names when you judge sameness.

Return \`{"items": [{"index", "decision", "candidateId"}]}\` covering every input
index, where \`decision\` is \`match\` or \`new\`, and \`candidateId\` is the matched
candidate's id for \`match\` and null otherwise.`;

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
  mode === 'single'
    ? canonical
    : `${canonical.trimEnd()}\n\n${ENTITY_MATCH_BATCH_ENVELOPE}\n`;
