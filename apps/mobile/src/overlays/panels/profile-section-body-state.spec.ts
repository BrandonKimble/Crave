import { resolveProfileSectionBodyState } from './profile-section-body-state';

const state = (overrides: Partial<Parameters<typeof resolveProfileSectionBodyState>[0]> = {}) =>
  resolveProfileSectionBodyState({
    enabled: true,
    isPending: false,
    isError: false,
    rowCount: 1,
    ...overrides,
  });

describe('profile section body state (F4509)', () => {
  it('a GATED section is not a loading one — even though react-query calls it pending', () => {
    // THE FINDING, as a red line. A disabled query reports status 'pending' in v5, so
    // the old `if (isPending) return <SectionLoading/>` ladder rendered a spinner that
    // could never resolve and never error. Delete the `!enabled` arm and this goes RED.
    expect(state({ enabled: false, isPending: true })).toBe('gated');
  });

  it('stays gated whatever the query happens to report', () => {
    expect(state({ enabled: false, isPending: false, isError: true })).toBe('gated');
    expect(state({ enabled: false, isPending: false, rowCount: 0 })).toBe('gated');
    expect(state({ enabled: false, isPending: false, rowCount: 5 })).toBe('gated');
  });

  it('keeps the enabled ladder exactly as the four sections wrote it by hand', () => {
    expect(state({ isPending: true })).toBe('loading');
    expect(state({ isError: true })).toBe('failed');
    expect(state({ rowCount: 0 })).toBe('empty');
    expect(state({ rowCount: 3 })).toBe('rows');
  });
});
