// Never-blank rule (a) — the prefix-cache placeholder filter contract
// (plans/suggest-ideal-shape.md, refit layer 2).
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { filterAutocompletePlaceholderMatches } from './search-autocomplete-placeholder-filter';

const makeMatch = (name: string, aliases: string[] = []): AutocompleteMatch => ({
  entityId: `id-${name}`,
  entityType: 'item',
  name,
  aliases,
  confidence: 1,
});

describe('filterAutocompletePlaceholderMatches', () => {
  it('drops cached rows whose text no longer contains the typed query', () => {
    const matches = [makeMatch('pizza'), makeMatch('pasta'), makeMatch('pierogi')];
    expect(filterAutocompletePlaceholderMatches(matches, 'pi').map((m) => m.name)).toEqual([
      'pizza',
      'pierogi',
    ]);
  });

  it('is case-insensitive in both directions', () => {
    const matches = [makeMatch('Pizza Margherita'), makeMatch('Burger')];
    expect(filterAutocompletePlaceholderMatches(matches, 'PIZZ').map((m) => m.name)).toEqual([
      'Pizza Margherita',
    ]);
  });

  it('keeps alias-recalled rows whose alias contains the query', () => {
    const matches = [makeMatch('Poke Bowl', ['poké', 'hawaiian bowl']), makeMatch('Ramen')];
    expect(filterAutocompletePlaceholderMatches(matches, 'hawaii').map((m) => m.name)).toEqual([
      'Poke Bowl',
    ]);
  });

  it('empty query passes everything through untouched', () => {
    const matches = [makeMatch('pizza'), makeMatch('pasta')];
    expect(filterAutocompletePlaceholderMatches(matches, '  ')).toEqual(matches);
  });

  it('can filter to empty (caller falls back to the previous list, never a blank flash)', () => {
    expect(filterAutocompletePlaceholderMatches([makeMatch('pizza')], 'sushi')).toEqual([]);
  });
});
