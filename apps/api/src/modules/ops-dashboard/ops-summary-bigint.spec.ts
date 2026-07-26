import { sanitizeBigInts } from './ops-summary.service';

// CRAVE-1B: a single BigInt anywhere in the summary payload 500'd the whole
// dashboard (JSON.stringify rejects BigInt). The edge sanitizer must make
// ANY payload stringifiable — these specs go RED if it stops walking a
// container shape or starts mangling non-BigInt values.
describe('sanitizeBigInts (ops summary payload edge)', () => {
  it('converts BigInts at any depth, preserving everything else', () => {
    const input = {
      id: 42n,
      rows: [{ count: 7n, name: 'a', when: new Date('2026-07-25T00:00:00Z') }],
      nested: { deep: { value: 9007199254740991n } },
      nullish: null,
      flag: true,
    };
    const out = sanitizeBigInts(input);
    expect(out.id).toBe(42);
    expect(out.rows[0].count).toBe(7);
    expect(out.rows[0].name).toBe('a');
    expect(out.rows[0].when).toBeInstanceOf(Date);
    expect(out.nested.deep.value).toBe(9007199254740991);
    expect(out.nullish).toBeNull();
    expect(out.flag).toBe(true);
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('would have caught CRAVE-1B: stringify succeeds where raw payload throws', () => {
    const raw = { alerts: { latest: [{ id: 1n }] } };
    expect(() => JSON.stringify(raw)).toThrow();
    expect(() => JSON.stringify(sanitizeBigInts(raw))).not.toThrow();
  });
});
