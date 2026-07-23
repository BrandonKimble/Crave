import { resolvePageBodyListState, resolvePageContentBodyState } from './page-body-contract';
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

describe('resolveSceneLoadingMaterial (L0 — the one declared material, no backing fork)', () => {
  it('resolves the declared row; backing is not a choice (true-cutout law)', () => {
    // Every skeleton is a true cutout onto the shared frost — the old frostBacking
    // fork is deleted; the material is just the scene's declared row shape.
    expect(resolveSceneLoadingMaterial('notifications')).toEqual({ rowType: 'comment' });
    expect(resolveSceneLoadingMaterial('settings')).toEqual({ rowType: 'tile' });
  });

  it('spec-less scenes have no material (search owns its composition)', () => {
    expect(resolveSceneLoadingMaterial('search')).toBeNull();
  });
});

describe('resolvePageContentBodyState (the content-body subset)', () => {
  const base = { what: 'this profile', data: null, isPending: false, isError: false };

  it('is TOTAL over the three content arms', () => {
    expect(resolvePageContentBodyState({ ...base, isPending: true }).kind).toBe('pending');
    expect(resolvePageContentBodyState({ ...base, isError: true }).kind).toBe('error');
    expect(resolvePageContentBodyState({ ...base, data: { id: 1 } }).kind).toBe('present');
  });

  it('a SETTLED query with null data is an ERROR by law (an entity page with nothing failed)', () => {
    // The old hand-rolled `!isPending && data == null` gate, now unrepresentable to
    // get wrong at a call site.
    const state = resolvePageContentBodyState({ ...base, data: null });
    expect(state.kind).toBe('error');
    if (state.kind === 'error') {
      expect(state.failure.what).toBe('this profile');
    }
  });

  it('error wins over pending', () => {
    expect(resolvePageContentBodyState({ ...base, isPending: true, isError: true }).kind).toBe(
      'error'
    );
  });
});
