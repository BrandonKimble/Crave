import {
  ENTITY_MATCH_ALIAS_CAP,
  entityMatchCandidateWire,
} from './entity-match-prompt';

/**
 * ONE wire shape for a candidate on EVERY transport (red team 2026-08-12).
 * Both payload assemblers (matchEntity and matchEntitiesBatch) map through
 * entityMatchCandidateWire, so alias evidence can no longer differ by batch
 * size. Mutation proofs: delete the aliases spread in the wire and the
 * evidence test goes red; drop the slice and the cap test goes red.
 */
describe('entity-match candidate wire', () => {
  it('carries alias evidence when the candidate has any', () => {
    expect(
      entityMatchCandidateWire({
        id: 3,
        name: 'chicken and rice',
        aliases: ['chicken over rice', 'arroz con pollo'],
      }),
    ).toEqual({
      id: 3,
      name: 'chicken and rice',
      aliases: ['chicken over rice', 'arroz con pollo'],
    });
  });

  it('omits the aliases key entirely when there is no evidence', () => {
    expect(entityMatchCandidateWire({ id: 1, name: 'pho' })).toEqual({
      id: 1,
      name: 'pho',
    });
    expect(
      entityMatchCandidateWire({ id: 1, name: 'pho', aliases: [] }),
    ).toEqual({ id: 1, name: 'pho' });
  });

  it('caps a surface-rich candidate at the batch path long-standing bound', () => {
    const aliases = Array.from({ length: 12 }, (_, i) => `alias-${i}`);
    const wire = entityMatchCandidateWire({ id: 0, name: 'x', aliases });
    expect(wire.aliases).toHaveLength(ENTITY_MATCH_ALIAS_CAP);
    expect(wire.aliases).toEqual(aliases.slice(0, ENTITY_MATCH_ALIAS_CAP));
  });
});
