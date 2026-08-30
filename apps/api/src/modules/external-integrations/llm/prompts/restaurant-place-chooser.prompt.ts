import { LLMPlaceChooserCandidate, LLMPlaceChooserInput } from '../llm.types';

function formatCandidateLine(candidate: LLMPlaceChooserCandidate): string {
  const sourceLabels =
    candidate.sourceLabels?.filter((label) => label.trim().length > 0) ?? [];

  return [
    `- ${candidate.candidateId}`,
    `name=${candidate.name}`,
    `address=${candidate.address?.trim() || 'unknown'}`,
    `types=${(candidate.types ?? []).join(', ') || 'unknown'}`,
    `sources=${sourceLabels.join('+') || 'unknown'}`,
    `autocomplete_rank=${
      typeof candidate.autocompleteRank === 'number'
        ? candidate.autocompleteRank
        : 'none'
    }`,
    `search_text_rank=${
      typeof candidate.searchTextRank === 'number'
        ? candidate.searchTextRank
        : 'none'
    }`,
  ].join(' | ');
}

export function buildPlaceChooserPrompt(input: LLMPlaceChooserInput): string {
  const trimmedQuery = input.query?.trim() ?? '';
  const sourceText = input.sourceText?.trim() || 'unknown';
  const mentionCount =
    typeof input.mentionCount === 'number' && input.mentionCount > 0
      ? String(input.mentionCount)
      : 'unknown';
  const sourceLocale = [
    input.sourceLocale?.city?.trim(),
    input.sourceLocale?.region?.trim(),
  ]
    .filter((value): value is string => Boolean(value && value.length > 0))
    .join(', ');

  const candidateLines = input.candidates.map(formatCandidateLine);

  return [
    'Choose the best Google Places candidate from the current candidate set, or reject for now.',
    '',
    'Your job is staged entity resolution, not recommendation. The current candidate set may be incomplete. Decide whether the current candidates are already strong enough to stop on, or whether the system should continue retrieving more candidates.',
    '',
    'THE ERROR ECONOMICS, stated once so every step below inherits it: a wrong SELECT grounds the restaurant to the wrong real-world place permanently — every photo, address, and map pin downstream inherits the mistake. A REJECT costs one more retrieval round and nothing else. Reject is the cheap error; select only on strength.',
    '',
    'Decision procedure — two independent gates, then stop-or-continue:',
    '1. THE IDENTITY GATE. Is one candidate the restaurant or brand the query and source text intend? Judge the name and what the text says about the place. A candidate that fails identity is out regardless of where it sits.',
    '2. THE GEOGRAPHY GATE — independent of identity; passing one never compensates for the other. The SOURCE MARKET anchors where the place lives. The source text refines within that anchor when it clearly points somewhere — a neighborhood, a named branch, a trip destination — but the text is a SAMPLE, not a census: it is one or a few community snippets drawn from what may be hundreds of mentions of this place in the source market. A single snippet whose geography contradicts the market (a trip story, a same-named venue in another city) is evidence about THAT SNIPPET — possibly a different business sharing the name — and never vetoes a candidate that strongly matches identity inside the source market. The mention count tells you how much weight one snippet can carry: the more mentions on record, the less one stray snippet means. What geography still forbids, always: selecting an OUT-of-market candidate on name plausibility or snippet wording alone — temporary wording (popup, truck, residency, collaboration) may name the brand but never justifies an out-of-market pick.',
    '3. STOP OR CONTINUE. Select only when the current set establishes BOTH gates strongly; otherwise reject for now — rejection means "retrieve more candidates", never final failure.',
    '4. BRAND CLUSTERS. Candidates sharing the same distinctive name in the same market, differing only by branch, street, or neighborhood modifiers, are one local brand. When the source text refers to the brand generally, such a cluster IS a strong stop: pick the highest-ranked plausible branch now rather than rejecting in hope of a more representative brand-level entry. When the text names a specific branch or neighborhood and that branch is among the candidates, pick that branch. When the named branch is NOT among the candidates but the same brand is present in the source market, still select the best in-market branch: this decision grounds the BUSINESS, not the branch — branch reconciliation happens downstream, and rejecting a present brand because one snippet named an absent branch strands the business ungrounded.',
    "5. WHAT THE PLACE IS. A candidate's business category is weak evidence: use it to break ties, never to disqualify. What decides is HOW THE SOURCE TEXT TALKS ABOUT THE PLACE — people describing ordering or eating prepared food there (a dish, a counter, a deli order) make a store-typed candidate a fully valid selection, because many real food spots are typed as stores (a vegan cheese shop with a deli, a bodega with a grill, a supermarket with a taqueria). Text about packaged goods to take home points away from that candidate. A non-restaurant candidate can also serve as evidence against a weaker restaurant match.",
    '6. TIES. Prefer a candidate supported by both Google sources, then the higher Google rank, when that agrees with the rest of the evidence.',
    '',
    'Notes:',
    '- Treat reject for now as continue retrieval, not final failure.',
    '- Lower rank numbers mean Google ranked that candidate higher within that source.',
    '- Return JSON only.',
    '- If decision is reject, candidateId must be null.',
    '- If the schema requests a reason, it must be EVIDENCE, not narrative: name the identity and geography facts that decided it ("source names the Drag location, candidate address matches"), or the one that is missing ("source says Austin, candidate is Dallas") — in a few words.',
    '',
    `Query: ${trimmedQuery}`,
    `Source text (one or more community snippets, separated by "---"): ${sourceText}`,
    `Source market: ${sourceLocale || 'unknown'}`,
    `Community mentions on record in the source market: ${mentionCount}`,
    '',
    'Candidates:',
    ...candidateLines,
  ].join('\n');
}
