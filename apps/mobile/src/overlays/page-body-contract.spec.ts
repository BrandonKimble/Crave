import { resolvePageBodyListState } from './page-body-contract';
import { resolveSceneLoadingMaterial } from '../navigation/runtime/scene-foundation-spec';

// ─── THE PAGE L2 — the closed body-state enum + the one material derivation ──────────

describe('resolvePageBodyListState (the closed enum derivation)', () => {
  const base = { what: 'things', items: null, isPending: false, isError: false };

  it('is TOTAL: every query edge maps to exactly one of the five states', () => {
    expect(resolvePageBodyListState({ ...base, isPending: true }).kind).toBe('pending');
    expect(resolvePageBodyListState({ ...base, isError: true }).kind).toBe('error');
    expect(resolvePageBodyListState({ ...base, items: [] }).kind).toBe('empty');
    expect(resolvePageBodyListState({ ...base, items: ['a'] }).kind).toBe('present');
    expect(resolvePageBodyListState({ ...base, items: ['a'], isAppending: true }).kind).toBe(
      'appending'
    );
  });

  it('error WINS over pending (the failure law announces; the material stays up)', () => {
    const state = resolvePageBodyListState({ ...base, isPending: true, isError: true });
    expect(state.kind).toBe('error');
    if (state.kind === 'error') {
      expect(state.failure).toEqual({ isError: true, what: 'things', retry: undefined });
    }
  });

  it('a settled query with null items is still PENDING (nothing to present is not empty)', () => {
    expect(resolvePageBodyListState({ ...base, items: null }).kind).toBe('pending');
    expect(resolvePageBodyListState({ ...base, items: undefined }).kind).toBe('pending');
  });

  it('carries the retry seam into the failure (root scenes re-run per the wave-4 law)', () => {
    const retry = () => {};
    const state = resolvePageBodyListState({ ...base, isError: true, retry });
    if (state.kind === 'error') {
      expect(state.failure.retry).toBe(retry);
    } else {
      throw new Error('expected error state');
    }
  });
});

describe('resolveSceneLoadingMaterial (L0 — backing DERIVED, never an argument)', () => {
  it('derives self-frost from the white body surface (the "just white" class)', () => {
    // Every foundation scene declares bodySurface 'white' today ⇒ frost derives true
    // unless the row explicitly overrides — nobody re-decides this at a call site.
    expect(resolveSceneLoadingMaterial('notifications')).toEqual({
      rowType: 'comment',
      frostBacking: true,
    });
    expect(resolveSceneLoadingMaterial('settings')).toEqual({
      rowType: 'tile',
      frostBacking: true,
    });
  });

  it('spec-less scenes have no material (search owns its composition)', () => {
    expect(resolveSceneLoadingMaterial('search')).toBeNull();
  });
});
