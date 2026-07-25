// Never-blank rule (c) — the autocomplete error bit's store contract
// (plans/suggest-ideal-shape.md, refit layer 2).
import {
  getSearchAutocompleteError,
  setSearchAutocompleteError,
  subscribeSearchAutocompleteError,
} from './search-autocomplete-error-store';

describe('search-autocomplete-error-store', () => {
  afterEach(() => {
    setSearchAutocompleteError(false);
  });

  it('starts false and reflects writes', () => {
    expect(getSearchAutocompleteError()).toBe(false);
    setSearchAutocompleteError(true);
    expect(getSearchAutocompleteError()).toBe(true);
    setSearchAutocompleteError(false);
    expect(getSearchAutocompleteError()).toBe(false);
  });

  it('notifies subscribers on change and dedupes same-value writes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSearchAutocompleteError(listener);
    setSearchAutocompleteError(true);
    setSearchAutocompleteError(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setSearchAutocompleteError(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setSearchAutocompleteError(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
