# PREPARED (file HELD): accent veto for the within-batch creation key

**Status: APPLIED 2026-08-12** — hold released after 13b31da2c; the fix
reuses the shared `isAccented` helper (one accent-evidence authority;
`accentEvidenceFor` is persisted-surface evidence and does not apply to two
unpersisted in-batch strings). Mutation executed: veto neutered → the two
tone tests went RED (2 failed / 28 passed), reverted → 30/30; full resolver
module 7 suites / 81 tests green; tsc/eslint/prettier clean. This document
is now the record of the change, kept for the mutation recipe.

## The defect (R2, proven 2026-08-12)

`markEntitiesForCreation` keys within-batch identity by bare
`canonicalFold(normalizedName)` (entity-resolution.service.ts:1806, and the
number-variant registration at :2022). `canonicalFold` strips diacritics:

```
canonicalFold('cơm chay') === canonicalFold('cơm cháy')  // both "com chay"
diacriticFold: 'cơm chay' vs 'cơm cháy'                  // accent evidence DISAGREES
```

So a cold batch carrying both spellings mints ONE primary and folds the other
in as a duplicate at confidence 1.0 — no judge, no redirect trail: the most
permanent form of tone fusion. Tier 1 (5a7eab233) and tier 2.5 (f1e1770d4)
both carry the accent veto; the creation key is the one identity fold that
never got it.

## The change (apply to entity-resolution.service.ts)

Replace the key construction at ~:1806-1812:

```ts
        const identityName = canonicalFold(normalizedName) || normalizedName;
        const baseKey =
          entityType === 'restaurant'
            ? `${entityType}:${this.normalizeEngineScope(
                entity.engineId,
              )}:${identityName}`
            : `${entityType}:${identityName}`;
        // THE ACCENT VETO, AT MINT (R2, 2026-08-12): the same rule tier 1 and
        // tier 2.5 already enforce — a canonical-fold hit only folds when the
        // occupant and the newcomer do not BOTH carry disagreeing accent
        // evidence. One-sided accents still fold (de-diacritized typing).
        // A vetoed newcomer keys by its accent-preserving fold instead, so
        // its OWN later duplicates still collapse deterministically.
        const occupantForVeto = primaryNewEntityMap.get(baseKey);
        const occupantName = occupantForVeto?.normalizedName ?? '';
        const accentVetoed =
          occupantForVeto !== undefined &&
          isAccented(normalizedName) &&
          isAccented(occupantName) &&
          diacriticFold(occupantName) !== diacriticFold(normalizedName);
        const normalizedKey = accentVetoed
          ? `${baseKey}#${diacriticFold(normalizedName)}`
          : baseKey;
        const existingPrimary = primaryNewEntityMap.get(normalizedKey);
```

(`isAccented` is the module-level helper the tier-2 veto agent introduced —
`diacriticFold(text) !== canonicalFold(text)`. If their refactor renames it,
inline that expression.)

No change needed at the variant-registration site (:2022): variants only
register `if (!has(variantKey))` — a distinct-accent occupant can at worst
block a registration, never fuse a mention; fusion only occurs on the GET
path patched above.

## The spec (append to the intra-batch describe block in
entity-resolution.service.spec.ts)

```ts
  it('TONE-MARK VETO AT MINT: "cơm chay" and "cơm cháy" in one cold batch mint SEPARATE primaries (both accented, accent folds disagree)', async () => {
    const { service } = buildService({ entities: [] });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({ tempId: 't1', normalizedName: 'cơm chay', entityType: EntityType.food }),
        baseInput({ tempId: 't2', normalizedName: 'cơm cháy', entityType: EntityType.food }),
      ],
      CONFIG_NO_LLM,
    );
    const first = resolutionResults.find((r) => r.tempId === 't1')!;
    const second = resolutionResults.find((r) => r.tempId === 't2')!;
    expect(first.isNewEntity).toBe(true);
    expect(second.isNewEntity).toBe(true);
    expect(second.primaryTempId).toBeUndefined();
  });

  it('ONE-SIDED accents still fold at mint: "pho" and "phở" collapse to one primary (de-diacritized typing keeps grounding)', async () => {
    const { service } = buildService({ entities: [] });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({ tempId: 't1', normalizedName: 'pho', entityType: EntityType.food }),
        baseInput({ tempId: 't2', normalizedName: 'phở', entityType: EntityType.food }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults.find((r) => r.tempId === 't2')!.primaryTempId).toBe('t1');
  });

  it('a vetoed newcomer STILL dedupes its own later twins ("cơm cháy" twice after a "cơm chay" occupant)', async () => {
    const { service } = buildService({ entities: [] });
    const { resolutionResults } = await service.resolveBatch(
      [
        baseInput({ tempId: 't1', normalizedName: 'cơm chay', entityType: EntityType.food }),
        baseInput({ tempId: 't2', normalizedName: 'cơm cháy', entityType: EntityType.food }),
        baseInput({ tempId: 't3', normalizedName: 'cơm cháy', entityType: EntityType.food }),
      ],
      CONFIG_NO_LLM,
    );
    expect(resolutionResults.find((r) => r.tempId === 't3')!.primaryTempId).toBe('t2');
  });
```

Mutation proof once applied: neuter the veto (drop the
`diacriticFold(occupantName) !== diacriticFold(normalizedName)` conjunct or
replace `accentVetoed` with `false`) — the tone-mark test and the
vetoed-newcomer test go RED; the one-sided test and the existing
Mcdonalds/Marios controls stay green.

Note: the tone pair is edit-distance-1, so after the veto the intra-batch
NEAR-DUPLICATE guard may nominate it to the matchEntity judge — that is the
designed polarity (a judge decides, never a silent fold); with the default
fail-closed fake ('new') both tests hold.
