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
    '1. Identify the intended restaurant or brand from the query and source text.',
    '2. Determine the most likely geographic context from the source text first. If the source text clearly points to a different city, region, or destination than the source market, follow the source text. Otherwise use the source market as the default geographic anchor.',
    '3. Stop and select only when the current set already establishes a strong match for both the restaurant or brand identity and the geographic context.',
    '4. A clear in-market same-brand cluster is already strong enough to stop on. If multiple candidates are clearly branches or location variants of the same restaurant brand in the correct market and the source text refers to the brand generally rather than a specific branch, select the highest-ranked plausible branch immediately.',
    '5. Do not reject just to look for a more representative brand-level entry later. When the current candidates already form a strong in-market same-brand cluster, choose the highest-ranked plausible branch now.',
    '6. Treat candidates as the same local brand cluster when they share the same distinctive restaurant name in the same market and differ mainly by branch, neighborhood, street, district, or other location-specific modifiers.',
    '7. Reject for now when the current set does not yet establish a strong enough stop, so the system can retrieve more candidates.',
    '8. Be especially cautious about early out-of-market selections. Do not stop early on an out-of-market candidate unless the source text clearly supports that different location.',
    '9. A plausible name match alone does not override a major location mismatch.',
    '10. Popup, collaboration, truck, stand, residency, weekend, or other temporary wording may still refer to the underlying restaurant or brand, but temporary wording does not by itself justify selecting an out-of-market candidate.',
    '11. Prefer restaurant-ish candidates. Non-restaurant candidates may still be evidence against weaker restaurant matches.',
    '12. Prefer a candidate supported by both Google sources when that agrees with the rest of the evidence.',
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
