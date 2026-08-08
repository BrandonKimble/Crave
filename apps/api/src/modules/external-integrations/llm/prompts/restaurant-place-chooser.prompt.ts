import {
  LLMRestaurantPlaceChooserCandidate,
  LLMRestaurantPlaceChooserInput,
} from '../llm.types';

function formatCandidateLine(
  candidate: LLMRestaurantPlaceChooserCandidate,
): string {
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

export function buildRestaurantPlaceChooserPrompt(
  input: LLMRestaurantPlaceChooserInput,
): string {
  const trimmedQuery = input.query?.trim() ?? '';
  const sourceText = input.sourceText?.trim() || 'unknown';
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
    'Decision procedure:',
    '1. IDENTITY. Identify the intended restaurant or brand from the query and the source text.',
    '2. GEOGRAPHY. The source text decides where the writer means when it clearly points somewhere — a city, a neighborhood, a named branch, a trip destination; otherwise the source market anchors. A plausible name match never overrides a location mismatch, and temporary wording (popup, truck, residency, collaboration) may name the brand but never justifies an out-of-market pick.',
    '3. STOP OR CONTINUE. Select only when the current set establishes BOTH identity and geography strongly; otherwise reject for now — rejection means "retrieve more candidates", never final failure.',
    '4. BRAND CLUSTERS. Candidates sharing the same distinctive name in the same market, differing only by branch, street, or neighborhood modifiers, are one local brand. When the source text refers to the brand generally, such a cluster IS a strong stop: pick the highest-ranked plausible branch now rather than rejecting in hope of a more representative brand-level entry. When the text names a specific branch or neighborhood, pick that branch.',
    "5. WHAT THE PLACE IS. A candidate's business category is weak evidence: use it to break ties, never to disqualify. What decides is HOW THE SOURCE TEXT TALKS ABOUT THE PLACE — people describing ordering or eating prepared food there (a dish, a counter, a deli order) make a store-typed candidate a fully valid selection, because many real food spots are typed as stores (a vegan cheese shop with a deli, a bodega with a grill, a supermarket with a taqueria). Text about packaged goods to take home points away from that candidate. A non-restaurant candidate can also serve as evidence against a weaker restaurant match.",
    '6. TIES. Prefer a candidate supported by both Google sources, then the higher Google rank, when that agrees with the rest of the evidence.',
    '',
    'Notes:',
    '- Treat reject for now as continue retrieval, not final failure.',
    '- Lower rank numbers mean Google ranked that candidate higher within that source.',
    '- Return JSON only.',
    '- If decision is reject, candidateId must be null.',
    '',
    `Query: ${trimmedQuery}`,
    `Source text: ${sourceText}`,
    `Source market: ${sourceLocale || 'unknown'}`,
    '',
    'Candidates:',
    ...candidateLines,
  ].join('\n');
}
